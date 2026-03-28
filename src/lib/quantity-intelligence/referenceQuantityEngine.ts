import type { MatchedLineGroup, SupplierLineValue } from './lineMatcher';

export type ReferenceMethod =
  | 'median_supplier_qty'
  | 'highest_supplier_qty'
  | 'inconclusive';

export type OutlierSeverity = 'none' | 'review' | 'major';

export interface ReferenceQuantityResult {
  referenceQuantity: number | null;
  referenceMethod: ReferenceMethod;
  highestQuantity: number | null;
  lowestQuantity: number | null;
  quantitySpreadPercent: number | null;
  outlierFlag: boolean;
  outlierSeverity: OutlierSeverity;
  notes: string;
  supplierOutliers: SupplierOutlierResult[];
}

export interface SupplierOutlierResult {
  quoteId: string;
  supplierName: string;
  quantity: number | null;
  ratioToReference: number | null;
  isUnderAllowed: boolean;
  isOverAllowed: boolean;
}

const SPREAD_REVIEW_THRESHOLD = 15;
const SPREAD_MAJOR_THRESHOLD = 30;
const UNDER_ALLOWED_RATIO = 0.85;
const OVER_ALLOWED_RATIO = 1.20;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function getValidQuantities(values: SupplierLineValue[]): { qty: number; quoteId: string; supplierName: string }[] {
  return values
    .filter((v) => v.quantity !== null && v.quantity > 0)
    .map((v) => ({ qty: v.quantity!, quoteId: v.quoteId, supplierName: v.supplierName }));
}

export function deriveReferenceQuantity(group: MatchedLineGroup): ReferenceQuantityResult {
  const valid = getValidQuantities(group.supplierValues);

  if (valid.length === 0) {
    return {
      referenceQuantity: null,
      referenceMethod: 'inconclusive',
      highestQuantity: null,
      lowestQuantity: null,
      quantitySpreadPercent: null,
      outlierFlag: false,
      outlierSeverity: 'none',
      notes: 'No valid quantities found across suppliers.',
      supplierOutliers: [],
    };
  }

  if (valid.length === 1) {
    return {
      referenceQuantity: valid[0].qty,
      referenceMethod: 'inconclusive',
      highestQuantity: valid[0].qty,
      lowestQuantity: valid[0].qty,
      quantitySpreadPercent: 0,
      outlierFlag: false,
      outlierSeverity: 'none',
      notes: 'Only one supplier provided a quantity — cannot compare.',
      supplierOutliers: [],
    };
  }

  const quantities = valid.map((v) => v.qty);
  const highestQuantity = Math.max(...quantities);
  const lowestQuantity = Math.min(...quantities);

  const spreadPercent =
    highestQuantity > 0
      ? parseFloat((((highestQuantity - lowestQuantity) / highestQuantity) * 100).toFixed(2))
      : 0;

  let referenceQuantity: number;
  let referenceMethod: ReferenceMethod;
  let notes: string;

  if (valid.length >= 3) {
    referenceQuantity = median(quantities);
    referenceMethod = 'median_supplier_qty';
    notes = `Reference derived from median of ${valid.length} supplier quantities.`;
  } else {
    referenceQuantity = highestQuantity;
    referenceMethod = 'highest_supplier_qty';
    notes = `Only 2 suppliers with quantities — using highest as reference to avoid under-allowance bias.`;
  }

  const outlierFlag = spreadPercent >= SPREAD_REVIEW_THRESHOLD;
  const outlierSeverity: OutlierSeverity =
    spreadPercent >= SPREAD_MAJOR_THRESHOLD
      ? 'major'
      : spreadPercent >= SPREAD_REVIEW_THRESHOLD
        ? 'review'
        : 'none';

  if (outlierSeverity === 'major') {
    notes += ` MAJOR variance: ${spreadPercent.toFixed(1)}% spread across suppliers.`;
  } else if (outlierSeverity === 'review') {
    notes += ` Review recommended: ${spreadPercent.toFixed(1)}% spread.`;
  }

  const supplierOutliers: SupplierOutlierResult[] = group.supplierValues.map((sv) => {
    const qty = sv.quantity;
    const ratio = qty !== null && qty > 0 && referenceQuantity > 0
      ? parseFloat((qty / referenceQuantity).toFixed(4))
      : null;

    return {
      quoteId: sv.quoteId,
      supplierName: sv.supplierName,
      quantity: qty,
      ratioToReference: ratio,
      isUnderAllowed: ratio !== null && ratio < UNDER_ALLOWED_RATIO,
      isOverAllowed: ratio !== null && ratio > OVER_ALLOWED_RATIO,
    };
  });

  return {
    referenceQuantity: parseFloat(referenceQuantity.toFixed(4)),
    referenceMethod,
    highestQuantity: parseFloat(highestQuantity.toFixed(4)),
    lowestQuantity: parseFloat(lowestQuantity.toFixed(4)),
    quantitySpreadPercent: spreadPercent,
    outlierFlag,
    outlierSeverity,
    notes,
    supplierOutliers,
  };
}

export function analyseAllLines(groups: MatchedLineGroup[]): Map<string, ReferenceQuantityResult> {
  const results = new Map<string, ReferenceQuantityResult>();
  for (const group of groups) {
    results.set(group.normalizedKey, deriveReferenceQuantity(group));
  }
  return results;
}
