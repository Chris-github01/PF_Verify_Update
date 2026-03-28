import type { MatchedLineGroup, SupplierInput } from './lineMatcher';
import type { ReferenceQuantityResult } from './referenceQuantityEngine';

export interface SupplierNormalizedLine {
  lineKey: string;
  canonicalDescription: string;
  unit: string;
  originalQuantity: number | null;
  referenceQuantity: number | null;
  unitRate: number | null;
  rawLineTotal: number | null;
  normalizedLineTotal: number | null;
  quantityGap: number | null;
  isUnderAllowed: boolean;
}

export interface SupplierAdjustment {
  quoteId: string;
  supplierName: string;
  rawTotal: number;
  normalizedTotal: number;
  quantityGapValue: number;
  matchedLines: SupplierNormalizedLine[];
  unmatchedRawTotal: number;
  underallowanceFlag: boolean;
  matchedLinesCount: number;
  underallowedLinesCount: number;
}

export function buildSupplierAdjustments(
  suppliers: SupplierInput[],
  matchedGroups: MatchedLineGroup[],
  referenceResults: Map<string, ReferenceQuantityResult>,
): SupplierAdjustment[] {
  const adjustments: SupplierAdjustment[] = [];

  for (const sup of suppliers) {
    const matchedItemIds = new Set<string>();
    const normalizedLines: SupplierNormalizedLine[] = [];

    for (const group of matchedGroups) {
      const sv = group.supplierValues.find((v) => v.quoteId === sup.quoteId);
      if (!sv) continue;

      const ref = referenceResults.get(group.normalizedKey);
      const refQty = ref?.referenceQuantity ?? null;
      const origQty = sv.quantity;
      const rate = sv.unitRate;

      let rawLineTotal = sv.totalValue;
      if (rawLineTotal === null && origQty !== null && rate !== null) {
        rawLineTotal = origQty * rate;
      }

      let normalizedLineTotal: number | null = null;
      if (refQty !== null && rate !== null) {
        normalizedLineTotal = parseFloat((refQty * rate).toFixed(2));
      } else if (rawLineTotal !== null) {
        normalizedLineTotal = rawLineTotal;
      }

      const quantityGap =
        normalizedLineTotal !== null && rawLineTotal !== null
          ? parseFloat((normalizedLineTotal - rawLineTotal).toFixed(2))
          : null;

      const isUnderAllowed =
        ref?.supplierOutliers.find((o) => o.quoteId === sup.quoteId)?.isUnderAllowed ?? false;

      normalizedLines.push({
        lineKey: group.normalizedKey,
        canonicalDescription: group.canonicalDescription,
        unit: group.unit,
        originalQuantity: origQty,
        referenceQuantity: refQty,
        unitRate: rate,
        rawLineTotal: rawLineTotal !== null ? parseFloat(rawLineTotal.toFixed(2)) : null,
        normalizedLineTotal,
        quantityGap,
        isUnderAllowed,
      });

      matchedItemIds.add(sv.originalItemId);
    }

    const unmatchedRaw = sup.items
      .filter((item) => !matchedItemIds.has(item.id) && !item.is_excluded)
      .reduce((sum, item) => {
        const val = item.total_price ?? (item.quantity && item.unit_price ? item.quantity * item.unit_price : 0);
        return sum + (val ?? 0);
      }, 0);

    const rawMatchedTotal = normalizedLines.reduce(
      (s, l) => s + (l.rawLineTotal ?? 0),
      0,
    );
    const normMatchedTotal = normalizedLines.reduce(
      (s, l) => s + (l.normalizedLineTotal ?? 0),
      0,
    );
    const gapOnMatched = normMatchedTotal - rawMatchedTotal;

    const rawTotal = parseFloat((rawMatchedTotal + unmatchedRaw).toFixed(2));
    const normalizedTotal = parseFloat((normMatchedTotal + unmatchedRaw).toFixed(2));
    const quantityGapValue = parseFloat(gapOnMatched.toFixed(2));

    const underallowedCount = normalizedLines.filter((l) => l.isUnderAllowed).length;

    const UNDERALLOWANCE_THRESHOLD = 2;
    const FINANCIAL_SIGNIFICANCE_RATIO = 0.05;
    const underallowanceFlag =
      underallowedCount >= UNDERALLOWANCE_THRESHOLD ||
      (rawTotal > 0 && Math.abs(quantityGapValue) / rawTotal >= FINANCIAL_SIGNIFICANCE_RATIO);

    adjustments.push({
      quoteId: sup.quoteId,
      supplierName: sup.supplierName,
      rawTotal,
      normalizedTotal,
      quantityGapValue,
      matchedLines: normalizedLines,
      unmatchedRawTotal: parseFloat(unmatchedRaw.toFixed(2)),
      underallowanceFlag,
      matchedLinesCount: normalizedLines.length,
      underallowedLinesCount: underallowedCount,
    });
  }

  return adjustments;
}
