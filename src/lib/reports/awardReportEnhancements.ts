/**
 * Enhanced Award Report Calculations and Utilities
 * Provides advanced metrics, visuals data, and scoring for QS/Commercial Director reports
 */

export interface EnhancedSupplierMetrics {
  supplierName: string;
  totalPrice: number;
  systemsCovered: number;
  totalSystems: number;
  coveragePercent: number;
  quoteId?: string;
  itemsQuoted?: number;

  // NEW: Normalized metrics
  normalizedPricePerSystem: number;
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
 * Calculate normalized price per system covered
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
  if (highestPrice === lowestPrice) return 10;
  const normalized = (price - lowestPrice) / (highestPrice - lowestPrice);
  return 10 - (normalized * 10);
}

/**
 * Calculate compliance score (0-10)
 * Based on risk factors and quality indicators
 */
export function calculateComplianceScore(rawRiskScore: number, maxRisk: number): number {
  if (maxRisk === 0) return 10;
  const normalized = Math.min(rawRiskScore / maxRisk, 1);
  return 10 - (normalized * 5); // Cap at 50% reduction
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
  if (maxRisk === 0) return 10;
  const normalized = Math.min(rawRiskScore / maxRisk, 1);
  return 10 - (normalized * 10);
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
 * FIXED: Uses individual item quantities and market rates instead of supplier average
 */
export function estimateScopeGapCosts(
  missingItems: Array<{ description: string; category?: string; quantity?: number; suppliers?: Record<string, any> }>,
  averageUnitRate: number,
  systemsCovered: number,
  totalSystems: number
): Array<{ description: string; estimatedCost: number; severity: 'low' | 'medium' | 'high' }> {
  const coveragePercent = (systemsCovered / totalSystems) * 100;
  const markup = 1.2; // 20% markup for missing items

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
      _sortCost: estimatedCost, // For sorting
    };
  });

  // Sort by cost (highest first) and return top 5
  return gaps
    .sort((a, b) => b._sortCost - a._sortCost)
    .slice(0, 5)
    .map(({ description, estimatedCost, severity }) => ({
      description,
      estimatedCost,
      severity,
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
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format percentage
 */
export function formatPercent(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}
