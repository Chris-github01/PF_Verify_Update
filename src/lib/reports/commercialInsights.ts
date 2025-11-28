import type { ComparisonRow } from '../../types/comparison.types';

export interface PricingInsight {
  description: string;
  supplierName: string;
  supplierPrice: number;
  modelPrice: number | null;
  variance: number;
  variancePercent: number;
  systemId?: string;
  systemName?: string;
}

export interface CommercialInsights {
  supplierTotals: Record<string, number>;
  lowestTotal: {
    supplierName: string;
    amount: number;
  } | null;
  percentageDifferences: Record<string, number>;
  topOverpriced: PricingInsight[];
  topUnderpriced: PricingInsight[];
  potentialSavings: number;
  averagePriceBySupplier: Record<string, number>;
}

export function calculateCommercialInsights(
  comparisonData: ComparisonRow[],
  supplierNames: string[]
): CommercialInsights {
  const supplierTotals: Record<string, number> = {};
  const supplierItemCounts: Record<string, number> = {};
  const overpriced: PricingInsight[] = [];
  const underpriced: PricingInsight[] = [];

  supplierNames.forEach(name => {
    supplierTotals[name] = 0;
    supplierItemCounts[name] = 0;
  });

  comparisonData.forEach(row => {
    supplierNames.forEach(name => {
      const supplierData = row.suppliers?.[name];
      if (supplierData && supplierData.total) {
        supplierTotals[name] += supplierData.total;
        supplierItemCounts[name]++;

        if (row.modelUnitRate && supplierData.unitPrice) {
          const modelTotal = row.modelUnitRate * (row.quantity || 1);
          const variance = supplierData.total - modelTotal;
          const variancePercent = (variance / modelTotal) * 100;

          const insight: PricingInsight = {
            description: row.description || 'Unknown Item',
            supplierName: name,
            supplierPrice: supplierData.total,
            modelPrice: modelTotal,
            variance,
            variancePercent,
            systemId: row.systemId,
            systemName: row.systemLabel
          };

          if (variance > 0) {
            overpriced.push(insight);
          } else if (variance < 0) {
            underpriced.push(insight);
          }
        }
      }
    });
  });

  overpriced.sort((a, b) => b.variance - a.variance);
  underpriced.sort((a, b) => a.variance - b.variance);

  const topOverpriced = overpriced.slice(0, 5);
  const topUnderpriced = underpriced.slice(0, 5);

  let lowestTotal: { supplierName: string; amount: number } | null = null;
  let lowestAmount = Infinity;

  Object.entries(supplierTotals).forEach(([name, total]) => {
    if (total > 0 && total < lowestAmount) {
      lowestAmount = total;
      lowestTotal = { supplierName: name, amount: total };
    }
  });

  const percentageDifferences: Record<string, number> = {};
  if (lowestTotal) {
    supplierNames.forEach(name => {
      if (supplierTotals[name] > 0) {
        const diff = ((supplierTotals[name] - lowestTotal!.amount) / lowestTotal!.amount) * 100;
        percentageDifferences[name] = Math.round(diff * 10) / 10;
      }
    });
  }

  const highestTotal = Math.max(...Object.values(supplierTotals));
  const potentialSavings = lowestTotal ? highestTotal - lowestTotal.amount : 0;

  const averagePriceBySupplier: Record<string, number> = {};
  supplierNames.forEach(name => {
    if (supplierItemCounts[name] > 0) {
      averagePriceBySupplier[name] = supplierTotals[name] / supplierItemCounts[name];
    } else {
      averagePriceBySupplier[name] = 0;
    }
  });

  return {
    supplierTotals,
    lowestTotal,
    percentageDifferences,
    topOverpriced,
    topUnderpriced,
    potentialSavings,
    averagePriceBySupplier
  };
}
