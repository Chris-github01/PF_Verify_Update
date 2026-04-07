/**
 * Enhanced Award Report Calculations and Utilities
 * Provides advanced metrics, visuals data, and scoring for QS/Commercial Director reports
 *
 * COMPARISON MODE LOGIC:
 * Suppliers are classified by how much of the scope they've itemised:
 *   FULLY_ITEMISED  → itemised coverage > 70%
 *   PARTIAL_BREAKDOWN → 20–70%
 *   LUMP_SUM        → < 20%
 *
 * This drives price normalisation, confidence scoring, and hard ranking rules.
 */

export type ComparisonMode = 'FULLY_ITEMISED' | 'PARTIAL_BREAKDOWN' | 'LUMP_SUM';

export interface EnhancedSupplierMetrics {
  supplierName: string;
  totalPrice: number;
  systemsCovered: number;
  totalSystems: number;
  coveragePercent: number;
  quoteId?: string;
  itemsQuoted?: number;

  // Comparison mode classification
  comparisonMode: ComparisonMode;

  // Comparable price (scope-adjusted for apples-to-apples comparison)
  comparablePrice: number;

  // Confidence in the price comparison (0-10)
  confidenceScore: number;

  // Normalized metrics
  normalizedPricePerSystem: number;
  variancePercent: number;  // vs. FULLY_ITEMISED median benchmark
  varianceFromLowest: number;

  // Risk scoring (0-10 where HIGHER is better)
  rawRiskScore: number;
  riskMitigationScore: number;

  // Detailed scores (0-10)
  priceScore: number;
  complianceScore: number;
  coverageScore: number;
  riskScore: number;

  // Weighted total (0-100)
  weightedTotal: number;

  // Coverage breakdown by major systems for chart
  systemsBreakdown: Array<{
    category: string;
    count: number;
    percentage: number;
    color: string;
  }>;

  // Top scope gaps with estimated costs
  scopeGaps: Array<{
    description: string;
    estimatedCost: number;
    severity: 'low' | 'medium' | 'high';
    system?: string;
    category?: string;
    itemsCount?: number;
    estimatedImpact?: string;
    details?: string[];
  }>;

  rank: number;
  isBestValue: boolean;
  isLowestRisk: boolean;
  isMultiplierQuote?: boolean;
  levelsMultiplier?: number | null;
  isLumpSumQuote?: boolean;
  itemsTotal?: number;
}

export interface ScoringWeights {
  price: number;       // Default: 35%
  compliance: number;  // Default: 20%
  coverage: number;    // Default: 15%
  risk: number;        // Default: 15%
  confidence: number;  // Default: 15%
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  price: 35,
  compliance: 20,
  coverage: 15,
  risk: 15,
  confidence: 15,
};

/**
 * Determine comparison mode from coverage percentage.
 * Uses the itemised coverage to classify how thoroughly a supplier has broken down their price.
 */
export function determineComparisonMode(coveragePercent: number): ComparisonMode {
  if (coveragePercent > 70) return 'FULLY_ITEMISED';
  if (coveragePercent >= 20) return 'PARTIAL_BREAKDOWN';
  return 'LUMP_SUM';
}

/**
 * Confidence score (0-10) based on comparison mode.
 * Fully itemised quotes are fully trustworthy; lump sums carry significant pricing uncertainty.
 */
export function calculateConfidenceScore(mode: ComparisonMode): number {
  switch (mode) {
    case 'FULLY_ITEMISED':    return 10;
    case 'PARTIAL_BREAKDOWN': return 7;
    case 'LUMP_SUM':          return 4;
  }
}

/**
 * Calculate comparable price — scope-adjusted so all suppliers are measured on the same basis.
 *
 * FULLY_ITEMISED:    use normalized BOQ total (no adjustment needed)
 * PARTIAL_BREAKDOWN: use adjusted total from equalisation (already scope-adjusted by caller)
 *                    — if no equalisation available, apply same scopeFactor logic
 * LUMP_SUM:          apply scopeFactor = average coverage of FULLY_ITEMISED suppliers
 *                    comparablePrice = totalPrice × scopeFactor
 */
export function calculateComparablePrice(
  totalPrice: number,
  mode: ComparisonMode,
  scopeFactor: number
): number {
  switch (mode) {
    case 'FULLY_ITEMISED':
      return totalPrice;
    case 'PARTIAL_BREAKDOWN':
      // Apply a partial adjustment — halfway between raw and fully normalised
      return totalPrice * ((1 + scopeFactor) / 2);
    case 'LUMP_SUM':
      return totalPrice * scopeFactor;
  }
}

/**
 * Calculate variance against the FULLY_ITEMISED median benchmark.
 * Falls back to average of all comparablePrices if no fully itemised suppliers exist.
 */
export function calculateVariancePercent(supplierComparablePrice: number, benchmark: number): number {
  if (benchmark === 0) return 0;
  return ((supplierComparablePrice - benchmark) / benchmark) * 100;
}

/**
 * Calculate price score (0-10, where 10 = cheapest).
 * Uses comparable prices for fair comparison, then applies mode-based confidence multiplier.
 *
 * Mode penalties (confidence multipliers):
 *   FULLY_ITEMISED:    × 1.0 (no penalty)
 *   PARTIAL_BREAKDOWN: × 0.8
 *   LUMP_SUM:          × 0.6
 */
export function calculatePriceScore(
  comparablePrice: number,
  lowestComparablePrice: number,
  highestComparablePrice: number,
  mode: ComparisonMode
): number {
  let rawScore: number;

  if (highestComparablePrice === lowestComparablePrice) {
    rawScore = 10;
  } else if (comparablePrice === lowestComparablePrice) {
    rawScore = 10;
  } else {
    const range = highestComparablePrice - lowestComparablePrice;
    const avgPrice = (highestComparablePrice + lowestComparablePrice) / 2;
    if (comparablePrice === highestComparablePrice && range / avgPrice < 0.05) {
      rawScore = 8;
    } else {
      const normalized = (comparablePrice - lowestComparablePrice) / range;
      rawScore = Math.max(0, 10 - (normalized * 10));
    }
  }

  // Apply mode-based confidence multiplier
  const multiplier = mode === 'FULLY_ITEMISED' ? 1.0
    : mode === 'PARTIAL_BREAKDOWN' ? 0.8
    : 0.6;

  return rawScore * multiplier;
}

/**
 * Calculate compliance score (0-10).
 * Based on missing scope items relative to the worst performer.
 * Gentler formula than risk — can only drop to 5 (suppliers always partially pass).
 */
export function calculateComplianceScore(rawRiskScore: number, maxRisk: number): number {
  if (maxRisk === 0) return 10;
  if (rawRiskScore === 0) return 10;

  if (maxRisk <= 3) {
    const penalty = (rawRiskScore / maxRisk) * 2;
    return Math.max(8, 10 - penalty);
  }

  const normalized = Math.min(rawRiskScore / maxRisk, 1);
  return Math.max(5, 10 - (normalized * 5));
}

/**
 * Calculate coverage score (0-10).
 *
 * LUMP_SUM: fixed at 5 (can't evaluate scope completeness from a single number)
 * Others:   direct mapping from percentage
 */
export function calculateCoverageScore(coveragePercent: number, mode: ComparisonMode): number {
  if (mode === 'LUMP_SUM') return 5;
  return (coveragePercent / 100) * 10;
}

/**
 * Calculate risk mitigation score (0-10, where HIGHER is better).
 * Inverts the raw missing-items count for display.
 */
export function calculateRiskMitigationScore(rawRiskScore: number, maxRisk: number): number {
  if (maxRisk === 0) return 10;
  if (rawRiskScore === 0) return 10;

  if (rawRiskScore === maxRisk && maxRisk <= 3) {
    return Math.max(7, 10 - (maxRisk * 1.5));
  }

  const normalized = Math.min(rawRiskScore / maxRisk, 1);
  return Math.max(0, 10 - (normalized * 10));
}

/**
 * Calculate weighted total score (0-100).
 * New formula includes confidence as a distinct criterion (15% default).
 *
 * weightedScore =
 *   priceScore      × (price / 100)      × 10
 *   complianceScore × (compliance / 100) × 10
 *   coverageScore   × (coverage / 100)   × 10
 *   riskScore       × (risk / 100)       × 10
 *   confidenceScore × (confidence / 100) × 10
 */
export function calculateWeightedTotal(
  priceScore: number,
  complianceScore: number,
  coverageScore: number,
  riskScore: number,
  confidenceScore: number,
  weights: ScoringWeights = DEFAULT_WEIGHTS
): number {
  const total = (
    (priceScore      * weights.price       / 100) * 10 +
    (complianceScore * weights.compliance  / 100) * 10 +
    (coverageScore   * weights.coverage    / 100) * 10 +
    (riskScore       * weights.risk        / 100) * 10 +
    (confidenceScore * (weights.confidence ?? 15) / 100) * 10
  );
  return Math.round(total * 10) / 10;
}

/**
 * Compute the benchmark price for variance calculation.
 * Preferred: median of FULLY_ITEMISED comparable prices.
 * Fallback:  median of all comparable prices.
 */
export function computeBenchmarkPrice(
  suppliers: Array<{ comparablePrice: number; comparisonMode: ComparisonMode }>
): number {
  const fullyItemised = suppliers
    .filter(s => s.comparisonMode === 'FULLY_ITEMISED')
    .map(s => s.comparablePrice);

  const prices = fullyItemised.length > 0
    ? fullyItemised
    : suppliers.map(s => s.comparablePrice);

  if (prices.length === 0) return 0;

  const sorted = [...prices].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Compute the scope factor used to normalise lump sum / partial quotes.
 * = average coverage % of FULLY_ITEMISED suppliers (as a decimal, e.g. 0.95)
 * Falls back to 1.0 if no fully itemised suppliers exist.
 */
export function computeScopeFactor(
  suppliers: Array<{ coveragePercent: number; comparisonMode: ComparisonMode }>
): number {
  const fullyItemised = suppliers.filter(s => s.comparisonMode === 'FULLY_ITEMISED');
  if (fullyItemised.length === 0) return 1.0;
  const avg = fullyItemised.reduce((sum, s) => sum + s.coveragePercent, 0) / fullyItemised.length;
  return avg / 100;
}

/**
 * Calculate normalized price per unit/quantity
 */
export function calculateNormalizedPrice(totalPrice: number, systemsCovered: number): number {
  if (systemsCovered === 0) return 0;
  return totalPrice / systemsCovered;
}

/**
 * Generate systems breakdown for pie chart
 */
export function generateSystemsBreakdown(
  items: Array<{ category: string; isQuoted: boolean }>,
  totalSystems: number
): Array<{ category: string; count: number; percentage: number; color: string }> {
  const categoryCounts = new Map<string, number>();

  items.forEach(item => {
    if (item.isQuoted) {
      const count = categoryCounts.get(item.category) || 0;
      categoryCounts.set(item.category, count + 1);
    }
  });

  const colors = [
    '#10b981',
    '#3b82f6',
    '#f59e0b',
    '#06b6d4',
    '#ef4444',
    '#f97316',
    '#84cc16',
    '#14b8a6',
  ];

  const breakdown: Array<{ category: string; count: number; percentage: number; color: string }> = [];
  let colorIndex = 0;

  categoryCounts.forEach((count, category) => {
    breakdown.push({
      category,
      count,
      percentage: (count / totalSystems) * 100,
      color: colors[colorIndex % colors.length],
    });
    colorIndex++;
  });

  return breakdown.sort((a, b) => b.count - a.count);
}

/**
 * Estimate scope gap costs using actual item-specific data.
 * Rate sourced from: market average from other suppliers → project average as fallback.
 * Cost = baseRate × quantity × 1.2 (20% procurement markup)
 */
export function estimateScopeGapCosts(
  missingItems: Array<{ description: string; category?: string; quantity?: number; suppliers?: Record<string, any> }>,
  averageUnitRate: number,
  systemsCovered: number,
  totalSystems: number
): Array<{ description: string; estimatedCost: number; severity: 'low' | 'medium' | 'high'; system?: string; category?: string; itemsCount?: number; estimatedImpact?: string; details?: string[] }> {
  const coveragePercent = (systemsCovered / totalSystems) * 100;
  const markup = 1.2;

  const gaps = missingItems.map((item, index) => {
    let baseRate = averageUnitRate;
    const quantity = item.quantity || 1;

    if (item.suppliers) {
      const supplierRates: number[] = [];
      Object.values(item.suppliers).forEach((supplierData: any) => {
        if (supplierData?.unitPrice && supplierData.unitPrice > 0) {
          supplierRates.push(supplierData.unitPrice);
        }
      });
      if (supplierRates.length > 0) {
        baseRate = supplierRates.reduce((sum, rate) => sum + rate, 0) / supplierRates.length;
      }
    }

    const estimatedCost = baseRate * quantity * markup;

    let severity: 'low' | 'medium' | 'high' = 'medium';
    if (estimatedCost > 10000 || (coveragePercent < 70 && index < 2)) {
      severity = 'high';
    } else if (estimatedCost < 2000 || coveragePercent > 90) {
      severity = 'low';
    }

    return {
      description: item.description,
      estimatedCost: Math.round(estimatedCost),
      severity,
      category: item.category,
      _sortCost: estimatedCost,
    };
  });

  return gaps
    .sort((a, b) => b._sortCost - a._sortCost)
    .map(({ description, estimatedCost, severity, ...item }) => ({
      description,
      estimatedCost,
      severity,
      system: description,
      category: item.category,
      itemsCount: 1,
      estimatedImpact: `Est. ${formatCurrency(estimatedCost)} @ 20% markup`,
      details: item.category ? [item.category] : [],
    }));
}

/**
 * Calculate estimated full-scope cost for supplier
 */
export function calculateFullScopeCost(
  currentTotal: number,
  systemsCovered: number,
  totalSystems: number,
  averageMarketRate: number
): number {
  if (systemsCovered === totalSystems) return currentTotal;
  const missingItems = totalSystems - systemsCovered;
  const avgPricePerSystem = currentTotal / systemsCovered;
  const estimatedMissingCost = missingItems * avgPricePerSystem * 1.15;
  return currentTotal + estimatedMissingCost;
}

/**
 * Calculate potential savings vs highest bid
 */
export function calculatePotentialSavings(
  recommendedPrice: number,
  highestPrice: number,
  recommendedCoverage: number,
  highestCoverage: number
): number {
  const normalizedRecommended = recommendedPrice / (recommendedCoverage / 100);
  const normalizedHighest = highestPrice / (highestCoverage / 100);
  return Math.max(0, normalizedHighest - normalizedRecommended);
}

/**
 * Generate color for score (0-10)
 */
export function getScoreColor(score: number): string {
  if (score >= 8) return '#10b981';
  if (score >= 6) return '#3b82f6';
  if (score >= 4) return '#f59e0b';
  return '#ef4444';
}

/**
 * Generate severity badge color
 */
export function getSeverityColor(severity: 'low' | 'medium' | 'high' | 'critical'): string {
  switch (severity) {
    case 'low':      return '#10b981';
    case 'medium':   return '#f59e0b';
    case 'high':     return '#ef4444';
    case 'critical': return '#991b1b';
  }
}

/**
 * Format currency for NZ
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-NZ', {
    style: 'currency',
    currency: 'NZD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format percentage
 */
export function formatPercent(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Human-readable label for comparison mode
 */
export function comparisonModeLabel(mode: ComparisonMode): string {
  switch (mode) {
    case 'FULLY_ITEMISED':    return 'Detailed';
    case 'PARTIAL_BREAKDOWN': return 'Partial';
    case 'LUMP_SUM':          return 'Lump Sum';
  }
}

/**
 * Color classes for comparison mode badge
 */
export function comparisonModeBadgeClasses(mode: ComparisonMode): string {
  switch (mode) {
    case 'FULLY_ITEMISED':
      return 'bg-green-600/20 text-green-400 border-green-600/50';
    case 'PARTIAL_BREAKDOWN':
      return 'bg-amber-600/20 text-amber-400 border-amber-600/50';
    case 'LUMP_SUM':
      return 'bg-slate-600/30 text-slate-400 border-slate-500/40';
  }
}
