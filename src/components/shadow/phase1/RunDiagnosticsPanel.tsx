import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { Activity, AlertTriangle, CheckCircle, Info } from 'lucide-react';

interface DiagnosticsRecord {
  id: string;
  run_id: string;
  supplier_name_normalized: string | null;
  template_family_id: string | null;
  document_format_family: string | null;
  table_style: string | null;
  total_style: string | null;
  gst_mode: string | null;
  page_count: number | null;
  line_item_count: number | null;
  section_count: number | null;
  confidence_score: number;
  anomaly_count: number;
  anomaly_flags_json: Array<{ code: string; description: string; severity: string }>;
  raw_diagnostics_json: Record<string, unknown>;
  created_at: string;
}

interface Props {
  runId: string;
}

function confidenceColor(score: number): string {
  if (score >= 80) return 'text-teal-300';
  if (score >= 55) return 'text-amber-300';
  return 'text-red-400';
}

function severityColor(severity: string): string {
  if (severity === 'critical') return 'bg-red-900/40 border-red-700 text-red-300';
  if (severity === 'high') return 'bg-orange-900/40 border-orange-700 text-orange-300';
  if (severity === 'medium') return 'bg-amber-900/40 border-amber-700 text-amber-300';
  if (severity === 'low') return 'bg-blue-900/40 border-blue-700 text-blue-300';
  return 'bg-gray-800 border-gray-700 text-gray-400';
}

export default function RunDiagnosticsPanel({ runId }: Props) {
  const [diagnostics, setDiagnostics] = useState<DiagnosticsRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [runId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('shadow_run_diagnostics')
        .select('*')
        .eq('run_id', runId)
        .maybeSingle();
      if (err) throw err;
      setDiagnostics(data as DiagnosticsRecord | null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load diagnostics');
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="py-8 text-center text-gray-500 text-sm">Loading diagnostics...</div>;
  if (error) return <div className="py-4 text-red-400 text-sm">{error}</div>;
  if (!diagnostics) {
    return (
      <div className="py-8 text-center text-gray-600 text-sm flex flex-col items-center gap-2">
        <Info className="w-5 h-5" />
        No diagnostics recorded for this run. Diagnostics are captured on new runs going forward.
      </div>
    );
  }

  const anomalies = Array.isArray(diagnostics.anomaly_flags_json) ? diagnostics.anomaly_flags_json : [];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-gray-950 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Confidence Score</div>
          <div className={`text-2xl font-bold ${confidenceColor(diagnostics.confidence_score)}`}>
            {diagnostics.confidence_score}
          </div>
          <div className="text-[10px] text-gray-600 mt-0.5">out of 100</div>
        </div>
        <div className="bg-gray-950 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Anomalies</div>
          <div className={`text-2xl font-bold ${diagnostics.anomaly_count > 0 ? 'text-amber-400' : 'text-teal-300'}`}>
            {diagnostics.anomaly_count}
          </div>
          <div className="text-[10px] text-gray-600 mt-0.5">flags detected</div>
        </div>
        <div className="bg-gray-950 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Line Items</div>
          <div className="text-2xl font-bold text-white">{diagnostics.line_item_count ?? '—'}</div>
          <div className="text-[10px] text-gray-600 mt-0.5">resolved</div>
        </div>
        <div className="bg-gray-950 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Table Style</div>
          <div className="text-sm font-medium text-white font-mono">{diagnostics.table_style ?? '—'}</div>
          <div className="text-[10px] text-gray-600 mt-0.5">detected</div>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-gray-400">
          <Activity className="w-3.5 h-3.5" />
          Document Profile
        </div>
        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2">
          {[
            ['Supplier (normalized)', diagnostics.supplier_name_normalized ?? '—'],
            ['Document Format Family', diagnostics.document_format_family ?? '—'],
            ['Total Style', diagnostics.total_style ?? '—'],
            ['GST Mode', diagnostics.gst_mode ?? '—'],
            ['Page Count', diagnostics.page_count?.toString() ?? '—'],
            ['Section Count', diagnostics.section_count?.toString() ?? '—'],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between text-xs border-b border-gray-800 py-1.5">
              <span className="text-gray-500">{label}</span>
              <span className="text-white font-mono">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {anomalies.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-400">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            Anomaly Flags ({anomalies.length})
          </div>
          {anomalies.map((flag, i) => (
            <div key={i} className={`flex items-start gap-3 border rounded-lg px-3 py-2.5 text-xs ${severityColor(flag.severity)}`}>
              <span className="font-mono font-semibold shrink-0 mt-0.5">{flag.code}</span>
              <span className="opacity-80">{flag.description}</span>
              <span className="ml-auto shrink-0 font-semibold uppercase tracking-wide text-[10px]">{flag.severity}</span>
            </div>
          ))}
        </div>
      )}

      {anomalies.length === 0 && (
        <div className="flex items-center gap-2 text-xs text-teal-400">
          <CheckCircle className="w-4 h-4" />
          No anomaly flags detected for this run.
        </div>
      )}
    </div>
  );
}
