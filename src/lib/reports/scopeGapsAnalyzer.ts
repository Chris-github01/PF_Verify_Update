import type { ComparisonRow } from '../../types/comparison.types';

export type GapType =
  | 'MISSING_ITEM'
  | 'QUANTITY_MISMATCH'
  | 'UNIT_MISMATCH'
  | 'NO_MATCH';

export interface ScopeGap {
  description: string;
  supplierValues: Record<string, string>; // Maps supplier name to their value
  gapType: GapType;
  notes: string[];
  systemId?: string;
  systemName?: string;
  missingSuppliers?: string[]; // List of suppliers missing this item
}

export interface ScopeGapsSummary {
  gaps: ScopeGap[];
  gapCounts: Record<GapType, number>;
  totalGaps: number;
  supplierNames: string[];
}

export function analyzeScopeGaps(
  comparisonData: ComparisonRow[],
  supplierNames: string[]
): ScopeGapsSummary | null {
  if (supplierNames.length < 2) {
    return null;
  }

  const gaps: ScopeGap[] = [];
  const gapCounts: Record<GapType, number> = {
    MISSING_ITEM: 0,
    QUANTITY_MISMATCH: 0,
    UNIT_MISMATCH: 0,
    NO_MATCH: 0
  };

  // Group comparison data by system
  const systemMap = new Map<string, ComparisonRow[]>();
  comparisonData.forEach(row => {
    const key = row.systemId;
    if (!systemMap.has(key)) {
      systemMap.set(key, []);
    }
    systemMap.get(key)!.push(row);
  });

  // Analyze each system across all suppliers
  systemMap.forEach((systemRows, systemId) => {
    const supplierData = new Map<string, ComparisonRow>();
    systemRows.forEach(row => {
      supplierData.set(row.supplier, row);
    });

    // Check if any supplier is missing this item
    const suppliersWithItem = Array.from(supplierData.keys());
    const missingSuppliers = supplierNames.filter(s => !suppliersWithItem.includes(s));

    if (missingSuppliers.length > 0) {
      // Found a missing item gap
      const supplierValues: Record<string, string> = {};
      supplierNames.forEach(supplier => {
        const data = supplierData.get(supplier);
        if (data && data.unitRate !== null) {
          supplierValues[supplier] = `${data.quantity || 1} @ $${data.unitRate.toFixed(2)}`;
        } else {
          supplierValues[supplier] = 'NOT QUOTED';
        }
      });

      const sampleRow = systemRows[0];
      const gap: ScopeGap = {
        description: sampleRow.systemLabel || sampleRow.systemId,
        supplierValues,
        gapType: 'MISSING_ITEM',
        notes: [`Missing in: ${missingSuppliers.join(', ')}`],
        systemId: sampleRow.systemId,
        systemName: sampleRow.systemLabel,
        missingSuppliers
      };
      gaps.push(gap);
      gapCounts.MISSING_ITEM++;
    }

    // Check for quantity/unit mismatches among suppliers who have the item
    if (suppliersWithItem.length >= 2) {
      const quantities = new Set<number>();
      const units = new Set<string>();

      suppliersWithItem.forEach(supplier => {
        const row = supplierData.get(supplier)!;
        if (row.quantity) quantities.add(row.quantity);
        // Note: unit information might not be directly available in ComparisonRow
      });

      if (quantities.size > 1) {
        // Quantity mismatch detected
        const supplierValues: Record<string, string> = {};
        supplierNames.forEach(supplier => {
          const data = supplierData.get(supplier);
          if (data && data.unitRate !== null) {
            supplierValues[supplier] = `Qty: ${data.quantity || 1} @ $${data.unitRate.toFixed(2)}`;
          } else {
            supplierValues[supplier] = 'N/A';
          }
        });

        const sampleRow = systemRows[0];
        const gap: ScopeGap = {
          description: sampleRow.systemLabel || sampleRow.systemId,
          supplierValues,
          gapType: 'QUANTITY_MISMATCH',
          notes: [`Quantity varies across suppliers: ${Array.from(quantities).join(', ')}`],
          systemId: sampleRow.systemId,
          systemName: sampleRow.systemLabel
        };
        gaps.push(gap);
        gapCounts.QUANTITY_MISMATCH++;
      }
    }
  });

  return {
    gaps,
    gapCounts,
    totalGaps: gaps.length,
    supplierNames
  };
}
