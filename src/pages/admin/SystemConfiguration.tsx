import { useState, useEffect } from 'react';
import { Key, Save, Eye, EyeOff, CheckCircle, AlertTriangle, RefreshCw, TestTube } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import PageHeader from '../../components/PageHeader';

interface ConfigItem {
  key: string;
  value: string;
  description: string;
  required: boolean;
}

const CONFIG_SCHEMA: Omit<ConfigItem, 'value'>[] = [
  {
    key: 'OPENAI_API_KEY',
    description: 'OpenAI API Key for LLM-based quote parsing (gpt-4o)',
    required: true,
  },
  {
    key: 'XAI_API_KEY',
    description: 'xAI (Grok) API Key for dual-LLM parsing (optional)',
    required: false,
  },
  {
    key: 'RENDER_PDF_EXTRACTOR_API_KEY',
    description: 'External PDF Extractor Service API Key',
    required: false,
  },
  {
    key: 'RENDER_PDF_EXTRACTOR_URL',
    description: 'External PDF Extractor Service Base URL',
    required: false,
  },
];

export default function SystemConfiguration() {
  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadConfiguration();
  }, []);

  const loadConfiguration = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('system_config')
        .select('key, value');

      if (error) throw error;

      const configMap = new Map(data?.map(item => [item.key, item.value]) || []);

      const loadedConfigs = CONFIG_SCHEMA.map(schema => ({
        ...schema,
        value: configMap.get(schema.key) || '',
      }));

      setConfigs(loadedConfigs);
    } catch (error) {
      console.error('Failed to load configuration:', error);
      setMessage({ type: 'error', text: 'Failed to load system configuration' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      for (const config of configs) {
        if (!config.value && config.required) {
          throw new Error(`${config.key} is required but not set`);
        }

        if (config.value) {
          const { error } = await supabase
            .from('system_config')
            .upsert({
              key: config.key,
              value: config.value,
            }, {
              onConflict: 'key'
            });

          if (error) throw error;
        }
      }

      setMessage({ type: 'success', text: 'Configuration saved successfully' });
    } catch (error) {
      console.error('Failed to save configuration:', error);
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to save configuration'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleValueChange = (key: string, value: string) => {
    setConfigs(prev =>
      prev.map(config =>
        config.key === key ? { ...config, value } : config
      )
    );
  };

  const toggleVisibility = (key: string) => {
    setVisibleKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const getConfigStatus = (config: ConfigItem): 'ok' | 'missing' | 'optional' => {
    if (!config.value) {
      return config.required ? 'missing' : 'optional';
    }
    return 'ok';
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    setMessage(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/test_llm_parser`;
      const headers = {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
      });

      const result = await response.json();
      setTestResult(result);

      if (result.ok) {
        setMessage({
          type: 'success',
          text: result.message || 'LLM Parser is configured and working!'
        });
      } else {
        setMessage({
          type: 'error',
          text: result.message || result.error || 'Test failed'
        });
      }
    } catch (error) {
      console.error('Test failed:', error);
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to test connection'
      });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <PageHeader
        title="System Configuration"
        description="Manage API keys and system-wide settings"
        icon={<Key className="w-6 h-6" />}
      />

      {message && (
        <div
          className={`mb-6 p-4 rounded-lg flex items-start gap-3 ${
            message.type === 'success'
              ? 'bg-green-500/20 text-green-300 border border-green-500/30'
              : 'bg-red-500/20 text-red-300 border border-red-500/30'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          )}
          <p>{message.text}</p>
        </div>
      )}

      <div className="bg-white/10 backdrop-blur-sm rounded-lg border border-white/20 overflow-hidden">
        <div className="p-6 border-b border-slate-700 bg-slate-800/50">
          <h2 className="text-lg font-semibold text-white">API Keys</h2>
          <p className="text-sm text-gray-400 mt-1">
            Configure external service API keys. Required keys must be set for core functionality.
          </p>
        </div>

        <div className="divide-y divide-slate-700/50">
          {configs.map(config => {
            const status = getConfigStatus(config);
            const isVisible = visibleKeys.has(config.key);

            return (
              <div key={config.key} className="p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-white">{config.key}</h3>
                      {config.required && (
                        <span className="text-xs bg-red-500/20 text-red-300 border border-red-500/30 px-2 py-0.5 rounded">
                          Required
                        </span>
                      )}
                      {status === 'ok' && (
                        <CheckCircle className="w-4 h-4 text-green-400" />
                      )}
                      {status === 'missing' && (
                        <AlertTriangle className="w-4 h-4 text-red-400" />
                      )}
                    </div>
                    <p className="text-sm text-gray-400">{config.description}</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <input
                    type={isVisible ? 'text' : 'password'}
                    value={config.value}
                    onChange={(e) => handleValueChange(config.key, e.target.value)}
                    placeholder={`Enter ${config.key}`}
                    className="flex-1 px-3 py-2 bg-slate-800/50 border border-slate-600 text-white placeholder-gray-400 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                  <button
                    onClick={() => toggleVisibility(config.key)}
                    className="px-3 py-2 bg-slate-800/50 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors"
                    title={isVisible ? 'Hide' : 'Show'}
                  >
                    {isVisible ? (
                      <EyeOff className="w-5 h-5 text-gray-400" />
                    ) : (
                      <Eye className="w-5 h-5 text-gray-400" />
                    )}
                  </button>
                </div>

                {status === 'missing' && (
                  <p className="mt-2 text-sm text-red-300">
                    This required API key is not configured. Some features may not work.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="p-6 bg-slate-800/50 border-t border-slate-700 flex justify-between items-center">
          <div className="text-sm text-gray-400">
            {configs.filter(c => getConfigStatus(c) === 'ok').length} of{' '}
            {configs.filter(c => c.required).length} required keys configured
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleTestConnection}
              disabled={testing}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700/50 border border-slate-600 text-white rounded-lg hover:bg-slate-600/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {testing ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <TestTube className="w-4 h-4" />
              )}
              {testing ? 'Testing...' : 'Test LLM Parser'}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </div>
      </div>

      {testResult && (
        <div className={`mt-6 p-6 rounded-lg border ${
          testResult.ok
            ? 'bg-green-500/20 border-green-500/30'
            : 'bg-yellow-500/20 border-yellow-500/30'
        }`}>
          <div className="flex items-start gap-3 mb-4">
            {testResult.ok ? (
              <CheckCircle className="w-6 h-6 text-green-400 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-6 h-6 text-yellow-400 flex-shrink-0" />
            )}
            <div>
              <h3 className={`font-semibold ${testResult.ok ? 'text-green-300' : 'text-yellow-300'}`}>
                {testResult.ok ? 'Connection Test Passed' : 'Configuration Issue Detected'}
              </h3>
              <p className={`text-sm mt-1 ${testResult.ok ? 'text-green-300' : 'text-yellow-300'}`}>
                {testResult.message}
              </p>
            </div>
          </div>

          {testResult.ok && (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="bg-slate-800/50 p-3 rounded border border-green-500/30">
                <div className="text-gray-400 mb-1">Models Available</div>
                <div className="font-semibold text-green-300">{testResult.modelCount || 'N/A'}</div>
              </div>
              <div className="bg-slate-800/50 p-3 rounded border border-green-500/30">
                <div className="text-gray-400 mb-1">GPT-4 Available</div>
                <div className="font-semibold text-green-300">{testResult.gpt4Available ? 'Yes' : 'No'}</div>
              </div>
            </div>
          )}

          {!testResult.configured && testResult.instructions && (
            <div className="mt-4 p-4 bg-slate-800/50 rounded border border-yellow-500/30">
              <h4 className="font-medium text-yellow-300 mb-2">Setup Instructions</h4>
              <ol className="text-sm text-yellow-300 space-y-1 list-decimal list-inside">
                {testResult.instructions.map((instruction: string, i: number) => (
                  <li key={i}>{instruction}</li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 p-4 bg-blue-500/20 border border-blue-500/30 rounded-lg">
        <h3 className="font-medium text-blue-300 mb-2">Important Notes</h3>
        <ul className="text-sm text-blue-300 space-y-1 list-disc list-inside">
          <li>API keys are stored securely in the database</li>
          <li>OPENAI_API_KEY is required for LLM-based quote parsing</li>
          <li>Use the Test LLM Parser button to verify your configuration</li>
          <li>Changes take effect immediately for new parsing jobs</li>
          <li>Never share your API keys with unauthorized users</li>
        </ul>
      </div>
    </div>
  );
}
