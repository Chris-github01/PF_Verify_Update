import type { ComparisonRow } from '../../types/comparison.types';
import type { EqualisationMode, EqualisationResult } from '../../types/equalisation.types';

export function buildEqualisation(
  comparisonData: ComparisonRow[],
  mode: EqualisationMode
): EqualisationResult {
  const supplierMap = new Map<string, { original: number; equalised: number; itemsAdded: number }>();
  const equalisationLog: EqualisationResult['equalisationLog'] = [];

  const systemMap = new Map<string, ComparisonRow[]>();
  comparisonData.forEach(row => {
    if (!systemMap.has(row.systemId)) {
      systemMap.set(row.systemId, []);
    }
    systemMap.get(row.systemId)!.push(row);
  });

  const allSuppliers = Array.from(new Set(comparisonData.map(row => row.supplier)));

  allSuppliers.forEach(supplier => {
    supplierMap.set(supplier, { original: 0, equalised: 0, itemsAdded: 0 });
  });

  comparisonData.forEach(row => {
    const supplierData = supplierMap.get(row.supplier)!;
    const total = row.total || 0;
    supplierData.original += total;
    supplierData.equalised += total;
  });

  systemMap.forEach((systemRows, systemId) => {
    const suppliersWithSystem = new Set(systemRows.map(row => row.supplier));
    const missingSuppliers = allSuppliers.filter(s => !suppliersWithSystem.has(s));

    if (missingSuppliers.length > 0) {
      let fillRate: number | null = null;
      let source = '';

      if (mode === 'MODEL' && systemRows[0]?.modelRate) {
        fillRate = systemRows[0].modelRate;
        source = 'MODEL';
      } else if (mode === 'PEER_MEDIAN') {
        const rates = systemRows.map(r => r.unitRate).filter((r): r is number => r !== null && r > 0);
        if (rates.length > 0) {
          rates.sort((a, b) => a - b);
          fillRate = rates[Math.floor(rates.length / 2)];
          source = 'PEER_MEDIAN';
        }
      }

      if (fillRate !== null) {
        const sampleRow = systemRows[0];
        missingSuppliers.forEach(supplier => {
          const quantity = 1;
          const total = fillRate * quantity;

          const supplierData = supplierMap.get(supplier)!;
          supplierData.equalised += total;
          supplierData.itemsAdded += 1;

          equalisationLog.push({
            supplierName: supplier,
            systemId: sampleRow.systemId,
            systemLabel: sampleRow.systemLabel,
            reason: 'Missing scope item',
            source,
            rateUsed: fillRate,
            quantity,
            total,
          });
        });
      }
    }
  });

  const supplierTotals = allSuppliers.map(supplier => {
    const data = supplierMap.get(supplier)!;
    const adjustment = data.equalised - data.original;
    const adjustmentPct = data.original > 0 ? (adjustment / data.original) * 100 : 0;

    return {
      supplierName: supplier,
      originalTotal: data.original,
      equalisedTotal: data.equalised,
      adjustment,
      adjustmentPct,
      itemsAdded: data.itemsAdded,
    };
  });

  return {
    supplierTotals,
    equalisationLog,
    mode,
  };
}
