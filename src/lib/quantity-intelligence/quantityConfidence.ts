import type { ScoredSupplier } from './quantityScoring';
import type { ReferenceQuantityResult } from './referenceQuantityEngine';
import type { MatchedLineGroup } from './lineMatcher';

export type ReferenceConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface SupplierConfidence {
  quoteId: string;
  level: ReferenceConfidenceLevel;
  score: number;
  factors: ConfidenceFactor[];
  commercialInterpretation: CommercialInterpretation;
  trueQuantityRange: TrueQuantityRange | null;
}

export interface ConfidenceFactor {
  label: string;
  impact: 'positive' | 'negative' | 'neutral';
  detail: string;
}

export interface CommercialInterpretation {
  primaryDriver: 'drawing_gaps' | 'supplier_assumptions' | 'missing_scope' | 'pricing_strategy' | 'aligned';
  explanation: string;
  underOverLabel: string;
  actionNote: string;
}

export interface TrueQuantityRange {
  min: number;
  max: number;
  baseline: number;
  unit: string;
}

export interface LineConfidence {
  normalizedKey: string;
  level: ReferenceConfidenceLevel;
  score: number;
  underOverLabel: string;
  underOverSeverity: 'critical' | 'warning' | 'info' | 'success' | 'neutral';
}

const PROTECTION_STATEMENT =
  'Quantity comparisons are based on reference quantities derived from available documentation. Where confidence is low, differences may reflect drawing incompleteness rather than supplier pricing behaviour.';

export { PROTECTION_STATEMENT };

function classifyLevel(score: number): ReferenceConfidenceLevel {
  if (score >= 70) return 'HIGH';
  if (score >= 40) return 'MEDIUM';
  return 'LOW';
}

export function computeLineConfidence(
  ref: ReferenceQuantityResult | undefined,
  supplierQty: number | null,
): LineConfidence & { normalizedKey: string } {
  const spread = ref?.quantitySpreadPercent ?? null;
  const refQty = ref?.referenceQuantity ?? null;
  const supplierCount = ref?.supplierQuantities?.length ?? 0;

  let score = 100;
  const factors: ConfidenceFactor[] = [];

  if (spread === null) {
    score -= 50;
    factors.push({ label: 'No spread data', impact: 'negative', detail: 'Cannot compute quantity spread — reference unreliable.' });
  } else if (spread >= 40) {
    score -= 40;
  } else if (spread >= 20) {
    score -= 20;
  } else if (spread < 10) {
    score += 5;
  }

  if (supplierCount >= 3) {
    score += 5;
  } else if (supplierCount === 1) {
    score -= 20;
  }

  if (refQty === null) {
    score -= 30;
  }

  score = Math.max(0, Math.min(100, score));
  const level = classifyLevel(score);

  let underOverLabel = '';
  let underOverSeverity: LineConfidence['underOverSeverity'] = 'neutral';

  if (supplierQty !== null && refQty !== null) {
    const ratio = supplierQty / refQty;
    const isUnder = ratio < 0.85;
    const isOver = ratio > 1.20;

    if (level === 'HIGH') {
      if (isUnder) {
        underOverLabel = 'Under-allowance risk';
        underOverSeverity = 'critical';
      } else if (isOver) {
        underOverLabel = 'Over-allowance';
        underOverSeverity = 'info';
      } else {
        underOverLabel = 'Aligned';
        underOverSeverity = 'success';
      }
    } else if (level === 'MEDIUM') {
      if (isUnder) {
        underOverLabel = 'Probable under-allowance position';
        underOverSeverity = 'warning';
      } else if (isOver) {
        underOverLabel = 'Probable over-allowance position';
        underOverSeverity = 'info';
      } else {
        underOverLabel = 'Broadly aligned';
        underOverSeverity = 'success';
      }
    } else {
      underOverLabel = 'Quantity variance detected — low confidence';
      underOverSeverity = 'neutral';
    }
  }

  return {
    normalizedKey: '',
    level,
    score,
    underOverLabel,
    underOverSeverity,
  };
}

function identifyCommercialDriver(
  s: ScoredSupplier,
  spread: number,
  supplierCount: number,
  hasProvisional: boolean,
): CommercialInterpretation {
  const gapAbs = Math.abs(s.quantityGapValue);
  const gapPct = s.rawTotal > 0 ? (gapAbs / s.rawTotal) * 100 : 0;

  if (!s.underallowanceFlag && gapPct < 5) {
    return {
      primaryDriver: 'aligned',
      explanation: `${s.supplierName}'s quantities align closely with the reference across matched lines. Quantity completeness is not a material concern for this supplier.`,
      underOverLabel: 'Quantities aligned',
      actionNote: 'No quantity adjustment required for commercial comparison.',
    };
  }

  if (spread >= 35) {
    return {
      primaryDriver: 'drawing_gaps',
      explanation: `High spread (${spread.toFixed(1)}%) across suppliers for lines where ${s.supplierName} is under-allowed suggests document ambiguity. Discrepancy may stem from incomplete drawings or differing scope interpretations rather than pricing strategy.`,
      underOverLabel: s.underallowanceFlag ? 'Possible drawing gap' : 'Drawing ambiguity',
      actionNote: 'Request RFI to clarify scope from documentation. Do not treat as pricing advantage without confirmation.',
    };
  }

  if (hasProvisional && s.underallowanceFlag) {
    return {
      primaryDriver: 'missing_scope',
      explanation: `${s.supplierName} appears to have omitted provisional or extra-over items that other suppliers have priced. The quantity gap of ${formatCurrency(gapAbs)} may represent scope that has not been included in this submission.`,
      underOverLabel: 'Possible scope omission',
      actionNote: 'Confirm whether provisional items are included. Request clarification before award.',
    };
  }

  if (supplierCount >= 3 && spread < 20 && s.underallowanceFlag) {
    return {
      primaryDriver: 'supplier_assumptions',
      explanation: `${s.supplierName} is consistently below a well-converged reference (${supplierCount} suppliers, ${spread.toFixed(1)}% spread). The gap of ${formatCurrency(gapAbs)} is likely a supplier assumption — possibly an optimistic quantity estimate or rate arbitrage.`,
      underOverLabel: 'Likely supplier assumption',
      actionNote: 'Seek quantity confirmation from supplier. Normalised total should be used for commercial comparison.',
    };
  }

  if (gapPct > 15 && s.underallowedLinesCount >= 3) {
    return {
      primaryDriver: 'pricing_strategy',
      explanation: `${s.supplierName} shows a pattern of under-allowance across ${s.underallowedLinesCount} lines, with total gap of ${formatCurrency(gapAbs)} (${gapPct.toFixed(1)}% of quoted total). This pattern may indicate deliberate quantity reduction as a pricing strategy.`,
      underOverLabel: 'Potential pricing strategy',
      actionNote: 'Review under-allowed lines individually. Consider normalised total for fair comparison.',
    };
  }

  return {
    primaryDriver: 'supplier_assumptions',
    explanation: `${s.supplierName} shows a quantity gap of ${formatCurrency(gapAbs)}. Variance likely reflects supplier assumptions on scope interpretation or measurement methodology.`,
    underOverLabel: 'Quantity gap detected',
    actionNote: 'Review matched lines for systematic quantity differences.',
  };
}

function computeTrueQuantityRange(
  s: ScoredSupplier,
  allRefs: Map<string, ReferenceQuantityResult>,
): TrueQuantityRange | null {
  const refs = [...allRefs.values()].filter(r => r.referenceQuantity !== null && r.highestQuantity !== null && r.lowestQuantity !== null);
  if (refs.length === 0) return null;

  const baselineTotal = refs.reduce((sum, r) => sum + (r.referenceQuantity ?? 0), 0);
  const minTotal = refs.reduce((sum, r) => sum + (r.lowestQuantity ?? 0), 0);
  const maxTotal = refs.reduce((sum, r) => sum + (r.highestQuantity ?? 0), 0);

  if (baselineTotal === 0) return null;

  return {
    min: parseFloat(minTotal.toFixed(2)),
    max: parseFloat(maxTotal.toFixed(2)),
    baseline: parseFloat(baselineTotal.toFixed(2)),
    unit: 'items',
  };
}

export function computeSupplierConfidence(
  s: ScoredSupplier,
  matchedGroups: MatchedLineGroup[],
  referenceResults: Map<string, ReferenceQuantityResult>,
): SupplierConfidence {
  const factors: ConfidenceFactor[] = [];
  let score = 100;

  const supplierRefs = matchedGroups
    .map(g => referenceResults.get(g.normalizedKey))
    .filter(Boolean) as ReferenceQuantityResult[];

  const avgSpread = supplierRefs.length > 0
    ? supplierRefs.reduce((s, r) => s + (r.quantitySpreadPercent ?? 0), 0) / supplierRefs.length
    : 0;

  if (avgSpread >= 35) {
    score -= 35;
    factors.push({ label: 'High spread', impact: 'negative', detail: `Average quantity spread ${avgSpread.toFixed(1)}% — reference quantities are divergent.` });
  } else if (avgSpread >= 15) {
    score -= 15;
    factors.push({ label: 'Moderate spread', impact: 'negative', detail: `Average quantity spread ${avgSpread.toFixed(1)}% — some lines show meaningful variance.` });
  } else {
    factors.push({ label: 'Low spread', impact: 'positive', detail: `Average quantity spread ${avgSpread.toFixed(1)}% — suppliers are well-converged.` });
  }

  const supplierCount = matchedGroups.length > 0
    ? (matchedGroups[0]?.supplierValues?.length ?? 1)
    : 1;

  if (supplierCount >= 4) {
    score += 10;
    factors.push({ label: 'Strong supplier convergence', impact: 'positive', detail: `${supplierCount} suppliers compared — reference quantity is robust.` });
  } else if (supplierCount === 3) {
    score += 5;
    factors.push({ label: 'Good supplier convergence', impact: 'positive', detail: `${supplierCount} suppliers compared.` });
  } else if (supplierCount === 2) {
    score -= 10;
    factors.push({ label: 'Limited convergence', impact: 'negative', detail: 'Only 2 suppliers — reference derived from small sample.' });
  } else {
    score -= 25;
    factors.push({ label: 'Single supplier', impact: 'negative', detail: 'Only 1 supplier — no meaningful reference convergence.' });
  }

  if (s.completenessScore >= 85) {
    score += 10;
    factors.push({ label: 'High classification confidence', impact: 'positive', detail: `Completeness score ${s.completenessScore.toFixed(0)}/100 — quantities well-matched to reference.` });
  } else if (s.completenessScore < 65) {
    score -= 15;
    factors.push({ label: 'Low classification confidence', impact: 'negative', detail: `Completeness score ${s.completenessScore.toFixed(0)}/100 — many lines below reference threshold.` });
  }

  const hasProvisional = avgSpread > 25 && s.underallowedLinesCount > 0;
  if (hasProvisional) {
    score -= 10;
    factors.push({ label: 'Provisional/extra-over risk', impact: 'negative', detail: 'High spread with under-allowance suggests provisional items may be missing from this submission.' });
  }

  score = Math.max(0, Math.min(100, score));
  const level = classifyLevel(score);
  const interpretation = identifyCommercialDriver(s, avgSpread, supplierCount, hasProvisional);
  const trueRange = computeTrueQuantityRange(s, referenceResults);

  return {
    quoteId: s.quoteId,
    level,
    score,
    factors,
    commercialInterpretation: interpretation,
    trueQuantityRange: trueRange,
  };
}

export function computeAllConfidence(
  suppliers: ScoredSupplier[],
  matchedGroups: MatchedLineGroup[],
  referenceResults: Map<string, ReferenceQuantityResult>,
): Map<string, SupplierConfidence> {
  const map = new Map<string, SupplierConfidence>();
  for (const s of suppliers) {
    map.set(s.quoteId, computeSupplierConfidence(s, matchedGroups, referenceResults));
  }
  return map;
}

function formatCurrency(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000).toLocaleString()}k`;
  return `$${v.toLocaleString()}`;
}
