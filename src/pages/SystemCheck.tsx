import { useState, useEffect } from 'react';
import { Play, Wrench, CheckCircle2, AlertCircle, Clock, RefreshCw, Key } from 'lucide-react';

interface CheckResult {
  area: string;
  name: string;
  status: 'pass' | 'fail' | 'fixed';
  detail: string;
  fixHint?: string;
}

interface OpenAICheckResult {
  ok: boolean;
  error?: string;
  message?: string;
  modelCount?: number;
  gpt4Available?: boolean;
}

interface VerificationResponse {
  passed: number;
  failed: number;
  fixed: number;
  checks: CheckResult[];
  timestamp: string;
}

export default function SystemCheck() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerificationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openaiCheck, setOpenaiCheck] = useState<OpenAICheckResult | null>(null);
  const [checkingOpenAI, setCheckingOpenAI] = useState(false);

  useEffect(() => {
    checkOpenAIConnection();
  }, []);

  const checkOpenAIConnection = async () => {
    setCheckingOpenAI(true);
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/test_openai_connection`;
      const headers = {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
      });

      if (response.ok) {
        const data = await response.json();
        setOpenaiCheck(data);
      } else {
        setOpenaiCheck({
          ok: false,
          error: 'Failed to check OpenAI connection',
        });
      }
    } catch (err) {
      setOpenaiCheck({
        ok: false,
        error: 'Network error while checking OpenAI connection',
      });
    } finally {
      setCheckingOpenAI(false);
    }
  };

  const runCheck = async (autoFix: boolean) => {
    setLoading(true);
    setError(null);

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify_installation`;
      const headers = {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ autoFix }),
      });

      if (!response.ok) {
        throw new Error('Failed to run system check');
      }

      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'An error occurred while running the system check');
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: 'pass' | 'fail' | 'fixed') => {
    switch (status) {
      case 'pass':
        return <span className="text-2xl">🟢</span>;
      case 'fixed':
        return <span className="text-2xl">🟡</span>;
      case 'fail':
        return <span className="text-2xl">🔴</span>;
    }
  };

  const getStatusText = (status: 'pass' | 'fail' | 'fixed') => {
    switch (status) {
      case 'pass':
        return 'Pass';
      case 'fixed':
        return 'Fixed';
      case 'fail':
        return 'Fail';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="space-y-6 px-8 py-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <h1 className="text-3xl font-semibold brand-navy mb-2">Verify+ System Audit</h1>
            <p className="text-gray-600 text-base">
              Comprehensive system health check and automatic issue resolution
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => runCheck(false)}
              disabled={loading}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed font-medium text-sm"
            >
              {loading ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play size={18} />
                  Run Check
                </>
              )}
            </button>
            <button
              onClick={() => runCheck(true)}
              disabled={loading}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed font-medium text-sm"
            >
              {loading ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Wrench size={18} />
                  Run & Auto-Fix
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <Key className="text-blue-600" size={20} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">OpenAI API Configuration</h3>
              <p className="text-sm text-gray-600 mt-0.5">Required for Verify+ Copilot functionality</p>
            </div>
          </div>
          <button
            onClick={checkOpenAIConnection}
            disabled={checkingOpenAI}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white text-blue-700 rounded-full hover:bg-blue-50 transition-colors disabled:opacity-50 font-medium border border-blue-200"
          >
            <RefreshCw size={14} className={checkingOpenAI ? 'animate-spin' : ''} />
            Recheck
          </button>
        </div>

        {checkingOpenAI && (
          <div className="flex items-center gap-2 text-gray-600">
            <RefreshCw size={16} className="animate-spin" />
            <span className="text-sm">Checking OpenAI connection...</span>
          </div>
        )}

        {!checkingOpenAI && openaiCheck && (
          <div className={`rounded-lg p-4 ${openaiCheck.ok ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            <div className="flex items-start gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${openaiCheck.ok ? 'bg-green-100' : 'bg-red-100'}`}>
                {openaiCheck.ok ? (
                  <CheckCircle2 className="text-green-600" size={18} />
                ) : (
                  <AlertCircle className="text-red-600" size={18} />
                )}
              </div>
              <div className="flex-1">
                <h4 className={`font-semibold text-sm mb-1 ${openaiCheck.ok ? 'text-green-900' : 'text-red-900'}`}>
                  {openaiCheck.ok ? 'Connected' : 'Not Configured'}
                </h4>
                <p className={`text-xs mb-2 ${openaiCheck.ok ? 'text-green-700' : 'text-red-700'}`}>
                  {openaiCheck.message || openaiCheck.error || 'Unknown status'}
                </p>
                {openaiCheck.ok && (
                  <div className="text-xs text-green-700 space-y-1 mt-2">
                    <div>Models available: <span className="font-semibold">{openaiCheck.modelCount}</span></div>
                    <div>GPT-4 access: <span className="font-semibold">{openaiCheck.gpt4Available ? 'Yes' : 'No'}</span></div>
                  </div>
                )}
                {!openaiCheck.ok && (
                  <div className="mt-3 p-4 bg-white rounded-lg border border-red-200">
                    <p className="text-sm text-red-900 font-semibold mb-3">Setup Instructions:</p>
                    <ol className="text-sm text-red-800 space-y-2 list-decimal list-inside">
                      <li>Go to Supabase Dashboard</li>
                      <li>Navigate to Project Settings → Edge Functions → Secrets</li>
                      <li>Add a new secret named <code className="bg-red-100 px-2 py-0.5 rounded font-mono text-xs">OPENAI_API_KEY</code></li>
                      <li>Paste your OpenAI API key as the value</li>
                      <li>Click "Recheck" above to verify</li>
                    </ol>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
              <AlertCircle className="text-red-600" size={18} />
            </div>
            <div>
              <h3 className="font-semibold text-red-900 mb-1 text-sm">Error</h3>
              <p className="text-red-700 text-xs">{error}</p>
            </div>
          </div>
        </div>
      )}

      {result && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-gray-600 mb-2 uppercase">Passed</div>
                  <div className="text-2xl font-bold text-green-600">{result.passed}</div>
                </div>
                <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center">
                  <CheckCircle2 size={24} className="text-green-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-gray-600 mb-2 uppercase">Failed</div>
                  <div className="text-2xl font-bold text-red-600">{result.failed}</div>
                </div>
                <div className="w-12 h-12 bg-red-50 rounded-lg flex items-center justify-center">
                  <AlertCircle size={24} className="text-red-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-gray-600 mb-2 uppercase">Fixed</div>
                  <div className="text-2xl font-bold text-amber-600">{result.fixed}</div>
                </div>
                <div className="w-12 h-12 bg-amber-50 rounded-lg flex items-center justify-center">
                  <Wrench size={24} className="text-amber-600" />
                </div>
              </div>
            </div>
          </div>

          {result.failed > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="text-amber-600" size={18} />
                </div>
                <div>
                  <h3 className="font-semibold text-amber-900 mb-1 text-sm">
                    {result.failed} check{result.failed !== 1 ? 's' : ''} failed
                  </h3>
                  <p className="text-amber-700 text-xs">
                    Run & Auto-Fix recommended to resolve these issues automatically
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Area
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Detail
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Fix Hint
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {result.checks.map((check, index) => (
                    <tr
                      key={index}
                      className={`hover:bg-gray-50 transition-colors ${
                        check.status === 'fail' ? 'bg-red-50' : ''
                      }`}
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {check.area}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {check.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(check.status)}
                          <span
                            className={`text-sm font-medium ${
                              check.status === 'pass'
                                ? 'text-green-700'
                                : check.status === 'fixed'
                                ? 'text-amber-700'
                                : 'text-red-700'
                            }`}
                          >
                            {getStatusText(check.status)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">{check.detail}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {check.fixHint || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl border border-gray-200 px-6 py-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm">
              <div className="flex items-center gap-2 text-gray-600">
                <Clock size={16} />
                <span>Last check: {formatTimestamp(result.timestamp)}</span>
              </div>
              <div className="text-gray-500 font-medium">
                PassiveFire Verify+ v1.0.0
              </div>
            </div>
          </div>
        </>
      )}

      {!result && !loading && !error && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <div className="max-w-md mx-auto">
            <div className="w-16 h-16 bg-blue-50 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Play size={32} className="text-blue-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Ready to Check System Health
            </h3>
            <p className="text-gray-600 text-sm mb-6 leading-relaxed">
              Run a comprehensive system audit to verify your installation and identify any issues.
              Use Auto-Fix to automatically resolve common problems.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <button
                onClick={() => runCheck(false)}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
              >
                <Play size={18} />
                Run Check
              </button>
              <button
                onClick={() => runCheck(true)}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium text-sm"
              >
                <Wrench size={18} />
                Run & Auto-Fix
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
