import { X, ArrowRight, Info, CheckCircle2, AlertTriangle, ChevronRight } from 'lucide-react';
import type { MatchedLineGroup } from '../../lib/quantity-intelligence/lineMatcher';
import type { ReferenceQuantityResult } from '../../lib/quantity-intelligence/referenceQuantityEngine';
import type { ScoredSupplier } from '../../lib/quantity-intelligence/quantityScoring';

interface Props {
  group: MatchedLineGroup | null;
  referenceResult: ReferenceQuantityResult | null;
  suppliers: ScoredSupplier[];
  onClose: () => void;
}

function fmtQty(v: number | null): string {
  if (v === null) return '—';
  return v % 1 === 0 ? v.toFixed(0) : v.toFixed(3);
}

function formatCurrency(v: number | null): string {
  if (v === null) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000).toLocaleString()}k`;
  return `$${Math.abs(v).toFixed(2)}`;
}

const METHOD_LABELS: Record<string, string> = {
  median_supplier_qty: 'Median of supplier quantities',
  highest_supplier_qty: 'Highest supplier quantity (2-supplier comparison)',
  benchmark_qty: 'Historical benchmark quantity',
  manual_override: 'Manual override by user',
  inconclusive: 'Inconclusive — insufficient data',
};

export default function QuantityExplainabilityDrawer({ group, referenceResult, suppliers, onClose }: Props) {
  if (!group) return null;

  const isOpen = group !== null;

  return (
    <div
      className={`fixed inset-y-0 right-0 z-50 w-full sm:w-[480px] bg-gray-950 border-l border-gray-800 flex flex-col shadow-2xl transition-transform duration-300 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
        <div>
          <div className="text-sm font-semibold text-white">Line Explainability</div>
          <div className="text-xs text-gray-500 mt-0.5">How this line was matched and analysed</div>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <div className="text-xs text-gray-500 mb-1 uppercase tracking-wider">Canonical Description</div>
          <div className="text-sm text-white font-medium">{group.canonicalDescription}</div>
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-600">
            <span>Unit: <span className="text-gray-400">{group.unit}</span></span>
            <span>Match: <span className="text-gray-400">{group.matchMethod}</span></span>
            <span>Confidence: <span className={`${group.matchConfidence >= 0.8 ? 'text-teal-400' : group.matchConfidence >= 0.6 ? 'text-amber-400' : 'text-red-400'}`}>{(group.matchConfidence * 100).toFixed(0)}%</span></span>
          </div>
        </div>

        <div>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Supplier Source Descriptions</div>
          <div className="space-y-2">
            {group.supplierValues.map((sv) => {
              const sup = suppliers.find((s) => s.quoteId === sv.quoteId);
              const matchedLine = sup?.matchedLines.find((l) => l.lineKey === group.normalizedKey);
              const isUnder = matchedLine?.isUnderAllowed ?? false;

              return (
                <div key={sv.quoteId} className={`bg-gray-900 border rounded-lg p-3 ${isUnder ? 'border-red-500/30' : 'border-gray-800'}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-gray-300">{sv.supplierName}</span>
                    {isUnder && (
                      <span className="flex items-center gap-1 text-xs text-red-400">
                        <AlertTriangle className="w-3 h-3" />
                        Under-allowed
                      </span>
                    )}
                    {!isUnder && <CheckCircle2 className="w-3.5 h-3.5 text-teal-500" />}
                  </div>
                  <div className="text-xs text-gray-400 italic mb-2">"{sv.originalDescription}"</div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <div className="text-gray-600">Quantity</div>
                      <div className={`font-mono font-semibold ${isUnder ? 'text-red-400' : 'text-gray-200'}`}>
                        {fmtQty(sv.quantity)} {group.unit}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-600">Unit Rate</div>
                      <div className="font-mono text-gray-200">{sv.unitRate !== null ? formatCurrency(sv.unitRate) : '—'}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Line Total</div>
                      <div className="font-mono text-gray-200">{formatCurrency(sv.totalValue)}</div>
                    </div>
                  </div>
                  {matchedLine && matchedLine.normalizedLineTotal !== null && matchedLine.normalizedLineTotal !== matchedLine.rawLineTotal && (
                    <div className="mt-2 pt-2 border-t border-gray-800 flex items-center gap-2 text-xs text-amber-400">
                      <ArrowRight className="w-3 h-3 flex-shrink-0" />
                      Normalized line total: <span className="font-mono font-semibold">{formatCurrency(matchedLine.normalizedLineTotal)}</span>
                      <span className="text-gray-600">({matchedLine.quantityGap && matchedLine.quantityGap > 0 ? '+' : ''}{formatCurrency(matchedLine.quantityGap)})</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {referenceResult && (
          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Reference Quantity Derivation</div>
            <div className="bg-gray-900 border border-teal-500/20 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Reference Quantity</span>
                <span className="text-base font-bold font-mono text-teal-400">{fmtQty(referenceResult.referenceQuantity)} {group.unit}</span>
              </div>
              <div className="flex items-start gap-2 text-xs text-gray-400">
                <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-teal-600" />
                <span><span className="text-gray-300 font-medium">{METHOD_LABELS[referenceResult.referenceMethod] ?? referenceResult.referenceMethod}.</span> {referenceResult.notes}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="bg-gray-800/60 rounded p-2">
                  <div className="text-gray-600">Highest</div>
                  <div className="font-mono text-blue-300">{fmtQty(referenceResult.highestQuantity)}</div>
                </div>
                <div className="bg-gray-800/60 rounded p-2">
                  <div className="text-gray-600">Lowest</div>
                  <div className="font-mono text-orange-300">{fmtQty(referenceResult.lowestQuantity)}</div>
                </div>
                <div className="bg-gray-800/60 rounded p-2">
                  <div className="text-gray-600">Spread</div>
                  <div className={`font-mono font-semibold ${(referenceResult.quantitySpreadPercent ?? 0) >= 30 ? 'text-red-400' : (referenceResult.quantitySpreadPercent ?? 0) >= 15 ? 'text-amber-400' : 'text-teal-400'}`}>
                    {referenceResult.quantitySpreadPercent?.toFixed(1) ?? '0'}%
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {referenceResult && referenceResult.supplierOutliers.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Outlier Analysis</div>
            <div className="space-y-2">
              {referenceResult.supplierOutliers.map((o) => (
                <div key={o.quoteId} className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2.5">
                  <div className="flex-1 text-xs text-gray-300">{o.supplierName}</div>
                  <div className="font-mono text-xs text-gray-400">{fmtQty(o.quantity)}</div>
                  <ChevronRight className="w-3 h-3 text-gray-700" />
                  <div className={`text-xs font-semibold ${o.isUnderAllowed ? 'text-red-400' : o.isOverAllowed ? 'text-blue-400' : 'text-teal-400'}`}>
                    {o.ratioToReference !== null ? `${(o.ratioToReference * 100).toFixed(1)}%` : '—'}
                  </div>
                  <div className="text-xs text-gray-600">
                    {o.isUnderAllowed ? 'under-allowed' : o.isOverAllowed ? 'over-allowed' : 'within range'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <div className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Why This Line Was Matched</div>
          <div className="text-xs text-gray-400 space-y-1.5">
            <div className="flex items-start gap-2">
              <ArrowRight className="w-3 h-3 text-gray-600 mt-0.5 flex-shrink-0" />
              <span>Matching method: <span className="text-gray-300">{group.matchMethod === 'description_fuzzy' ? 'Token overlap similarity (fuzzy)' : 'Exact normalized key match'}</span></span>
            </div>
            <div className="flex items-start gap-2">
              <ArrowRight className="w-3 h-3 text-gray-600 mt-0.5 flex-shrink-0" />
              <span>Normalized key: <span className="text-gray-600 font-mono break-all">{group.normalizedKey.slice(0, 60)}{group.normalizedKey.length > 60 ? '…' : ''}</span></span>
            </div>
            <div className="flex items-start gap-2">
              <ArrowRight className="w-3 h-3 text-gray-600 mt-0.5 flex-shrink-0" />
              <span>Confidence threshold: <span className="text-gray-300">≥55%</span> (this match: <span className={`${group.matchConfidence >= 0.8 ? 'text-teal-400' : 'text-amber-400'}`}>{(group.matchConfidence * 100).toFixed(0)}%</span>)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
