import type { ScopeItemClassification, SupplierScopeSummary } from './types';
import { CLASSIFIER_VERSION, SCOPE_COVERAGE_THRESHOLDS } from './scopeIntelligenceConfig';

interface BucketCounts {
  core_scope: number;
  secondary_scope: number;
  optional_scope: number;
  excluded_scope: number;
  risk_scope: number;
  summary_only: number;
  unknown_scope: number;
}

interface BucketWeights {
  core_scope: number;
  secondary_scope: number;
  [key: string]: number;
}

function countBuckets(classifications: ScopeItemClassification[]): BucketCounts {
  const counts: BucketCounts = {
    core_scope: 0,
    secondary_scope: 0,
    optional_scope: 0,
    excluded_scope: 0,
    risk_scope: 0,
    summary_only: 0,
    unknown_scope: 0,
  };
  for (const c of classifications) {
    counts[c.scopeBucket as keyof BucketCounts]++;
  }
  return counts;
}

function sumWeights(classifications: ScopeItemClassification[]): BucketWeights {
  const weights: BucketWeights = { core_scope: 0, secondary_scope: 0 };
  for (const c of classifications) {
    if (c.commercialWeight > 0) {
      weights[c.scopeBucket] = (weights[c.scopeBucket] ?? 0) + c.commercialWeight;
    }
  }
  return weights;
}

function computeCoreCoveragePct(
  classifications: ScopeItemClassification[],
  totalPositiveWeight: number,
): number {
  if (totalPositiveWeight === 0) return 0;
  const coreWeight = classifications
    .filter((c) => c.scopeBucket === 'core_scope')
    .reduce((sum, c) => sum + c.commercialWeight, 0);
  return Math.min((coreWeight / totalPositiveWeight) * 100, 100);
}

function computeSecondaryCoveragePct(
  classifications: ScopeItemClassification[],
  totalPositiveWeight: number,
): number {
  if (totalPositiveWeight === 0) return 0;
  const secondaryWeight = classifications
    .filter((c) => c.scopeBucket === 'secondary_scope')
    .reduce((sum, c) => sum + c.commercialWeight, 0);
  return Math.min((secondaryWeight / totalPositiveWeight) * 100, 100);
}

function computeVariationExposureScore(counts: BucketCounts, total: number): number {
  if (total === 0) return 0;
  const riskPct = (counts.risk_scope / total) * 100;
  const exclusionPct = (counts.excluded_scope / total) * 100;
  const unknownPct = (counts.unknown_scope / total) * 100;
  const raw = riskPct * 0.5 + exclusionPct * 0.3 + unknownPct * 0.2;
  return Math.min(Math.round(raw), 100);
}

function computeScopeConfidenceScore(classifications: ScopeItemClassification[]): number {
  if (classifications.length === 0) return 0;
  const totalConfidence = classifications.reduce((sum, c) => sum + c.confidence, 0);
  return Math.round(totalConfidence / classifications.length);
}

function buildScopeSummaryText(
  coreCoveragePct: number,
  counts: BucketCounts,
  variationExposureScore: number,
  supplierName: string,
): string {
  const parts: string[] = [];

  if (coreCoveragePct >= SCOPE_COVERAGE_THRESHOLDS.CORE_STRONG) {
    parts.push(`${supplierName} demonstrates strong core scope coverage (${coreCoveragePct.toFixed(0)}%).`);
  } else if (coreCoveragePct >= SCOPE_COVERAGE_THRESHOLDS.CORE_WARN) {
    parts.push(`${supplierName} has adequate core scope coverage (${coreCoveragePct.toFixed(0)}%), though some gaps remain.`);
  } else if (coreCoveragePct >= SCOPE_COVERAGE_THRESHOLDS.CORE_FAIL) {
    parts.push(`${supplierName} has below-target core scope coverage (${coreCoveragePct.toFixed(0)}%) — review recommended.`);
  } else {
    parts.push(`${supplierName} only covers ${coreCoveragePct.toFixed(0)}% of inferred core scope. Significant gaps identified.`);
  }

  if (counts.excluded_scope >= 5) {
    parts.push(`High exclusion density (${counts.excluded_scope} items) significantly affects true scope.`);
  } else if (counts.excluded_scope >= 2) {
    parts.push(`${counts.excluded_scope} exclusion(s) noted — confirm commercial treatment.`);
  }

  if (counts.risk_scope >= 4) {
    parts.push(`Elevated variation exposure via ${counts.risk_scope} risk/assumption items. These may return as variations post-award.`);
  } else if (counts.risk_scope >= 2) {
    parts.push(`${counts.risk_scope} risk-scope items (assumptions/provisional) carry future variation potential.`);
  }

  if (variationExposureScore >= 60) {
    parts.push('Overall variation exposure is elevated. Recommend detailed qualification review.');
  }

  if (counts.unknown_scope >= 6) {
    parts.push(`${counts.unknown_scope} items could not be reliably classified — confidence in scope analysis is reduced.`);
  }

  return parts.join(' ');
}

export function aggregateSupplierScope(
  classifications: ScopeItemClassification[],
  quoteId: string,
  projectId: string,
  organisationId: string,
  supplierName: string,
  submittedTotal: number | null = null,
  normalisedTotal: number | null = null,
): SupplierScopeSummary {
  const counts = countBuckets(classifications);
  const weights = sumWeights(classifications);

  const positiveItems = classifications.filter((c) => c.commercialWeight > 0);
  const totalPositiveWeight = positiveItems.reduce((s, c) => s + c.commercialWeight, 0);

  const coreCoveragePct = computeCoreCoveragePct(classifications, totalPositiveWeight);
  const secondaryCoveragePct = computeSecondaryCoveragePct(classifications, totalPositiveWeight);
  const scopeConfidenceScore = computeScopeConfidenceScore(classifications);
  const variationExposureScore = computeVariationExposureScore(counts, classifications.length);
  const summaryText = buildScopeSummaryText(coreCoveragePct, counts, variationExposureScore, supplierName);

  return {
    projectId,
    quoteId,
    organisationId,
    supplierName,
    submittedTotal,
    normalisedTotal,
    coreScope: {
      coveragePct: coreCoveragePct,
      itemCount: counts.core_scope,
      weightedValue: weights.core_scope ?? 0,
    },
    secondaryScope: {
      coveragePct: secondaryCoveragePct,
      itemCount: counts.secondary_scope,
    },
    excludedScopeCount: counts.excluded_scope,
    riskScopeCount: counts.risk_scope,
    optionalScopeCount: counts.optional_scope,
    unknownScopeCount: counts.unknown_scope,
    summaryOnlyCount: counts.summary_only,
    totalClassifiedItems: classifications.length,
    scopeConfidenceScore,
    likelyVariationExposureScore: variationExposureScore,
    scopeSummaryText: summaryText,
    classificationVersion: CLASSIFIER_VERSION,
    computedAt: new Date().toISOString(),
  };
}

export function buildComparisonView(
  summaries: SupplierScopeSummary[],
): {
  supplierName: string;
  coreCoveragePct: number;
  riskScopeCount: number;
  excludedScopeCount: number;
  variationExposure: number;
  scopeConfidence: number;
  summaryText: string;
}[] {
  return summaries.map((s) => ({
    supplierName: s.supplierName,
    coreCoveragePct: s.coreScope.coveragePct,
    riskScopeCount: s.riskScopeCount,
    excludedScopeCount: s.excludedScopeCount,
    variationExposure: s.likelyVariationExposureScore,
    scopeConfidence: s.scopeConfidenceScore,
    summaryText: s.scopeSummaryText,
  }));
}
