/**
 * FIXED: Enhanced Award Report Calculations - Accurate Scope Gap Costing
 *
 * This file contains the corrected estimateScopeGapCosts function that uses
 * actual item-specific data from the comparison matrix instead of averaging.
 */

import type { ComparisonRow } from '../../types/comparison.types';

/**
 * FIXED: Estimate scope gap costs using actual item data
 *
 * This function now:
 * 1. Uses modelRate from comparison data as primary source
 * 2. Falls back to average market rate from other suppliers
 * 3. Calculates individual costs per item based on quantity
 * 4. Returns accurate estimated add-on costs
 */
export function estimateScopeGapCostsAccurate(
  missingItemRows: ComparisonRow[],
  supplierName: string,
  comparisonData: ComparisonRow[]
): Array<{ description: string; estimatedCost: number; severity: 'low' | 'medium' | 'high' }> {
  const markup = 1.2; // 20% markup for missing items

  // Calculate costs for each missing item
  const scopeGaps = missingItemRows.map((row, index) => {
    let baseRate = 0;

    // Option 1: Use model rate if available (preferred)
    if (row.modelRate && row.modelRate > 0) {
      baseRate = row.modelRate;
    } else {
      // Option 2: Calculate average rate from other suppliers who quoted this item
      const supplierRates: number[] = [];

      if (row.suppliers) {
        Object.entries(row.suppliers).forEach(([supplier, data]: [string, any]) => {
          if (supplier !== supplierName && data?.unitRate && data.unitRate > 0) {
            supplierRates.push(data.unitRate);
          }
        });
      }

      if (supplierRates.length > 0) {
        // Use average of other suppliers' rates
        baseRate = supplierRates.reduce((sum, rate) => sum + rate, 0) / supplierRates.length;
      } else {
        // Option 3: Use overall project average as fallback
        const allRates: number[] = [];
        comparisonData.forEach(dataRow => {
          if (dataRow.suppliers) {
            Object.values(dataRow.suppliers).forEach((data: any) => {
              if (data?.unitRate && data.unitRate > 0) {
                allRates.push(data.unitRate);
              }
            });
          }
        });

        if (allRates.length > 0) {
          baseRate = allRates.reduce((sum, rate) => sum + rate, 0) / allRates.length;
        }
      }
    }

    // Calculate total cost for this item: baseRate * quantity * markup
    const quantity = row.quantity || 1;
    const estimatedCost = baseRate * quantity * markup;

    // Determine severity based on cost magnitude and item importance
    let severity: 'low' | 'medium' | 'high' = 'medium';

    // High severity for expensive items or critical systems
    if (estimatedCost > 10000 || index < 2) {
      severity = 'high';
    } else if (estimatedCost < 2000) {
      severity = 'low';
    }

    return {
      description: row.description || row.systemLabel || 'Unknown Item',
      estimatedCost: Math.round(estimatedCost),
      severity,
      // Additional context for display
      category: row.category,
      system: row.systemLabel,
      quantity: row.quantity,
      baseRate: Math.round(baseRate),
    };
  });

  // Sort by estimated cost (highest first) and return top 5
  return scopeGaps
    .sort((a, b) => b.estimatedCost - a.estimatedCost)
    .slice(0, 5)
    .map(({ description, estimatedCost, severity }) => ({
      description,
      estimatedCost,
      severity,
    }));
}

/**
 * Enhanced version that includes more context for each gap
 */
export interface DetailedScopeGap {
  description: string;
  system: string;
  category?: string;
  quantity: number;
  unitRate: number;
  estimatedCost: number;
  severity: 'low' | 'medium' | 'high';
  rateSource: 'model' | 'market_average' | 'project_average';
}

export function estimateScopeGapCostsDetailed(
  missingItemRows: ComparisonRow[],
  supplierName: string,
  comparisonData: ComparisonRow[]
): DetailedScopeGap[] {
  const markup = 1.2; // 20% markup for missing items

  const scopeGaps = missingItemRows.map((row, index) => {
    let baseRate = 0;
    let rateSource: 'model' | 'market_average' | 'project_average' = 'project_average';

    // Option 1: Use model rate if available (preferred)
    if (row.modelRate && row.modelRate > 0) {
      baseRate = row.modelRate;
      rateSource = 'model';
    } else {
      // Option 2: Calculate average rate from other suppliers
      const supplierRates: number[] = [];

      if (row.suppliers) {
        Object.entries(row.suppliers).forEach(([supplier, data]: [string, any]) => {
          if (supplier !== supplierName && data?.unitRate && data.unitRate > 0) {
            supplierRates.push(data.unitRate);
          }
        });
      }

      if (supplierRates.length > 0) {
        baseRate = supplierRates.reduce((sum, rate) => sum + rate, 0) / supplierRates.length;
        rateSource = 'market_average';
      } else {
        // Option 3: Use overall project average
        const allRates: number[] = [];
        comparisonData.forEach(dataRow => {
          if (dataRow.suppliers) {
            Object.values(dataRow.suppliers).forEach((data: any) => {
              if (data?.unitRate && data.unitRate > 0) {
                allRates.push(data.unitRate);
              }
            });
          }
        });

        if (allRates.length > 0) {
          baseRate = allRates.reduce((sum, rate) => sum + rate, 0) / allRates.length;
        }
      }
    }

    const quantity = row.quantity || 1;
    const unitRateWithMarkup = baseRate * markup;
    const estimatedCost = baseRate * quantity * markup;

    let severity: 'low' | 'medium' | 'high' = 'medium';
    if (estimatedCost > 10000 || index < 2) {
      severity = 'high';
    } else if (estimatedCost < 2000) {
      severity = 'low';
    }

    return {
      description: row.description || row.systemLabel || 'Unknown Item',
      system: row.systemLabel || row.systemId || 'Unknown System',
      category: row.category,
      quantity,
      unitRate: Math.round(unitRateWithMarkup),
      estimatedCost: Math.round(estimatedCost),
      severity,
      rateSource,
    };
  });

  // Sort by estimated cost (highest first) and return top 5
  return scopeGaps.sort((a, b) => b.estimatedCost - a.estimatedCost).slice(0, 5);
}
