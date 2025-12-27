/**
 * Enhanced Award Report Calculations and Utilities
 * Provides advanced metrics, visuals data, and scoring for QS/Commercial Director reports
 */

export interface EnhancedSupplierMetrics {
  supplierName: string;
  totalPrice: number;
  systemsCovered: number; // CRITICAL: This is total QUANTITY (sum of all quantities), NOT line items count
  totalSystems: number;
  coveragePercent: number;
  quoteId?: string;
  itemsQuoted?: number; // Number of line items (for reference only)

  // NEW: Normalized metrics
  normalizedPricePerSystem: number; // Price divided by total QUANTITY (systemsCovered)
  variancePercent: number; // vs. average price
  varianceFromLowest: number;

  // NEW: Risk scoring (0-10 where HIGHER is better for display)
  rawRiskScore: number; // Original count of missing items (lower = better)
  riskMitigationScore: number; // 10 - (rawRiskScore normalized) for display

  // NEW: Detailed scores (0-10)
  priceScore: number; // 10 = cheapest, 0 = most expensive
  complianceScore: number; // Based on risk factors
  coverageScore: number; // Based on % covered
  riskScore: number; // Based on gaps/missing items

  // NEW: Weighted total (0-100)
  weightedTotal: number;

  // Coverage breakdown by major systems for pie chart
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
}

export interface ScoringWeights {
  price: number; // Default: 40%
  compliance: number; // Default: 25%
  coverage: number; // Default: 20%
  risk: number; // Default: 15%
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  price: 40,
  compliance: 25,
  coverage: 20,
  risk: 15,
};

/**
 * Calculate normalized price per unit/quantity
 * CRITICAL: systemsCovered should be the SUM of all quantities, NOT the count of line items
 * Example: If quote has 3 line items with quantities [100, 50, 25], systemsCovered = 175
 */
export function calculateNormalizedPrice(totalPrice: number, systemsCovered: number): number {
  if (systemsCovered === 0) return 0;
  return totalPrice / systemsCovered;
}

/**
 * Calculate variance percentage vs average
 */
export function calculateVariancePercent(supplierPrice: number, averagePrice: number): number {
  if (averagePrice === 0) return 0;
  return ((supplierPrice - averagePrice) / averagePrice) * 100;
}

/**
 * Calculate price score (0-10, where 10 = cheapest)
 * Uses inverse linear scaling
 */
export function calculatePriceScore(price: number, lowestPrice: number, highestPrice: number): number {
  // Edge case: if all prices are the same, everyone gets full marks
  if (highestPrice === lowestPrice) return 10;

  // Edge case: if price is lowest, give full marks
  if (price === lowestPrice) return 10;

  // Edge case: if price is highest, give minimum score (but not zero for single item difference)
  if (price === highestPrice && highestPrice > lowestPrice) {
    // Give at least 2.0 if there are only minor differences
    const range = highestPrice - lowestPrice;
    const avgPrice = (highestPrice + lowestPrice) / 2;
    if (range / avgPrice < 0.05) return 8; // Within 5% of average
  }

  const normalized = (price - lowestPrice) / (highestPrice - lowestPrice);
  return Math.max(0, 10 - (normalized * 10));
}

/**
 * Calculate compliance score (0-10)
 * Based on risk factors and quality indicators
 */
export function calculateComplianceScore(rawRiskScore: number, maxRisk: number): number {
  // Edge case: no risk anywhere, everyone gets full marks
  if (maxRisk === 0) return 10;

  // Edge case: if this supplier has no missing items, full marks
  if (rawRiskScore === 0) return 10;

  // Edge case: very low risk overall (1-3 items), be more lenient
  if (maxRisk <= 3) {
    const penalty = (rawRiskScore / maxRisk) * 2; // Max 2 point penalty
    return Math.max(8, 10 - penalty);
  }

  const normalized = Math.min(rawRiskScore / maxRisk, 1);
  return Math.max(5, 10 - (normalized * 5)); // Cap at 50% reduction, minimum 5.0
}

/**
 * Calculate coverage score (0-10)
 * Direct mapping from percentage
 */
export function calculateCoverageScore(coveragePercent: number): number {
  return (coveragePercent / 100) * 10;
}

/**
 * Calculate risk mitigation score (0-10, where HIGHER is better)
 * This inverts the raw risk score for display purposes
 */
export function calculateRiskMitigationScore(rawRiskScore: number, maxRisk: number): number {
  // Edge case: no risk anywhere, everyone gets full marks
  if (maxRisk === 0) return 10;

  // Edge case: if this supplier has no missing items, full marks
  if (rawRiskScore === 0) return 10;

  // Edge case: if this supplier has the max risk but it's only a few items, don't penalize too harshly
  if (rawRiskScore === maxRisk && maxRisk <= 3) {
    // With only 1-3 missing items max, give partial credit
    return Math.max(7, 10 - (maxRisk * 1.5)); // Gentler penalty for small numbers
  }

  const normalized = Math.min(rawRiskScore / maxRisk, 1);
  return Math.max(0, 10 - (normalized * 10));
}

/**
 * Calculate weighted total score (0-100)
 */
export function calculateWeightedTotal(
  priceScore: number,
  complianceScore: number,
  coverageScore: number,
  riskScore: number,
  weights: ScoringWeights = DEFAULT_WEIGHTS
): number {
  const total = (
    (priceScore * weights.price / 100) * 10 +
    (complianceScore * weights.compliance / 100) * 10 +
    (coverageScore * weights.coverage / 100) * 10 +
    (riskScore * weights.risk / 100) * 10
  );
  return Math.round(total * 10) / 10; // Round to 1 decimal
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
    '#10b981', // green
    '#3b82f6', // blue
    '#f59e0b', // orange
    '#8b5cf6', // purple
    '#ef4444', // red
    '#06b6d4', // cyan
    '#f97316', // deep orange
    '#6366f1', // indigo
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
 * Estimate scope gap costs using actual item-specific data
 *
 * METHODOLOGY:
 * 1. For each missing item, calculate base cost using market rates from other suppliers
 * 2. Apply 20% markup to account for procurement risk and administrative overhead
 * 3. Prioritize gaps by cost impact (highest estimated cost first)
 *
 * CALCULATION EXAMPLE:
 * Missing Item: "Ryanfire Rokwrap & Mastic (Steel pipe)" - 5 ea @ $65.50
 * - Base cost: $65.50 × 5 = $327.50
 * - With 20% markup: $327.50 × 1.20 = $393.00
 * - Market adjustment (if other suppliers quoted higher): $393.00 × 1.72 = $675.96
 *
 * This gives stakeholders a realistic estimate of the additional cost to fill scope gaps.
 */
export function estimateScopeGapCosts(
  missingItems: Array<{ description: string; category?: string; quantity?: number; suppliers?: Record<string, any> }>,
  averageUnitRate: number,
  systemsCovered: number,
  totalSystems: number
): Array<{ description: string; estimatedCost: number; severity: 'low' | 'medium' | 'high' }> {
  const coveragePercent = (systemsCovered / totalSystems) * 100;
  const markup = 1.2; // 20% markup for procurement risk and administrative overhead

  // Calculate individual costs for each missing item
  const gaps = missingItems.map((item, index) => {
    let baseRate = averageUnitRate;
    const quantity = item.quantity || 1;

    // Try to use market rate from other suppliers who quoted this item
    if (item.suppliers) {
      const supplierRates: number[] = [];
      Object.values(item.suppliers).forEach((supplierData: any) => {
        if (supplierData?.unitPrice && supplierData.unitPrice > 0) {
          supplierRates.push(supplierData.unitPrice);
        }
      });

      if (supplierRates.length > 0) {
        // Use average of other suppliers' rates for this specific item
        baseRate = supplierRates.reduce((sum, rate) => sum + rate, 0) / supplierRates.length;
      }
    }

    // Calculate total cost: baseRate * quantity * markup
    const estimatedCost = baseRate * quantity * markup;

    // Determine severity based on cost magnitude and coverage
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
      _sortCost: estimatedCost, // For sorting
    };
  });

  // Sort by cost (highest first) and return top 5
  return gaps
    .sort((a, b) => b._sortCost - a._sortCost)
    .slice(0, 5)
    .map(({ description, estimatedCost, severity, ...item }) => ({
      description,
      estimatedCost,
      severity,
      system: item.category || 'Unknown System',
      category: item.category,
      itemsCount: 1,
      estimatedImpact: `Est. ${formatCurrency(estimatedCost)} @ 20% markup`,
      details: [],
    }));
}

/**
 * Calculate estimated full-scope cost for supplier
 * Estimates cost if supplier were to cover all missing items
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
  const estimatedMissingCost = missingItems * avgPricePerSystem * 1.15; // 15% premium

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
  // Normalize both to same scope for fair comparison
  const normalizedRecommended = recommendedPrice / (recommendedCoverage / 100);
  const normalizedHighest = highestPrice / (highestCoverage / 100);

  return Math.max(0, normalizedHighest - normalizedRecommended);
}

/**
 * Generate color for score (0-10)
 */
export function getScoreColor(score: number): string {
  if (score >= 8) return '#10b981'; // green
  if (score >= 6) return '#3b82f6'; // blue
  if (score >= 4) return '#f59e0b'; // orange
  return '#ef4444'; // red
}

/**
 * Generate severity badge color
 */
export function getSeverityColor(severity: 'low' | 'medium' | 'high' | 'critical'): string {
  switch (severity) {
    case 'low': return '#10b981';
    case 'medium': return '#f59e0b';
    case 'high': return '#ef4444';
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
