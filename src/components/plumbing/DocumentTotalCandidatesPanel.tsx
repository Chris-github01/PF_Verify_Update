import { useState } from 'react';
import { ChevronDown, ChevronRight, CheckCircle2, XCircle } from 'lucide-react';
import type { DocumentTotalValidation, TotalCandidate } from '../../types/plumbingDiscrepancy';

interface Props {
  validation: DocumentTotalValidation;
}

const ANCHOR_LABELS: Record<string, string> = {
  explicit_total_price:       'Explicit: Total Price',
  explicit_grand_total:       'Explicit: Grand Total',
  explicit_contract_total:    'Explicit: Contract Total',
  explicit_final_total:       'Explicit: Final Total',
  explicit_label:             'Explicit: Labeled Total',
  final_total_row_agreed:     'Final Row (both parsers agree)',
  final_total_row_live:       'Final Row (live parser)',
  final_total_row_shadow:     'Final Row (shadow parser)',
  strong_final_summary:       'Strong Final Summary Row',
  max_summary:                'Max Summary Value',
  detected_live:              'Detected Fallback (live)',
  detected_shadow:            'Detected Fallback (shadow)',
};

function confidenceBar(confidence: number) {
  const pct = Math.round(confidence * 100);
  const color =
    pct >= 90 ? 'bg-green-500' :
    pct >= 75 ? 'bg-cyan-500' :
    pct >= 60 ? 'bg-amber-500' :
    'bg-gray-600';
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <div className="w-16 h-1.5 bg-gray-800 rounded-full overflow-hidden shrink-0">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-gray-500 tabular-nums">{pct}%</span>
    </div>
  );
}

function fmt(n: number): string {
  return `$${n.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}`;
}

function CandidateRow({ c }: { c: TotalCandidate }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`border rounded-lg overflow-hidden ${c.selected ? 'border-cyan-700 bg-cyan-950/20' : 'border-gray-800 bg-gray-900'}`}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-800/30 transition-colors"
      >
        <span className="shrink-0">
          {c.selected
            ? <CheckCircle2 className="w-4 h-4 text-cyan-400" />
            : <XCircle className="w-4 h-4 text-gray-600" />
          }
        </span>

        <span className={`font-mono font-bold tabular-nums text-sm shrink-0 ${c.selected ? 'text-cyan-300' : 'text-gray-400'}`}>
          {fmt(c.value)}
        </span>

        <span className={`text-xs truncate flex-1 ${c.selected ? 'text-cyan-500' : 'text-gray-500'}`}>
          {ANCHOR_LABELS[c.anchorType] ?? c.anchorType}
        </span>

        <div className="shrink-0">
          {confidenceBar(c.confidence)}
        </div>

        <span className={`text-xs font-mono shrink-0 ${c.selected ? 'text-cyan-600' : 'text-gray-700'}`}>
          rank {c.rankingScore}
        </span>

        <span className="shrink-0 text-gray-700">
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-3 pt-1 border-t border-gray-800/60 space-y-1.5">
          {c.sourceText && (
            <div>
              <span className="text-xs text-gray-600">Source text: </span>
              <span className="text-xs text-gray-400 font-mono">"{c.sourceText}"</span>
            </div>
          )}
          <div>
            <span className="text-xs text-gray-600">Decision: </span>
            <span className={`text-xs ${c.selected ? 'text-cyan-400' : 'text-gray-500'}`}>{c.selectionReason}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DocumentTotalCandidatesPanel({ validation }: Props) {
  const [open, setOpen] = useState(false);
  const { candidates, detectedDocumentTotal, validatedDocumentTotal, anchorType, extractionMismatch } = validation;

  if (candidates.length === 0) return null;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
          <span className="text-sm font-semibold text-white">Document Total Candidates</span>
          <span className="text-xs text-gray-600">admin-only · {candidates.length} candidate{candidates.length !== 1 ? 's' : ''}</span>
          {extractionMismatch && (
            <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-amber-900/60 border border-amber-700 text-amber-300">
              mismatch
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-600">
          {detectedDocumentTotal != null && (
            <span>detected: <span className="text-gray-400 tabular-nums">{fmt(detectedDocumentTotal)}</span></span>
          )}
          {validatedDocumentTotal != null && (
            <span className="text-cyan-600">
              validated: <span className="text-cyan-300 tabular-nums">{fmt(validatedDocumentTotal)}</span>
              {anchorType && <span className="text-cyan-700 ml-1">({anchorType})</span>}
            </span>
          )}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2 border-t border-gray-800">
          <div className="flex items-center gap-4 pt-3 pb-1 text-xs text-gray-600">
            <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-cyan-600" /> Selected anchor</span>
            <span className="flex items-center gap-1"><XCircle className="w-3.5 h-3.5 text-gray-600" /> Rejected / lower rank</span>
          </div>

          {candidates.map((c, i) => (
            <CandidateRow key={`${c.anchorType}-${c.value}-${i}`} c={c} />
          ))}

          {extractionMismatch && validation.mismatchReason && (
            <div className="mt-2 p-3 rounded-lg bg-amber-950/30 border border-amber-800/60 text-xs text-amber-400 leading-relaxed">
              {validation.mismatchReason}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
