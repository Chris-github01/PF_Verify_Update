import { useState } from 'react';
import {
  TrendingDown, TrendingUp, ShieldAlert, CheckCircle2, ArrowUp, ArrowDown, Minus,
  Info, AlertTriangle, HelpCircle, ChevronDown, ChevronRight,
} from 'lucide-react';
import type { ScoredSupplier } from '../../lib/quantity-intelligence/quantityScoring';
import type { MatchedLineGroup } from '../../lib/quantity-intelligence/lineMatcher';
import type { ReferenceQuantityResult } from '../../lib/quantity-intelligence/referenceQuantityEngine';
import {
  computeAllConfidence,
  PROTECTION_STATEMENT,
  type SupplierConfidence,
  type ReferenceConfidenceLevel,
} from '../../lib/quantity-intelligence/quantityConfidence';

interface Props {
  suppliers: ScoredSupplier[];
  matchedGroups?: MatchedLineGroup[];
  referenceResults?: Map<string, ReferenceQuantityResult>;
}

function formatCurrency(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000).toLocaleString()}k`;
  if (v === 0) return '$0';
  return `$${Math.abs(v).toFixed(0)}`;
}

function RankBadge({ rank, total, label }: { rank: number; total: number; label: string }) {
  const isBest = rank === 1;
  const isWorst = rank === total;
  return (
    <div className="text-center">
      <div className={`text-lg font-bold ${isBest ? 'text-teal-400' : isWorst ? 'text-red-400' : 'text-white'}`}>
        #{rank}
      </div>
      <div className="text-xs text-gray-600">{label}</div>
    </div>
  );
}

function RankChangeIndicator({ rawRank, normRank }: { rawRank: number; normRank: number }) {
  const delta = rawRank - normRank;
  if (delta === 0) return <span className="flex items-center gap-1 text-xs text-gray-600"><Minus className="w-3 h-3" />No change</span>;
  if (delta > 0) return <span className="flex items-center gap-1 text-xs text-red-400"><TrendingDown className="w-3 h-3" />Drops {delta} place{delta !== 1 ? 's' : ''} normalized</span>;
  return <span className="flex items-center gap-1 text-xs text-teal-400"><TrendingUp className="w-3 h-3" />Rises {Math.abs(delta)} place{Math.abs(delta) !== 1 ? 's' : ''} normalized</span>;
}

function CompletenessBar({ score }: { score: number }) {
  const color = score >= 85 ? 'bg-teal-500' : score >= 65 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500">Completeness</span>
        <span className={`font-semibold ${score >= 85 ? 'text-teal-400' : score >= 65 ? 'text-amber-400' : 'text-red-400'}`}>
          {score.toFixed(0)}/100
        </span>
      </div>
      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

function ConfidencePill({ level, score }: { level: ReferenceConfidenceLevel; score: number }) {
  const styles: Record<ReferenceConfidenceLevel, string> = {
    HIGH: 'bg-teal-500/15 border-teal-500/30 text-teal-400',
    MEDIUM: 'bg-amber-500/15 border-amber-500/30 text-amber-400',
    LOW: 'bg-gray-700/60 border-gray-600/40 text-gray-400',
  };
  const icons: Record<ReferenceConfidenceLevel, typeof CheckCircle2> = {
    HIGH: CheckCircle2,
    MEDIUM: AlertTriangle,
    LOW: HelpCircle,
  };
  const Icon = icons[level];
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${styles[level]}`}>
      <Icon className="w-3 h-3" />
      {level} confidence · {score}/100
    </span>
  );
}

function buildUnderOverLabel(s: ScoredSupplier, conf: SupplierConfidence | undefined): string {
  if (!conf) return s.underallowanceFlag ? 'Under-allowance risk' : 'Quantities complete';
  return conf.commercialInterpretation.underOverLabel;
}

function buildUnderOverStyle(s: ScoredSupplier, conf: SupplierConfidence | undefined): string {
  if (!conf || !s.underallowanceFlag) {
    return s.underallowanceFlag
      ? 'bg-red-500/15 border-red-500/30 text-red-300'
      : 'bg-teal-500/10 border-teal-500/20 text-teal-400';
  }
  const level = conf.level;
  if (level === 'HIGH') return 'bg-red-500/15 border-red-500/30 text-red-300';
  if (level === 'MEDIUM') return 'bg-amber-500/15 border-amber-500/30 text-amber-300';
  return 'bg-gray-700/40 border-gray-600/30 text-gray-400';
}

function buildUnderOverIcon(s: ScoredSupplier, conf: SupplierConfidence | undefined) {
  if (!s.underallowanceFlag) return CheckCircle2;
  if (!conf) return ShieldAlert;
  const level = conf.level;
  if (level === 'HIGH') return ShieldAlert;
  if (level === 'MEDIUM') return AlertTriangle;
  return Info;
}

function CommercialInterpretationBlock({ conf }: { conf: SupplierConfidence }) {
  const [open, setOpen] = useState(false);
  const driverColors: Record<string, string> = {
    drawing_gaps: 'text-amber-400',
    supplier_assumptions: 'text-blue-400',
    missing_scope: 'text-red-400',
    pricing_strategy: 'text-orange-400',
    aligned: 'text-teal-400',
  };
  const driverLabels: Record<string, string> = {
    drawing_gaps: 'Drawing Gaps',
    supplier_assumptions: 'Supplier Assumptions',
    missing_scope: 'Missing Scope',
    pricing_strategy: 'Pricing Strategy',
    aligned: 'Quantities Aligned',
  };

  const ci = conf.commercialInterpretation;
  const color = driverColors[ci.primaryDriver] || 'text-gray-400';
  const driverLabel = driverLabels[ci.primaryDriver] || ci.primaryDriver;

  return (
    <div className="mt-3 bg-gray-800/50 rounded-lg border border-gray-700/50 overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-gray-800/60 transition-colors"
        onClick={() => setOpen(v => !v)}
      >
        <div className="flex items-center gap-2">
          <Info className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
          <span className="text-xs text-gray-400">Commercial Interpretation:</span>
          <span className={`text-xs font-semibold ${color}`}>{driverLabel}</span>
        </div>
        {open ? <ChevronDown className="w-3.5 h-3.5 text-gray-500" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-500" />}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2.5 border-t border-gray-700/50">
          <p className="text-xs text-gray-300 mt-2 leading-relaxed">{ci.explanation}</p>

          {conf.factors.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Confidence Factors</div>
              {conf.factors.map((f, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  {f.impact === 'positive' && <ArrowUp className="w-3 h-3 text-teal-400 flex-shrink-0 mt-0.5" />}
                  {f.impact === 'negative' && <ArrowDown className="w-3 h-3 text-red-400 flex-shrink-0 mt-0.5" />}
                  {f.impact === 'neutral' && <Minus className="w-3 h-3 text-gray-500 flex-shrink-0 mt-0.5" />}
                  <span className="text-gray-400">{f.detail}</span>
                </div>
              ))}
            </div>
          )}

          {conf.trueQuantityRange && (
            <div className="bg-gray-900/60 rounded-md p-2 text-xs">
              <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">True Quantity Range</div>
              <div className="flex items-center gap-3 text-gray-300">
                <span>Min: <span className="font-mono text-gray-200">{conf.trueQuantityRange.min.toFixed(1)}</span></span>
                <span className="text-gray-600">|</span>
                <span>Baseline: <span className="font-mono text-teal-400 font-semibold">{conf.trueQuantityRange.baseline.toFixed(1)}</span></span>
                <span className="text-gray-600">|</span>
                <span>Max: <span className="font-mono text-gray-200">{conf.trueQuantityRange.max.toFixed(1)}</span></span>
                <span className="text-gray-500 ml-1">({conf.trueQuantityRange.unit})</span>
              </div>
            </div>
          )}

          <div className="flex items-start gap-2 bg-blue-500/5 border border-blue-500/15 rounded-md px-2.5 py-1.5 text-xs">
            <Info className="w-3 h-3 text-blue-400 flex-shrink-0 mt-0.5" />
            <span className="text-blue-300/80">{ci.actionNote}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SupplierAdjustmentSummary({ suppliers, matchedGroups, referenceResults }: Props) {
  const sorted = [...suppliers].sort((a, b) => a.rawRank - b.rawRank);
  const total = suppliers.length;

  const confidenceMap: Map<string, SupplierConfidence> =
    matchedGroups && referenceResults
      ? computeAllConfidence(suppliers, matchedGroups, referenceResults)
      : new Map();

  const showConfidence = confidenceMap.size > 0;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800">
        <div className="text-sm font-semibold text-white">Supplier Adjustment Summary</div>
        <div className="text-xs text-gray-500 mt-0.5">
          Raw vs quantity-normalized totals — advisory only
        </div>
      </div>

      <div className="divide-y divide-gray-800">
        {sorted.map((s) => {
          const gapAbs = Math.abs(s.quantityGapValue);
          const gapSign = s.quantityGapValue > 0 ? '+' : s.quantityGapValue < 0 ? '-' : '';
          const gapLabel = gapSign === '+' ? 'under-allowed (hidden cost)' : gapSign === '-' ? 'over-allowed' : 'no gap';
          const conf = confidenceMap.get(s.quoteId);
          const underOverLabel = buildUnderOverLabel(s, conf);
          const underOverStyle = buildUnderOverStyle(s, conf);
          const UnderOverIcon = buildUnderOverIcon(s, conf);

          return (
            <div key={s.quoteId} className={`p-4 ${s.underallowanceFlag ? 'bg-red-500/3' : ''}`}>
              <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-sm font-semibold text-white">{s.supplierName}</div>
                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${underOverStyle}`}>
                    <UnderOverIcon className="w-3 h-3" />
                    {underOverLabel}
                  </span>
                  {showConfidence && conf && (
                    <ConfidencePill level={conf.level} score={conf.score} />
                  )}
                </div>
                <RankChangeIndicator rawRank={s.rawRank} normRank={s.normalizedRank} />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                <div className="bg-gray-800/60 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-1">Raw Quoted Total</div>
                  <div className="text-base font-bold text-white">{formatCurrency(s.rawTotal)}</div>
                </div>
                <div className="bg-gray-800/60 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-1">Normalized Total</div>
                  <div className={`text-base font-bold ${s.normalizedTotal > s.rawTotal ? 'text-amber-300' : s.normalizedTotal < s.rawTotal ? 'text-teal-300' : 'text-white'}`}>
                    {formatCurrency(s.normalizedTotal)}
                  </div>
                </div>
                <div className="bg-gray-800/60 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-1">Quantity Gap</div>
                  {gapAbs === 0 ? (
                    <div className="text-base font-bold text-gray-500">—</div>
                  ) : (
                    <div className={`text-base font-bold ${gapSign === '+' ? 'text-red-400' : 'text-teal-400'}`}>
                      {gapSign}{formatCurrency(gapAbs)}
                    </div>
                  )}
                  {gapAbs > 0 && <div className="text-xs text-gray-600 mt-0.5">{gapLabel}</div>}
                </div>
                <div className="bg-gray-800/60 rounded-lg p-3">
                  <div className="flex gap-4">
                    <RankBadge rank={s.rawRank} total={total} label="Raw rank" />
                    <RankBadge rank={s.normalizedRank} total={total} label="Norm rank" />
                  </div>
                </div>
              </div>

              <CompletenessBar score={s.completenessScore} />

              <div className="flex items-center justify-between mt-2 text-xs text-gray-600">
                <span>{s.matchedLinesCount} matched lines · {s.underallowedLinesCount} under-allowed</span>
                <span>Raw competitiveness: {s.competitivenessScoreRaw.toFixed(0)}/100 · Normalized: {s.competitivenessScoreNormalized.toFixed(0)}/100</span>
              </div>

              {showConfidence && conf && (s.underallowanceFlag || conf.level !== 'HIGH') && (
                <CommercialInterpretationBlock conf={conf} />
              )}
            </div>
          );
        })}
      </div>

      {showConfidence && (
        <div className="px-4 py-3 border-t border-gray-800 flex items-start gap-2">
          <Info className="w-3.5 h-3.5 text-gray-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-gray-600 italic">{PROTECTION_STATEMENT}</p>
        </div>
      )}
    </div>
  );
}
