import { useState, useEffect } from 'react';
import { Key, Save, Eye, EyeOff, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react';
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
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
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
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

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200 bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-900">API Keys</h2>
          <p className="text-sm text-gray-600 mt-1">
            Configure external service API keys. Required keys must be set for core functionality.
          </p>
        </div>

        <div className="divide-y divide-gray-200">
          {configs.map(config => {
            const status = getConfigStatus(config);
            const isVisible = visibleKeys.has(config.key);

            return (
              <div key={config.key} className="p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-gray-900">{config.key}</h3>
                      {config.required && (
                        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">
                          Required
                        </span>
                      )}
                      {status === 'ok' && (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      )}
                      {status === 'missing' && (
                        <AlertTriangle className="w-4 h-4 text-red-600" />
                      )}
                    </div>
                    <p className="text-sm text-gray-600">{config.description}</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <input
                    type={isVisible ? 'text' : 'password'}
                    value={config.value}
                    onChange={(e) => handleValueChange(config.key, e.target.value)}
                    placeholder={`Enter ${config.key}`}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    onClick={() => toggleVisibility(config.key)}
                    className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    title={isVisible ? 'Hide' : 'Show'}
                  >
                    {isVisible ? (
                      <EyeOff className="w-5 h-5 text-gray-600" />
                    ) : (
                      <Eye className="w-5 h-5 text-gray-600" />
                    )}
                  </button>
                </div>

                {status === 'missing' && (
                  <p className="mt-2 text-sm text-red-600">
                    This required API key is not configured. Some features may not work.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="p-6 bg-gray-50 border-t border-gray-200 flex justify-between items-center">
          <div className="text-sm text-gray-600">
            {configs.filter(c => getConfigStatus(c) === 'ok').length} of{' '}
            {configs.filter(c => c.required).length} required keys configured
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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

      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 className="font-medium text-blue-900 mb-2">Important Notes</h3>
        <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
          <li>API keys are stored securely in the database</li>
          <li>OPENAI_API_KEY is required for LLM-based quote parsing</li>
          <li>Changes take effect immediately for new parsing jobs</li>
          <li>Never share your API keys with unauthorized users</li>
        </ul>
      </div>
    </div>
  );
}
