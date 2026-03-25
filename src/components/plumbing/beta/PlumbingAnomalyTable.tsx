import { useState } from 'react';
import { CheckCircle2, Eye, XCircle, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import type { AnomalyEventRecord, AnomalyResolutionStatus } from '../../../lib/modules/parsers/plumbing/beta/anomalyTypes';
import { dbUpdateAnomalyStatus } from '../../../lib/db/plumbingBetaDb';

interface PlumbingAnomalyTableProps {
  anomalies: AnomalyEventRecord[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onDetailOpen: (id: string) => void;
  onRefresh: () => void;
  filters: {
    severity: string;
    anomalyType: string;
    resolutionStatus: string;
    periodDays: number;
  };
  onFilterChange: (key: string, value: string | number) => void;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'text-red-300 bg-red-500/15 border-red-500/30',
  high: 'text-orange-300 bg-orange-500/15 border-orange-500/30',
  medium: 'text-amber-300 bg-amber-500/15 border-amber-500/30',
  low: 'text-gray-400 bg-gray-800 border-gray-700',
};

const STATUS_COLORS: Record<string, string> = {
  open: 'text-red-300 bg-red-500/10',
  acknowledged: 'text-amber-300 bg-amber-500/10',
  resolved: 'text-teal-300 bg-teal-500/10',
  ignored: 'text-gray-500 bg-gray-800',
};

export default function PlumbingAnomalyTable({
  anomalies, total, page, pageSize, onPageChange, onDetailOpen, onRefresh, filters, onFilterChange,
}: PlumbingAnomalyTableProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  async function handleStatusChange(id: string, status: AnomalyResolutionStatus) {
    setBusy(id);
    try {
      await dbUpdateAnomalyStatus(id, status);
      onRefresh();
    } finally {
      setBusy(null);
    }
  }

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 gap-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-gray-500" />
          <h2 className="text-sm font-semibold text-white">Anomaly Events</h2>
          <span className="text-xs text-gray-600 font-mono">{total} total</span>
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
        >
          Filters {showFilters ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {showFilters && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-5 py-4 border-b border-gray-800 bg-gray-950/40">
          <FilterSelect label="Severity" value={filters.severity} onChange={(v) => onFilterChange('severity', v)}>
            <option value="">All severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </FilterSelect>
          <FilterSelect label="Status" value={filters.resolutionStatus} onChange={(v) => onFilterChange('resolutionStatus', v)}>
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="resolved">Resolved</option>
            <option value="ignored">Ignored</option>
          </FilterSelect>
          <FilterSelect label="Period" value={String(filters.periodDays)} onChange={(v) => onFilterChange('periodDays', Number(v))}>
            <option value="7">Last 7 days</option>
            <option value="14">Last 14 days</option>
            <option value="30">Last 30 days</option>
          </FilterSelect>
          <FilterSelect label="Type" value={filters.anomalyType} onChange={(v) => onFilterChange('anomalyType', v)}>
            <option value="">All types</option>
            <option value="parser_execution_failure">Execution failure</option>
            <option value="critical_total_delta">Critical delta</option>
            <option value="parsed_total_exceeds_document_total">Total exceeds doc</option>
            <option value="likely_duplicate_total_included">Duplicate total</option>
            <option value="large_live_shadow_total_delta">Large delta</option>
            <option value="repeated_org_failures">Repeated org failures</option>
          </FilterSelect>
        </div>
      )}

      {anomalies.length === 0 ? (
        <div className="text-center py-10 text-sm text-gray-600">No anomaly events match the current filters</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500">
                <th className="text-left px-5 py-3 font-medium">When</th>
                <th className="text-left px-3 py-3 font-medium">Severity</th>
                <th className="text-left px-3 py-3 font-medium">Type</th>
                <th className="text-left px-3 py-3 font-medium">Title</th>
                <th className="text-left px-3 py-3 font-medium">Org</th>
                <th className="text-left px-3 py-3 font-medium">Status</th>
                <th className="text-right px-5 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {anomalies.map((a) => (
                <tr key={a.id} className="hover:bg-gray-800/20 transition-colors">
                  <td className="px-5 py-3 text-gray-500 whitespace-nowrap font-mono text-[10px]">
                    {new Date(a.created_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${SEVERITY_COLORS[a.severity] ?? ''}`}>
                      {a.severity.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-mono text-[10px] text-gray-400 max-w-[140px] truncate">
                    {a.anomaly_type}
                  </td>
                  <td className="px-3 py-3 text-gray-200 max-w-[200px]">
                    <div className="truncate">{a.title}</div>
                    {a.source_id && (
                      <div className="text-[10px] text-gray-600 font-mono truncate mt-0.5">{a.source_id.slice(0, 12)}</div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-gray-500 font-mono text-[10px]">
                    {a.org_id ? a.org_id.slice(0, 8) + '…' : '—'}
                  </td>
                  <td className="px-3 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLORS[a.resolution_status] ?? ''}`}>
                      {a.resolution_status}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => onDetailOpen(a.id)}
                        className="text-gray-500 hover:text-cyan-400 transition-colors"
                        title="View detail"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      {a.resolution_status === 'open' && (
                        <button
                          onClick={() => handleStatusChange(a.id, 'acknowledged')}
                          disabled={busy === a.id}
                          className="text-gray-500 hover:text-amber-400 transition-colors"
                          title="Acknowledge"
                        >
                          <AlertTriangle className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {(a.resolution_status === 'open' || a.resolution_status === 'acknowledged') && (
                        <button
                          onClick={() => handleStatusChange(a.id, 'resolved')}
                          disabled={busy === a.id}
                          className="text-gray-500 hover:text-teal-400 transition-colors"
                          title="Resolve"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {a.resolution_status === 'open' && (
                        <button
                          onClick={() => handleStatusChange(a.id, 'ignored')}
                          disabled={busy === a.id}
                          className="text-gray-500 hover:text-gray-300 transition-colors"
                          title="Ignore"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-800">
          <span className="text-xs text-gray-600">Page {page + 1} of {totalPages}</span>
          <div className="flex gap-2">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page === 0}
              className="text-xs text-gray-400 hover:text-white disabled:opacity-30 px-3 py-1.5 rounded bg-gray-800 border border-gray-700"
            >
              Prev
            </button>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages - 1}
              className="text-xs text-gray-400 hover:text-white disabled:opacity-30 px-3 py-1.5 rounded bg-gray-800 border border-gray-700"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterSelect({ label, value, onChange, children }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-[10px] text-gray-500 block mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-xs bg-gray-800 border border-gray-700 text-gray-200 px-2 py-1.5 rounded-lg focus:outline-none"
      >
        {children}
      </select>
    </div>
  );
}
