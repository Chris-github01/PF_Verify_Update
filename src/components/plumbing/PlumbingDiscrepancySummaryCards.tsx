import { TrendingDown, TrendingUp, Minus, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import type { PlumbingDiff } from '../../types/plumbingDiscrepancy';

interface Props {
  diff: PlumbingDiff;
}

type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

function deriveRiskLevel(diff: PlumbingDiff): RiskLevel {
  if (diff.systemicFailure) {
    const gapAmt = diff.totalsComparison.documentGap != null
      ? Math.abs(diff.totalsComparison.documentGap)
      : 0;
    return gapAmt > 50000 ? 'critical' : 'high';
  }
  const critical = diff.riskFlags.some((f) => f.severity === 'critical');
  if (critical) return 'critical';
  const high = diff.riskFlags.filter((f) => f.severity === 'high').length;
  if (high >= 2) return 'critical';
  if (high >= 1) return 'high';
  const med = diff.riskFlags.filter((f) => f.severity === 'medium').length;
  if (med >= 2) return 'medium';
  if (diff.riskFlags.length === 0) return 'low';
  return 'medium';
}

const RISK_CONFIG: Record<RiskLevel, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  low:      { label: 'Low',      color: 'text-green-400',  bg: 'bg-green-950/40 border-green-800',   icon: CheckCircle },
  medium:   { label: 'Medium',   color: 'text-amber-400',  bg: 'bg-amber-950/40 border-amber-800',   icon: AlertTriangle },
  high:     { label: 'High',     color: 'text-orange-400', bg: 'bg-orange-950/40 border-orange-800', icon: AlertTriangle },
  critical: { label: 'Critical', color: 'text-red-400',    bg: 'bg-red-950/40 border-red-800',       icon: XCircle },
};

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `$${Math.abs(n).toLocaleString('en-NZ', { minimumFractionDigits: 2 })}`;
}

function fmtDiff(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  const prefix = n >= 0 ? '+' : '-';
  return `${prefix}${fmt(n)}`;
}

export default function PlumbingDiscrepancySummaryCards({ diff }: Props) {
  const { totalsComparison: tc } = diff;
  const riskLevel = deriveRiskLevel(diff);
  const riskConfig = RISK_CONFIG[riskLevel];
  const RiskIcon = riskConfig.icon;

  const parsersAgreeButWrong = tc.isSystemicMiss;
  const deltaSub = parsersAgreeButWrong
    ? 'Live and shadow match — both diverge from document total'
    : Math.abs(tc.shadowTotalDelta) < 1
      ? 'Totals match'
      : undefined;

  const cards = [
    {
      label: 'Live Parsed Total',
      value: fmt(tc.liveParsedTotal),
      sub: tc.liveDiffToDocument !== null ? `${fmtDiff(tc.liveDiffToDocument)} vs document` : undefined,
      highlight: tc.liveDiffToDocument !== null && Math.abs(tc.liveDiffToDocument) > 1000,
      highlightColor: 'text-orange-400',
    },
    {
      label: 'Shadow Parsed Total',
      value: fmt(tc.shadowParsedTotal),
      sub: tc.shadowDiffToDocument !== null ? `${fmtDiff(tc.shadowDiffToDocument)} vs document` : undefined,
      highlight: parsersAgreeButWrong ? true : tc.shadowIsBetter,
      highlightColor: parsersAgreeButWrong ? 'text-orange-400' : 'text-green-400',
    },
    {
      label: 'Detected Document Total',
      value: fmt(tc.detectedDocumentTotal),
      sub: tc.detectedDocumentTotal ? undefined : 'Not detected',
      highlight: !tc.detectedDocumentTotal || parsersAgreeButWrong,
      highlightColor: parsersAgreeButWrong ? 'text-red-400' : 'text-amber-400',
    },
    {
      label: 'Shadow vs Live Delta',
      value: fmtDiff(tc.shadowTotalDelta),
      sub: deltaSub,
      subColor: parsersAgreeButWrong ? 'text-orange-400' : undefined,
      highlight: parsersAgreeButWrong || Math.abs(tc.shadowTotalDelta) > 500,
      highlightColor: parsersAgreeButWrong ? 'text-orange-400' : tc.shadowTotalDelta < 0 ? 'text-green-400' : 'text-red-400',
      Icon: Math.abs(tc.shadowTotalDelta) < 1 ? Minus : tc.shadowTotalDelta < 0 ? TrendingDown : TrendingUp,
    },
    {
      label: 'Included Lines (Shadow)',
      value: '',
      valueAlt: () => {
        const included = diff.rowClassificationChanges.filter((r) => r.shadowIncluded).length;
        const total = diff.rowClassificationChanges.length;
        return total > 0 ? `${included} of ${total} changed` : 'No changes';
      },
      highlight: false,
      highlightColor: 'text-gray-300',
    },
    {
      label: 'Excluded Summary Rows',
      value: String(diff.shadowExcludedRows.length),
      sub: diff.liveExcludedRows.length !== diff.shadowExcludedRows.length
        ? `vs ${diff.liveExcludedRows.length} in live`
        : parsersAgreeButWrong
          ? 'Both exclude same rows'
          : 'Same as live',
      subColor: parsersAgreeButWrong ? 'text-orange-400' : undefined,
      highlight: diff.shadowExcludedRows.length > diff.liveExcludedRows.length || parsersAgreeButWrong,
      highlightColor: parsersAgreeButWrong ? 'text-orange-400' : 'text-cyan-400',
    },
  ];

  const outcomeLabel = diff.recommendedOutcome === 'systemic_failure'
    ? 'systemic failure'
    : diff.recommendedOutcome.replace(/_/g, ' ');

  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {cards.map((card) => (
          <div
            key={card.label}
            className="bg-gray-900 border border-gray-800 rounded-xl p-4"
          >
            <div className="text-xs text-gray-500 mb-1 leading-tight">{card.label}</div>
            <div className={`text-lg font-bold tabular-nums ${card.highlight ? card.highlightColor : 'text-white'}`}>
              {card.valueAlt ? card.valueAlt() : card.value}
              {card.Icon && <card.Icon className="inline w-4 h-4 ml-1" />}
            </div>
            {card.sub && (
              <div className={`text-xs mt-0.5 truncate ${card.subColor ?? 'text-gray-600'}`}>{card.sub}</div>
            )}
          </div>
        ))}
      </div>

      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${riskConfig.bg}`}>
        <RiskIcon className={`w-5 h-5 ${riskConfig.color} shrink-0`} />
        <div className="flex-1">
          <span className={`text-sm font-bold ${riskConfig.color}`}>Risk Level: {riskConfig.label}</span>
          <span className="text-xs text-gray-400 ml-2">
            {diff.riskFlags.length} risk flag{diff.riskFlags.length !== 1 ? 's' : ''} detected
            {' · '}
            Recommended: <span className={`font-medium ${diff.systemicFailure ? 'text-red-300' : 'text-gray-300'}`}>{outcomeLabel}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
