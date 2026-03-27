import { AlertTriangle, XCircle, Wrench } from 'lucide-react';
import type { PlumbingDiff } from '../../types/plumbingDiscrepancy';

interface Props {
  diff: PlumbingDiff;
}

function fmt(n: number): string {
  return `$${n.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}`;
}

const ROOT_CAUSE_HINTS = [
  'Summary row detection is likely mis-classifying a valid cost section as a total row',
  'Review rows with phrase_match signals — they may be billable items, not summary lines',
  'Check for section subtotals that are being excluded and double-counted',
  'Total row exclusion confidence thresholds may be too aggressive',
];

export default function PlumbingSystemicMissBlock({ diff }: Props) {
  const { totalsComparison: tc } = diff;

  if (!diff.systemicFailure || tc.documentGap == null) return null;

  const gapAmt = Math.abs(tc.documentGap);
  const isUndercounted = tc.documentGap > 0;
  const severity = gapAmt > 50000 ? 'critical' : 'high';

  const borderColor = severity === 'critical' ? 'border-red-700' : 'border-orange-700';
  const bgColor = severity === 'critical' ? 'bg-red-950/30' : 'bg-orange-950/20';
  const headingColor = severity === 'critical' ? 'text-red-300' : 'text-orange-300';
  const Icon = severity === 'critical' ? XCircle : AlertTriangle;
  const iconColor = severity === 'critical' ? 'text-red-400' : 'text-orange-400';

  return (
    <div className={`rounded-xl border ${borderColor} ${bgColor} p-5 space-y-4`}>
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 ${iconColor} shrink-0 mt-0.5`} />
        <div>
          <div className={`text-sm font-bold ${headingColor} leading-snug`}>
            Systemic Parsing Failure Detected
          </div>
          <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
            Live and shadow parsers produce matching totals, but both diverge from the document total.
            This is not a parser disagreement — it is a shared blind spot that produces false confidence.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-gray-900/60 border border-gray-800 rounded-lg p-3">
          <div className="text-[11px] text-gray-500 mb-1">Missing Value</div>
          <div className={`text-xl font-bold tabular-nums ${severity === 'critical' ? 'text-red-400' : 'text-orange-400'}`}>
            {fmt(gapAmt)}
          </div>
          <div className="text-[11px] text-gray-600 mt-0.5">
            {isUndercounted ? 'under-counted by both parsers' : 'over-counted by both parsers'}
          </div>
        </div>

        <div className="bg-gray-900/60 border border-gray-800 rounded-lg p-3">
          <div className="text-[11px] text-gray-500 mb-1">Status</div>
          <div className={`text-sm font-semibold ${severity === 'critical' ? 'text-red-300' : 'text-orange-300'}`}>
            Both parsers exclude same value
          </div>
          <div className="text-[11px] text-gray-600 mt-0.5">
            Shadow parser offers no improvement over live
          </div>
        </div>

        <div className="bg-gray-900/60 border border-gray-800 rounded-lg p-3">
          <div className="text-[11px] text-gray-500 mb-1">Document Total</div>
          <div className="text-sm font-bold text-white tabular-nums">
            {tc.detectedDocumentTotal != null ? fmt(tc.detectedDocumentTotal) : '—'}
          </div>
          <div className="text-[11px] text-gray-600 mt-0.5">
            Parsed: {fmt(tc.liveParsedTotal)}
          </div>
        </div>
      </div>

      <div className="border-t border-gray-800/60 pt-3 space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium text-gray-400">
          <Wrench className="w-3.5 h-3.5" />
          Likely root causes
        </div>
        <ul className="space-y-1">
          {ROOT_CAUSE_HINTS.map((hint, i) => (
            <li key={i} className="text-xs text-gray-500 flex items-start gap-1.5">
              <span className="text-gray-700 mt-0.5 shrink-0">·</span>
              {hint}
            </li>
          ))}
        </ul>
      </div>

      <div className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 ${
        severity === 'critical'
          ? 'bg-red-950/20 border-red-800/50'
          : 'bg-orange-950/20 border-orange-800/50'
      }`}>
        <AlertTriangle className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${iconColor}`} />
        <p className="text-xs text-gray-400 leading-relaxed">
          <span className={`font-semibold ${headingColor}`}>Recommendation: </span>
          Parser logic is likely excluding valid cost lines. Do not promote the shadow parser until the
          shared exclusion defect is identified and corrected. Review summary row detection rules,
          focusing on phrase_match confidence thresholds and position-based exclusion signals.
        </p>
      </div>
    </div>
  );
}
