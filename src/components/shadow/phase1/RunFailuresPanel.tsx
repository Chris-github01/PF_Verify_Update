import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { ShieldAlert, CheckCircle, Info } from 'lucide-react';
import { SEVERITY_WEIGHTS } from '../../../lib/shadow/phase1/failureClassifier';

interface FailureRecord {
  id: string;
  run_id: string;
  failure_code: string;
  severity: string;
  confidence: number;
  financial_impact_estimate: number | null;
  notes: string | null;
  created_at: string;
}

interface FailureTypeRecord {
  failure_code: string;
  title: string;
  description: string;
  severity: string;
  business_impact_type: string;
}

interface Props {
  runId: string;
}

function severityBadgeClass(severity: string): string {
  if (severity === 'critical') return 'bg-red-900/50 text-red-300 border-red-700';
  if (severity === 'high') return 'bg-orange-900/50 text-orange-300 border-orange-700';
  if (severity === 'medium') return 'bg-amber-900/50 text-amber-300 border-amber-700';
  if (severity === 'low') return 'bg-blue-900/50 text-blue-300 border-blue-700';
  return 'bg-gray-800 text-gray-400 border-gray-700';
}

function impactBadgeClass(type: string): string {
  if (type === 'financial') return 'text-teal-300';
  if (type === 'accuracy') return 'text-blue-300';
  if (type === 'completeness') return 'text-amber-300';
  if (type === 'risk') return 'text-red-300';
  return 'text-gray-400';
}

function formatCurrency(n: number | null): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 }).format(n);
}

export default function RunFailuresPanel({ runId }: Props) {
  const [failures, setFailures] = useState<FailureRecord[]>([]);
  const [typeMap, setTypeMap] = useState<Record<string, FailureTypeRecord>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [runId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [failRes, typeRes] = await Promise.all([
        supabase.from('shadow_run_failures').select('*').eq('run_id', runId).order('created_at'),
        supabase.from('shadow_failure_types').select('failure_code,title,description,severity,business_impact_type').eq('active', true),
      ]);
      if (failRes.error) throw failRes.error;
      if (typeRes.error) throw typeRes.error;
      setFailures((failRes.data ?? []) as FailureRecord[]);
      const map: Record<string, FailureTypeRecord> = {};
      for (const t of (typeRes.data ?? [])) map[t.failure_code] = t as FailureTypeRecord;
      setTypeMap(map);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load failures');
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="py-8 text-center text-gray-500 text-sm">Loading failure analysis...</div>;
  if (error) return <div className="py-4 text-red-400 text-sm">{error}</div>;

  if (failures.length === 0) {
    return (
      <div className="py-8 text-center flex flex-col items-center gap-2">
        <CheckCircle className="w-6 h-6 text-teal-400" />
        <div className="text-sm text-teal-300 font-medium">No failures classified for this run.</div>
        <div className="text-xs text-gray-600">The failure classifier found no issues meeting the detection threshold.</div>
      </div>
    );
  }

  const totalWeightedSeverity = failures.reduce((sum, f) => {
    return sum + (SEVERITY_WEIGHTS[f.severity as keyof typeof SEVERITY_WEIGHTS] ?? 1);
  }, 0);

  const totalFinancialImpact = failures.reduce((sum, f) => sum + (f.financial_impact_estimate ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-950 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Failures</div>
          <div className="text-2xl font-bold text-red-400">{failures.length}</div>
          <div className="text-[10px] text-gray-600 mt-0.5">classified</div>
        </div>
        <div className="bg-gray-950 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Severity Score</div>
          <div className="text-2xl font-bold text-amber-400">{totalWeightedSeverity}</div>
          <div className="text-[10px] text-gray-600 mt-0.5">weighted total</div>
        </div>
        <div className="bg-gray-950 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Financial Impact</div>
          <div className="text-lg font-bold text-white">{formatCurrency(totalFinancialImpact || null)}</div>
          <div className="text-[10px] text-gray-600 mt-0.5">estimated</div>
        </div>
      </div>

      <div className="space-y-3">
        {failures.map((f) => {
          const type = typeMap[f.failure_code];
          return (
            <div key={f.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
              <div className="flex items-start gap-3">
                <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white">{type?.title ?? f.failure_code}</span>
                    <span className={`text-[10px] font-semibold border px-1.5 py-0.5 rounded uppercase tracking-wide ${severityBadgeClass(f.severity)}`}>
                      {f.severity}
                    </span>
                    {type?.business_impact_type && (
                      <span className={`text-[10px] ${impactBadgeClass(type.business_impact_type)}`}>
                        {type.business_impact_type}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 font-mono mt-0.5">{f.failure_code}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs text-gray-500">confidence</div>
                  <div className="text-sm font-semibold text-white">{(f.confidence * 100).toFixed(0)}%</div>
                </div>
              </div>
              {f.notes && (
                <div className="text-xs text-gray-400 pl-7">{f.notes}</div>
              )}
              {f.financial_impact_estimate != null && (
                <div className="flex items-center gap-1.5 pl-7 text-xs text-teal-400">
                  <Info className="w-3 h-3" />
                  Estimated financial impact: {formatCurrency(f.financial_impact_estimate)}
                </div>
              )}
              {type?.description && (
                <div className="text-[11px] text-gray-600 pl-7 italic">{type.description}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
