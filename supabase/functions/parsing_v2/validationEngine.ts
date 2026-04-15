import type {
  NormalizedLineItem,
  ValidationIssue,
  ValidationResult,
} from "./types.ts";
import { dedupeKey, fuzzyDedupeKey, mathCheck, roundTo2 } from "./utils.ts";

const MATH_TOLERANCE_PCT = 0.02;
const DOCUMENT_TOTAL_TOLERANCE_PCT = 0.05;
const IMPLAUSIBLE_RATE_MAX = 1_000_000;
const IMPLAUSIBLE_QTY_MAX = 100_000;

function checkMathConsistency(
  item: NormalizedLineItem,
  index: number
): ValidationIssue | null {
  const { qty, rate, total } = item;
  if (qty <= 0 || rate <= 0 || total <= 0) return null;

  if (!mathCheck(qty, rate, total, MATH_TOLERANCE_PCT)) {
    const computed = roundTo2(qty * rate);
    return {
      type: "math_mismatch",
      severity: "warning",
      itemIndex: index,
      message: `Math mismatch: ${qty} × ${rate} = ${computed}, but total is ${total}`,
      details: { qty, rate, total, computed },
    };
  }
  return null;
}

function checkZeroTotal(
  item: NormalizedLineItem,
  index: number
): ValidationIssue | null {
  if (item.total <= 0 && !item.isAdjustment) {
    return {
      type: "zero_total",
      severity: "warning",
      itemIndex: index,
      message: `Item has zero or negative total: "${item.description}"`,
      details: { total: item.total },
    };
  }
  return null;
}

function checkNegativeTotal(
  item: NormalizedLineItem,
  index: number
): ValidationIssue | null {
  if (item.total < 0 && !item.isAdjustment) {
    return {
      type: "negative_total",
      severity: "warning",
      itemIndex: index,
      message: `Item has negative total: "${item.description}" = ${item.total}`,
      details: { total: item.total },
    };
  }
  return null;
}

function checkMissingDescription(
  item: NormalizedLineItem,
  index: number
): ValidationIssue | null {
  if (!item.description || item.description.trim().length < 3) {
    return {
      type: "missing_description",
      severity: "error",
      itemIndex: index,
      message: `Item ${index} has no usable description`,
      details: {},
    };
  }
  return null;
}

function checkImplausibleRate(
  item: NormalizedLineItem,
  index: number
): ValidationIssue | null {
  if (item.rate > IMPLAUSIBLE_RATE_MAX) {
    return {
      type: "implausible_rate",
      severity: "warning",
      itemIndex: index,
      message: `Implausibly high rate $${item.rate} for "${item.description}"`,
      details: { rate: item.rate },
    };
  }
  return null;
}

function checkImplausibleQty(
  item: NormalizedLineItem,
  index: number
): ValidationIssue | null {
  if (item.qty > IMPLAUSIBLE_QTY_MAX) {
    return {
      type: "implausible_qty",
      severity: "warning",
      itemIndex: index,
      message: `Implausibly high qty ${item.qty} for "${item.description}"`,
      details: { qty: item.qty },
    };
  }
  return null;
}

function detectDuplicates(items: NormalizedLineItem[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const exactSeen = new Map<string, number>();
  const fuzzySeen = new Map<string, number>();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.isAdjustment) continue;

    const exact = dedupeKey(item);
    if (exactSeen.has(exact)) {
      issues.push({
        type: "duplicate",
        severity: "error",
        itemIndex: i,
        message: `Exact duplicate of item ${exactSeen.get(exact)}: "${item.description}"`,
        details: { duplicateOf: exactSeen.get(exact) },
      });
    } else {
      exactSeen.set(exact, i);
    }

    const fuzzy = fuzzyDedupeKey(item.description);
    if (fuzzySeen.has(fuzzy) && !exactSeen.has(exact)) {
      const prevIndex = fuzzySeen.get(fuzzy)!;
      const prev = items[prevIndex];
      if (prev && Math.abs(prev.total - item.total) / Math.max(item.total, 1) < 0.1) {
        issues.push({
          type: "duplicate",
          severity: "warning",
          itemIndex: i,
          message: `Likely duplicate of item ${prevIndex}: "${item.description}" ≈ "${prev.description}"`,
          details: { duplicateOf: prevIndex, similarity: "fuzzy" },
        });
      }
    } else if (!fuzzySeen.has(fuzzy)) {
      fuzzySeen.set(fuzzy, i);
    }
  }

  return issues;
}

function checkDocumentTotalGap(
  itemsTotal: number,
  documentTotal: number | null,
  issues: ValidationIssue[]
): void {
  if (documentTotal === null || documentTotal <= 0) return;

  const gap = roundTo2(documentTotal - itemsTotal);
  const gapPct = Math.abs(gap) / documentTotal;

  if (gapPct > DOCUMENT_TOTAL_TOLERANCE_PCT) {
    issues.push({
      type: "document_total_gap",
      severity: gapPct > 0.15 ? "error" : "warning",
      itemIndex: null,
      message: `Items total $${itemsTotal.toFixed(2)} differs from document total $${documentTotal.toFixed(2)} by $${Math.abs(gap).toFixed(2)} (${(gapPct * 100).toFixed(1)}%)`,
      details: { itemsTotal, documentTotal, gap, gapPct },
    });
  }
}

function checkSignificantMismatch(
  itemsTotal: number,
  documentTotal: number | null,
  issues: ValidationIssue[]
): void {
  if (documentTotal === null || documentTotal <= 0) return;

  const gap = roundTo2(documentTotal - itemsTotal);
  const gapPct = Math.abs(gap) / documentTotal;

  if (gapPct > 0.02) {
    issues.push({
      type: "significant_total_mismatch",
      severity: "error",
      itemIndex: null,
      message: `SIGNIFICANT_TOTAL_MISMATCH: parsed items total $${itemsTotal.toFixed(2)} vs document total $${documentTotal.toFixed(2)} — gap of $${Math.abs(gap).toFixed(2)} (${(gapPct * 100).toFixed(1)}%)`,
      details: { itemsTotal, documentTotal, gap, gapPct },
    });
  }
}

function computeScore(
  items: NormalizedLineItem[],
  issues: ValidationIssue[],
  documentTotal: number | null
): number {
  if (items.length === 0) return 0;

  let score = 100;

  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;

  score -= errors * 15;
  score -= warnings * 5;

  const highConfidence = items.filter((i) => i.confidence === "high").length;
  const lowConfidence = items.filter((i) => i.confidence === "low").length;
  const confidenceRatio = highConfidence / items.length;
  score += Math.round(confidenceRatio * 10);
  score -= Math.round((lowConfidence / items.length) * 10);

  if (documentTotal !== null) {
    const itemsTotal = items.reduce((s, i) => s + i.total, 0);
    const gapPct = Math.abs(documentTotal - itemsTotal) / documentTotal;
    if (gapPct < 0.01) score += 10;
    else if (gapPct < 0.05) score += 5;
    else if (gapPct > 0.2) score -= 15;
  }

  return Math.max(0, Math.min(100, score));
}

export function validateItems(
  items: NormalizedLineItem[],
  documentTotal: number | null
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const validItems: NormalizedLineItem[] = [];
  const invalidItems: NormalizedLineItem[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const itemIssues: ValidationIssue[] = [];

    const missingDesc = checkMissingDescription(item, i);
    if (missingDesc) itemIssues.push(missingDesc);

    const zeroTotal = checkZeroTotal(item, i);
    if (zeroTotal) itemIssues.push(zeroTotal);

    const negTotal = checkNegativeTotal(item, i);
    if (negTotal) itemIssues.push(negTotal);

    const mathIssue = checkMathConsistency(item, i);
    if (mathIssue) itemIssues.push(mathIssue);

    const rateIssue = checkImplausibleRate(item, i);
    if (rateIssue) itemIssues.push(rateIssue);

    const qtyIssue = checkImplausibleQty(item, i);
    if (qtyIssue) itemIssues.push(qtyIssue);

    issues.push(...itemIssues);

    const hasErrors = itemIssues.some((iss) => iss.severity === "error");
    if (hasErrors) {
      invalidItems.push(item);
    } else {
      validItems.push(item);
    }
  }

  const dupeIssues = detectDuplicates(validItems);
  issues.push(...dupeIssues);

  const dupeErrorIndexes = new Set(
    dupeIssues.filter((i) => i.severity === "error").map((i) => i.itemIndex)
  );

  const finalValid = validItems.filter((_, idx) => !dupeErrorIndexes.has(idx));
  const dupeInvalid = validItems.filter((_, idx) => dupeErrorIndexes.has(idx));
  invalidItems.push(...dupeInvalid);

  const itemsTotal = roundTo2(finalValid.reduce((s, i) => s + i.total, 0));

  checkDocumentTotalGap(itemsTotal, documentTotal, issues);
  checkSignificantMismatch(itemsTotal, documentTotal, issues);

  const parsingGap =
    documentTotal !== null ? roundTo2(documentTotal - itemsTotal) : 0;
  const parsingGapPercent =
    documentTotal !== null && documentTotal > 0
      ? roundTo2((Math.abs(parsingGap) / documentTotal) * 100)
      : 0;
  const hasGap = parsingGapPercent > 2;

  const gap = documentTotal !== null ? parsingGap : null;
  const gapPct =
    documentTotal !== null && documentTotal > 0
      ? roundTo2(Math.abs(parsingGap) / documentTotal)
      : null;

  const score = computeScore(finalValid, issues, documentTotal);
  const hasCriticalErrors = issues.some(
    (i) => i.severity === "error" && i.type !== "duplicate"
  );

  return {
    validItems: finalValid,
    invalidItems,
    issues,
    score,
    itemsTotal,
    documentTotal,
    documentTotalGap: gap,
    documentTotalGapPct: gapPct,
    parsingGap,
    parsingGapPercent,
    hasGap,
    hasCriticalErrors,
  };
}
