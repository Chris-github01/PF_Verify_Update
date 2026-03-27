import { useEffect, useState } from 'react';
import { getDocumentTruthValidation } from '../../../lib/shadow/phase1/shadowDocumentTruth';
import { CheckCircle, AlertTriangle, XCircle, Info, ChevronUp, ChevronDown } from 'lucide-react';

interface ValidationRecord {
  id: string;
  run_id: string;
  detected_document_total: number | null;
  validated_document_total: number | null;
  selected_anchor_type: string | null;
  extraction_mismatch: boolean;
  mismatch_reason: string | null;
  true_missing_value: number | null;
  extraction_failure: boolean;
  created_at: string;
}

interface CandidateRecord {
  id: string;
  run_id: string;
  value: number;
  anchor_type: string;
  source_text: string | null;
  normalized_source_text: string | null;
  confidence: number;
  ranking_score: number;
  selected: boolean;
  rejected_reason: string | null;
  page: number | null;
  line_index: number | null;
  created_at: string;
}

interface Props {
  runId: string;
}

function fmt(n: number | null): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 }).format(n);
}

function anchorPriorityLabel(anchorType: string): string {
  const map: Record<string, string> = {
    explicit_total_price: 'P1 — Explicit Total Price',
    explicit_grand_total: 'P2 — Explicit Grand Total',
    explicit_contract_total: 'P3 — Explicit Contract Total',
    explicit_final_total: 'P4 — Explicit Final Total',
    final_total_row: 'P5 — Final Total Row',
    strong_summary_row: 'P6 — Strong Summary Row',
    max_summary_fallback: 'P7 — Max Summary Fallback',
    detected_fallback: 'P8 — Detected Fallback',
  };
  return map[anchorType] ?? anchorType;
}

export default function RunDocumentTruthPanel({ runId }: Props) {
  const [validation, setValidation] = useState<ValidationRecord | null>(null);
  const [candidates, setCandidates] = useState<CandidateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCandidates, setShowCandidates] = useState(true);

  useEffect(() => {
    load();
  }, [runId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await getDocumentTruthValidation(runId);
      setValidation(result.validation as ValidationRecord | null);
      setCandidates(result.candidates as CandidateRecord[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load document truth');
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="py-8 text-center text-gray-500 text-sm">Loading document truth...</div>;
  if (error) return <div className="py-4 text-red-400 text-sm">{error}</div>;
  if (!validation) {
    return (
      <div className="py-8 text-center flex flex-col items-center gap-2">
        <Info className="w-5 h-5 text-gray-600" />
        <div className="text-sm text-gray-600">No document truth validation recorded for this run.</div>
        <div className="text-xs text-gray-700">Document truth is captured on new runs going forward.</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {validation.extraction_failure && (
        <div className="flex items-start gap-3 bg-red-950/40 border border-red-800 rounded-xl px-4 py-3">
          <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div className="text-sm text-red-300 font-medium">Document Extraction Failure — no reliable strong anchor resolved.</div>
        </div>
      )}
      {validation.extraction_mismatch && !validation.extraction_failure && (
        <div className="flex items-start gap-3 bg-amber-950/40 border border-amber-800 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-300">{validation.mismatch_reason}</div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-gray-950 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Detected Total</div>
          <div className="text-base font-bold text-white">{fmt(validation.detected_document_total)}</div>
          <div className="text-[10px] text-gray-600 mt-0.5">from parser</div>
        </div>
        <div className="bg-gray-950 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Validated Total</div>
          <div className="text-base font-bold text-teal-300">{fmt(validation.validated_document_total)}</div>
          <div className="text-[10px] text-gray-600 mt-0.5">truth engine</div>
        </div>
        <div className="bg-gray-950 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">True Missing Value</div>
          <div className={`text-base font-bold ${validation.true_missing_value && validation.true_missing_value > 100 ? 'text-red-400' : 'text-white'}`}>
            {fmt(validation.true_missing_value)}
          </div>
          <div className="text-[10px] text-gray-600 mt-0.5">validated - parsed</div>
        </div>
        <div className="bg-gray-950 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Selected Anchor</div>
          <div className="text-xs font-mono text-amber-300 leading-snug">{validation.selected_anchor_type ?? '—'}</div>
          <div className="text-[10px] text-gray-600 mt-0.5">anchor type</div>
        </div>
      </div>

      {validation.selected_anchor_type && (
        <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
          <CheckCircle className="w-3.5 h-3.5 text-teal-400 shrink-0" />
          <span className="text-gray-400">Anchor priority: </span>
          <span className="font-mono text-teal-300">{anchorPriorityLabel(validation.selected_anchor_type)}</span>
        </div>
      )}

      {candidates.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowCandidates((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-gray-400 hover:text-white transition-colors"
          >
            <span>Total Candidates ({candidates.length})</span>
            {showCandidates ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {showCandidates && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-t border-gray-800 text-gray-600">
                    <th className="text-left px-4 py-2 font-medium">Value</th>
                    <th className="text-left px-4 py-2 font-medium">Anchor Type</th>
                    <th className="text-right px-4 py-2 font-medium">Score</th>
                    <th className="text-right px-4 py-2 font-medium">Confidence</th>
                    <th className="text-left px-4 py-2 font-medium">Status</th>
                    <th className="text-left px-4 py-2 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => (
                    <tr
                      key={c.id}
                      className={`border-t border-gray-800/50 ${c.selected ? 'bg-teal-950/20' : ''}`}
                    >
                      <td className="px-4 py-2 font-mono text-white font-semibold">{fmt(c.value)}</td>
                      <td className="px-4 py-2 font-mono text-amber-300 text-[11px]">{c.anchor_type}</td>
                      <td className="px-4 py-2 text-right text-gray-300">{c.ranking_score}</td>
                      <td className="px-4 py-2 text-right text-gray-400">{(c.confidence * 100).toFixed(0)}%</td>
                      <td className="px-4 py-2">
                        {c.selected ? (
                          <span className="flex items-center gap-1 text-teal-400 font-semibold">
                            <CheckCircle className="w-3 h-3" /> Selected
                          </span>
                        ) : (
                          <span className="text-gray-600">Rejected</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-gray-600 max-w-[200px] truncate">{c.rejected_reason ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {candidates.length === 0 && (
        <div className="text-xs text-gray-600 text-center py-4">No candidate records stored for this run.</div>
      )}
    </div>
  );
}
