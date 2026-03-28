import { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck, RefreshCw, AlertTriangle, CheckCircle2,
  XCircle, ChevronDown, ChevronRight, Clock, BarChart2,
  Info, Scale, Layers, FileSearch,
} from 'lucide-react';
import ShadowLayout from '../../components/shadow/ShadowLayout';
import { getAllValidationResults, getValidationForRun } from '../../lib/commercial-validation/commercialValidationEngine';
import type { CommercialValidationResult, ValidationNote, ValidationStatus } from '../../lib/commercial-validation/types';

const NZD = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 });
const PCT = (n: number) => `${(n * 100).toFixed(1)}%`;

function statusColor(status: ValidationStatus) {
  if (status === 'validated') return { bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-400', dot: 'bg-green-400' };
  if (status === 'conditional') return { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400', dot: 'bg-amber-400' };
  return { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', dot: 'bg-red-400' };
}

function statusLabel(status: ValidationStatus) {
  if (status === 'validated') return 'Validated';
  if (status === 'conditional') return 'Conditional';
  return 'Not Comparable';
}

function checkStatusIcon(status: 'pass' | 'warn' | 'fail') {
  if (status === 'pass') return <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />;
  if (status === 'warn') return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />;
  return <XCircle className="w-4 h-4 text-red-400 shrink-0" />;
}

function scoreBar(score: number, good = 0.8, warn = 0.55) {
  const pct = Math.min(1, Math.max(0, score));
  const color = pct >= good ? 'bg-green-500' : pct >= warn ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 bg-gray-800 rounded-full h-1.5 min-w-[60px]">
        <div className={`h-1.5 rounded-full ${color} transition-all`} style={{ width: `${pct * 100}%` }} />
      </div>
      <span className="text-xs text-gray-400 shrink-0 w-10 text-right">{PCT(pct)}</span>
    </div>
  );
}

const CHECKLIST_CONFIG: Array<{
  key: keyof CommercialValidationResult;
  label: string;
  isBoolean?: boolean;
  scoreKey?: keyof CommercialValidationResult;
  good?: number;
  warn?: number;
}> = [
  { key: 'quantity_alignment_score', label: 'Quantity Alignment', good: 0.8, warn: 0.5 },
  { key: 'match_confidence_score', label: 'Match Confidence', good: 0.75, warn: 0.55 },
  { key: 'optionals_normalized', label: 'Optionals Normalized', isBoolean: true },
  { key: 'provisional_risk_score', label: 'Provisional Risk', good: 0, warn: 0.1 },
  { key: 'exclusion_mismatch_score', label: 'Exclusions Alignment', good: 0, warn: 1 },
  { key: 'scope_completeness_variance', label: 'Scope Completeness', good: 0, warn: 0.15 },
];

function ValidationResultDetail({ result }: { result: CommercialValidationResult }) {
  const [notesOpen, setNotesOpen] = useState(false);
  const colors = statusColor(result.validation_status);

  return (
    <div className="space-y-5">
      {/* Status Banner */}
      <div className={`flex items-center gap-3 px-5 py-4 rounded-xl border ${colors.bg} ${colors.border}`}>
        <div className={`w-3 h-3 rounded-full ${colors.dot} shrink-0`} />
        <div className="flex-1">
          <div className={`text-base font-semibold ${colors.text}`}>{statusLabel(result.validation_status)}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {result.comparable_suppliers} of {result.total_suppliers} suppliers comparable
            {' · '}
            {result.trade_key.replace(/_/g, ' ')}
            {' · '}
            {result.created_at ? new Date(result.created_at).toLocaleString() : '—'}
          </div>
        </div>
        <div className="text-xs font-mono text-gray-600">{result.run_id?.slice(0, 8)}...</div>
      </div>

      {/* Gating outcome */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
        <div className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wider">Award Recommendation Gating Outcome</div>
        {result.validation_status === 'validated' && (
          <div className="flex items-center gap-2 text-green-300 text-sm font-medium">
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            "Best Tenderer" will be displayed normally
          </div>
        )}
        {result.validation_status === 'conditional' && (
          <div className="flex items-center gap-2 text-amber-300 text-sm font-medium">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            "Lowest Price (Subject to Commercial Review)" will be displayed instead
          </div>
        )}
        {result.validation_status === 'not_comparable' && (
          <div className="flex items-center gap-2 text-red-300 text-sm font-medium">
            <XCircle className="w-4 h-4 text-red-400" />
            "Comparison Not Commercially Valid" will be displayed instead
          </div>
        )}
      </div>

      {/* Checklist Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-white">Validation Checklist</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left px-5 py-2.5 text-xs font-medium text-gray-500">Check</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500">Status</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500 min-w-[140px]">Score</th>
            </tr>
          </thead>
          <tbody>
            {CHECKLIST_CONFIG.map((cfg) => {
              const rawValue = result[cfg.key];
              const numValue = typeof rawValue === 'number' ? rawValue : 0;
              const boolValue = typeof rawValue === 'boolean' ? rawValue : false;

              let checkStatus: 'pass' | 'warn' | 'fail' = 'pass';
              if (cfg.isBoolean) {
                checkStatus = (result.has_optionals && !boolValue) ? 'warn' : 'pass';
              } else if (cfg.key === 'exclusion_mismatch_score') {
                checkStatus = numValue === 0 ? 'pass' : numValue === 1 ? 'warn' : 'fail';
              } else if (cfg.key === 'provisional_risk_score') {
                checkStatus = numValue === 0 ? 'pass' : numValue <= 0.1 ? 'warn' : 'fail';
              } else if (cfg.key === 'scope_completeness_variance') {
                checkStatus = numValue <= 0.15 ? 'pass' : numValue <= 0.30 ? 'warn' : 'fail';
              } else {
                checkStatus = numValue >= (cfg.good ?? 0.8) ? 'pass' : numValue >= (cfg.warn ?? 0.55) ? 'warn' : 'fail';
              }

              return (
                <tr key={cfg.key as string} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                  <td className="px-5 py-3 text-sm text-gray-300">{cfg.label}</td>
                  <td className="px-3 py-3">{checkStatusIcon(checkStatus)}</td>
                  <td className="px-3 py-3">
                    {cfg.isBoolean ? (
                      <span className={`text-xs font-medium ${boolValue ? 'text-green-400' : result.has_optionals ? 'text-amber-400' : 'text-gray-500'}`}>
                        {result.has_optionals ? (boolValue ? 'Yes' : 'No') : 'N/A'}
                      </span>
                    ) : cfg.key === 'exclusion_mismatch_score' ? (
                      <span className={`text-xs font-mono ${numValue === 0 ? 'text-green-400' : numValue === 1 ? 'text-amber-400' : 'text-red-400'}`}>
                        {numValue === 0 ? 'Aligned' : numValue === 1 ? 'Minor diff' : 'Material diff'}
                      </span>
                    ) : (
                      scoreBar(numValue, cfg.good, cfg.warn)
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Notes Panel */}
      {result.validation_notes && result.validation_notes.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <button
            onClick={() => setNotesOpen((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-800/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-semibold text-white">Validation Notes</span>
              <span className="text-xs text-gray-500">({result.validation_notes.length} checks)</span>
            </div>
            {notesOpen ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
          </button>
          {notesOpen && (
            <div className="border-t border-gray-800 divide-y divide-gray-800/50">
              {result.validation_notes.map((note: ValidationNote, i: number) => (
                <div key={i} className="flex items-start gap-3 px-5 py-3">
                  {checkStatusIcon(note.status)}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-gray-300 mb-0.5">{note.check}</div>
                    <div className="text-xs text-gray-500">{note.message}</div>
                    {note.score != null && (
                      <div className="text-xs font-mono text-gray-600 mt-0.5">score: {typeof note.score === 'number' ? note.score.toFixed(3) : note.score}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CommercialValidationDashboard() {
  const [results, setResults] = useState<CommercialValidationResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<CommercialValidationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [lookupRunId, setLookupRunId] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAllValidationResults(50);
      setResults(data);
      if (data.length > 0 && !selectedResult) {
        setSelectedResult(data[0]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleLookup() {
    if (!lookupRunId.trim()) return;
    setLookupLoading(true);
    setLookupError(null);
    try {
      const result = await getValidationForRun(lookupRunId.trim());
      if (!result) {
        setLookupError('No validation result found for this run ID');
      } else {
        setSelectedResult(result);
        if (!results.find((r) => r.run_id === result.run_id)) {
          setResults((prev) => [result, ...prev]);
        }
      }
    } finally {
      setLookupLoading(false);
    }
  }

  const statusCounts = results.reduce(
    (acc, r) => {
      acc[r.validation_status] = (acc[r.validation_status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <ShadowLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="w-5 h-5 text-amber-400" />
              <h1 className="text-xl font-bold text-white">Commercial Validation</h1>
            </div>
            <p className="text-sm text-gray-500">
              Gating layer between Quantity Intelligence and Best Tenderer recommendation
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-white disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Validated', key: 'validated', color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20' },
            { label: 'Conditional', key: 'conditional', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
            { label: 'Not Comparable', key: 'not_comparable', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
          ].map((s) => (
            <div key={s.key} className={`${s.bg} border ${s.border} rounded-xl px-4 py-3`}>
              <div className={`text-2xl font-bold ${s.color}`}>{statusCounts[s.key] ?? 0}</div>
              <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Lookup by Run ID */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
          <div className="text-xs text-gray-500 mb-2 font-medium">Lookup by Run ID</div>
          <div className="flex gap-2">
            <input
              value={lookupRunId}
              onChange={(e) => setLookupRunId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
              placeholder="Paste a Quantity Intelligence run_id..."
              className="flex-1 px-3 py-2 text-xs bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-amber-500/50"
            />
            <button
              onClick={handleLookup}
              disabled={lookupLoading || !lookupRunId.trim()}
              className="flex items-center gap-1.5 px-4 py-2 text-xs bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:text-amber-300 rounded-lg disabled:opacity-50 transition-colors"
            >
              {lookupLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileSearch className="w-3.5 h-3.5" />}
              Lookup
            </button>
          </div>
          {lookupError && <p className="text-xs text-red-400 mt-2">{lookupError}</p>}
        </div>

        <div className="grid lg:grid-cols-[320px_1fr] gap-5">
          {/* Run List */}
          <div className="space-y-2">
            <div className="text-xs text-gray-600 px-1 font-medium">Recent Validations ({results.length})</div>
            {loading ? (
              <div className="text-center py-8 text-gray-600 text-xs">Loading...</div>
            ) : results.length === 0 ? (
              <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-8 text-center">
                <Layers className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                <p className="text-xs text-gray-600">No validation results yet.</p>
                <p className="text-xs text-gray-700 mt-1">Run Quantity Intelligence to generate validations.</p>
              </div>
            ) : (
              results.map((r) => {
                const colors = statusColor(r.validation_status);
                const isSelected = selectedResult?.run_id === r.run_id;
                return (
                  <button
                    key={r.run_id}
                    onClick={() => setSelectedResult(r)}
                    className={`w-full text-left rounded-xl border px-4 py-3 transition-all ${
                      isSelected
                        ? `${colors.bg} ${colors.border}`
                        : 'bg-gray-900 border-gray-800 hover:border-gray-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${colors.dot} shrink-0`} />
                        <span className={`text-xs font-semibold ${colors.text}`}>{statusLabel(r.validation_status)}</span>
                      </div>
                      <span className="text-[10px] font-mono text-gray-600">{r.run_id?.slice(0, 8)}</span>
                    </div>
                    <div className="text-xs text-gray-400">{r.trade_key.replace(/_/g, ' ')}</div>
                    <div className="text-[10px] text-gray-600 mt-0.5">
                      {r.comparable_suppliers}/{r.total_suppliers} suppliers
                      {' · '}
                      {r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Detail */}
          <div>
            {selectedResult ? (
              <ValidationResultDetail result={selectedResult} />
            ) : (
              <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-12 text-center">
                <BarChart2 className="w-10 h-10 text-gray-700 mx-auto mb-3" />
                <p className="text-sm text-gray-500">Select a validation result to view details</p>
              </div>
            )}
          </div>
        </div>

        {/* Module Info */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4 space-y-2">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-gray-600" />
            <span className="text-xs font-semibold text-gray-400">Module: commercial_validation_engine</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-gray-600">
            <div><span className="text-gray-500">Position:</span> After Quantity Intelligence</div>
            <div><span className="text-gray-500">Gates:</span> Best Tenderer display</div>
            <div><span className="text-gray-500">Checks:</span> 7 validation checks</div>
            <div><span className="text-gray-500">Table:</span> commercial_validation_results</div>
          </div>
          <div className="text-xs text-gray-700 pt-1 border-t border-gray-800">
            This module does NOT modify any parser logic, scoring, or normalization. It is a read-only validation and gating layer.
          </div>
        </div>
      </div>
    </ShadowLayout>
  );
}
