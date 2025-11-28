import type { ComparisonRow } from '../../types/comparison.types';

export type GapType =
  | 'ONLY_IN_A'
  | 'ONLY_IN_B'
  | 'QUANTITY_MISMATCH'
  | 'UNIT_MISMATCH'
  | 'NO_MATCH';

export interface ScopeGap {
  description: string;
  supplierAValue: string;
  supplierBValue: string;
  gapType: GapType;
  notes: string[];
  systemId?: string;
  systemName?: string;
}

export interface ScopeGapsSummary {
  gaps: ScopeGap[];
  gapCounts: Record<GapType, number>;
  totalGaps: number;
  supplierNames: [string, string];
}

export function analyzeScopeGaps(
  comparisonData: ComparisonRow[],
  supplierNames: string[]
): ScopeGapsSummary | null {
  if (supplierNames.length < 2) {
    return null;
  }

  const [supplierA, supplierB] = supplierNames.slice(0, 2);
  const gaps: ScopeGap[] = [];
  const gapCounts: Record<GapType, number> = {
    ONLY_IN_A: 0,
    ONLY_IN_B: 0,
    QUANTITY_MISMATCH: 0,
    UNIT_MISMATCH: 0,
    NO_MATCH: 0
  };

  comparisonData.forEach(row => {
    const dataA = row.suppliers?.[supplierA];
    const dataB = row.suppliers?.[supplierB];

    const hasA = dataA && dataA.unitPrice !== null;
    const hasB = dataB && dataB.unitPrice !== null;

    if (hasA && !hasB) {
      const gap: ScopeGap = {
        description: row.description || 'Unknown Item',
        supplierAValue: `${row.quantity || ''} ${row.unit || ''} @ $${dataA.unitPrice.toFixed(2)}`,
        supplierBValue: 'NOT QUOTED',
        gapType: 'ONLY_IN_A',
        notes: ['Item only found in ' + supplierA],
        systemId: row.systemId,
        systemName: row.systemLabel
      };
      gaps.push(gap);
      gapCounts.ONLY_IN_A++;
    } else if (!hasA && hasB) {
      const gap: ScopeGap = {
        description: row.description || 'Unknown Item',
        supplierAValue: 'NOT QUOTED',
        supplierBValue: `${row.quantity || ''} ${row.unit || ''} @ $${dataB.unitPrice.toFixed(2)}`,
        gapType: 'ONLY_IN_B',
        notes: ['Item only found in ' + supplierB],
        systemId: row.systemId,
        systemName: row.systemLabel
      };
      gaps.push(gap);
      gapCounts.ONLY_IN_B++;
    } else if (hasA && hasB) {
      const notes: string[] = [];
      let hasGap = false;
      let gapType: GapType = 'NO_MATCH';

      if (dataA.quantity !== dataB.quantity) {
        notes.push(`Quantity mismatch: ${dataA.quantity} vs ${dataB.quantity}`);
        hasGap = true;
        gapType = 'QUANTITY_MISMATCH';
      }

      if (dataA.unit !== dataB.unit) {
        notes.push(`Unit mismatch: ${dataA.unit} vs ${dataB.unit}`);
        hasGap = true;
        if (gapType !== 'QUANTITY_MISMATCH') {
          gapType = 'UNIT_MISMATCH';
        }
      }

      if (hasGap) {
        const gap: ScopeGap = {
          description: row.description || 'Unknown Item',
          supplierAValue: `${dataA.quantity} ${dataA.unit} @ $${dataA.unitPrice.toFixed(2)}`,
          supplierBValue: `${dataB.quantity} ${dataB.unit} @ $${dataB.unitPrice.toFixed(2)}`,
          gapType,
          notes,
          systemId: row.systemId,
          systemName: row.systemLabel
        };
        gaps.push(gap);
        gapCounts[gapType]++;
      }
    }
  });

  return {
    gaps,
    gapCounts,
    totalGaps: gaps.length,
    supplierNames: [supplierA, supplierB]
  };
}
