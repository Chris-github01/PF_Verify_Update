import { useState, useEffect } from 'react';
import { Clock, User, CheckCircle, XCircle, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';

interface AuditLog {
  id: string;
  ts: string;
  user_email: string;
  role: string;
  project_id: string;
  tool_name: string;
  args_json: Record<string, unknown>;
  result_ok: boolean;
  result_json: Record<string, unknown>;
  error_message: string | null;
}

export default function CopilotAudit() {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | 'success' | 'failed'>('all');

  const loadAuditLogs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('copilot_audit')
        .select('*')
        .order('ts', { ascending: false })
        .limit(100);

      if (filter === 'success') {
        query = query.eq('result_ok', true);
      } else if (filter === 'failed') {
        query = query.eq('result_ok', false);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error loading audit logs:', error);
        return;
      }

      setAuditLogs(data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAuditLogs();
  }, [filter]);

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const formatTimestamp = (ts: string) => {
    const date = new Date(ts);
    return date.toLocaleString();
  };

  const getToolBadgeColor = (toolName: string) => {
    if (toolName.includes('verify')) return 'bg-blue-50 text-blue-700 border-blue-200';
    if (toolName.includes('compute')) return 'bg-purple-50 text-purple-700 border-purple-200';
    if (toolName.includes('approve')) return 'bg-green-50 text-green-700 border-green-200';
    if (toolName.includes('generate')) return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-gray-100 text-gray-700 border-gray-200';
  };

  const getRoleBadgeColor = (role: string) => {
    if (role === 'owner') return 'bg-red-50 text-red-700 border-red-200';
    if (role === 'estimator') return 'bg-orange-50 text-blue-700 border-orange-200';
    return 'bg-gray-100 text-gray-700 border-gray-200';
  };

  const filteredLogs = auditLogs;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold brand-navy mb-2">Copilot Audit Logs</h1>
          <p className="text-gray-600">Last 100 Copilot actions for this project</p>
        </div>
        <button
          onClick={loadAuditLogs}
          disabled={loading}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50 font-medium border border-blue-100"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-gray-700">Filter:</span>
            <div className="flex gap-2">
              <button
                onClick={() => setFilter('all')}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  filter === 'all'
                    ? 'bg-brand-primary text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilter('success')}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  filter === 'success'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Success
              </button>
              <button
                onClick={() => setFilter('failed')}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  filter === 'failed'
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Failed
              </button>
            </div>
          </div>
          <div className="text-sm text-gray-600 font-medium">
            Showing {filteredLogs.length} log{filteredLogs.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <RefreshCw className="animate-spin mx-auto mb-4 text-blue-600" size={48} />
          <p className="text-gray-600">Loading audit logs...</p>
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <p className="text-gray-600">No audit logs found</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    <div className="flex items-center gap-2">
                      <Clock size={14} />
                      <span>Time</span>
                    </div>
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    <div className="flex items-center gap-2">
                      <User size={14} />
                      <span>User</span>
                    </div>
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Tool
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredLogs.map((log) => (
                  <motion.tr
                    key={log.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {formatTimestamp(log.ts)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {log.user_email}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${getRoleBadgeColor(
                          log.role
                        )}`}
                      >
                        {log.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${getToolBadgeColor(
                          log.tool_name
                        )}`}
                      >
                        {log.tool_name}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {log.result_ok ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium border border-green-200">
                          <CheckCircle size={14} />
                          <span>Success</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-50 text-red-700 rounded-full text-xs font-medium border border-red-200">
                          <XCircle size={14} />
                          <span>Failed</span>
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => toggleRow(log.id)}
                        className="flex items-center gap-1 text-sm brand-primary hover:underline transition-colors font-medium"
                      >
                        {expandedRows.has(log.id) ? (
                          <ChevronDown size={16} />
                        ) : (
                          <ChevronRight size={16} />
                        )}
                        <span>View</span>
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          {Array.from(expandedRows).map((id) => {
            const log = filteredLogs.find((l) => l.id === id);
            if (!log) return null;

            return (
              <motion.div
                key={`details-${id}`}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="border-t border-gray-200 bg-gray-50 p-6"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-xs font-semibold text-gray-700 uppercase mb-3">
                      Arguments
                    </h4>
                    <pre className="text-xs text-gray-900 bg-white p-4 rounded-lg border border-gray-200 overflow-x-auto">
                      {JSON.stringify(log.args_json, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-gray-700 uppercase mb-3">
                      Result
                    </h4>
                    <pre className="text-xs text-gray-900 bg-white p-4 rounded-lg border border-gray-200 overflow-x-auto">
                      {JSON.stringify(log.result_json, null, 2)}
                    </pre>
                  </div>
                </div>
                {log.error_message && (
                  <div className="mt-6">
                    <h4 className="text-xs font-semibold text-red-700 uppercase mb-3">
                      Error Message
                    </h4>
                    <p className="text-sm text-red-700 bg-red-50 p-4 rounded-lg border border-red-200">
                      {log.error_message}
                    </p>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
