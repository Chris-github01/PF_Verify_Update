import type { ComparisonRow } from '../../types/comparison.types';

export type VarianceLevel = 'GREEN' | 'AMBER' | 'RED' | 'GREY';

export interface VarianceRow {
  description: string;
  systemId?: string;
  systemName?: string;
  modelRate: number | null;
  supplierRates: Record<string, number | null>;
  variances: Record<string, {
    value: number | null;
    percent: number | null;
    level: VarianceLevel;
  }>;
}

export interface VarianceSummary {
  rows: VarianceRow[];
  supplierNames: string[];
  levelCounts: Record<string, Record<VarianceLevel, number>>;
  averageVariance: Record<string, number>;
}

export function getVarianceLevel(variancePercent: number | null): VarianceLevel {
  if (variancePercent === null) return 'GREY';
  const absVariance = Math.abs(variancePercent);
  if (absVariance <= 10) return 'GREEN';
  if (absVariance <= 20) return 'AMBER';
  return 'RED';
}

export function analyzeVariances(
  comparisonData: ComparisonRow[],
  supplierNames: string[]
): VarianceSummary {
  const rows: VarianceRow[] = comparisonData.map(row => {
    const modelRate = row.modelUnitRate || null;
    const supplierRates: Record<string, number | null> = {};
    const variances: Record<string, any> = {};

    supplierNames.forEach(name => {
      const supplierData = row.suppliers?.[name];
      const supplierRate = supplierData?.unitPrice ?? null;
      supplierRates[name] = supplierRate;

      let varianceValue: number | null = null;
      let variancePercent: number | null = null;

      if (modelRate !== null && supplierRate !== null && modelRate > 0) {
        varianceValue = supplierRate - modelRate;
        variancePercent = (varianceValue / modelRate) * 100;
      }

      variances[name] = {
        value: varianceValue,
        percent: variancePercent,
        level: getVarianceLevel(variancePercent)
      };
    });

    return {
      description: row.description || 'Unknown Item',
      systemId: row.systemId,
      systemName: row.systemLabel,
      modelRate,
      supplierRates,
      variances
    };
  });

  const levelCounts: Record<string, Record<VarianceLevel, number>> = {};
  const varianceSums: Record<string, number> = {};
  const varianceCounts: Record<string, number> = {};

  supplierNames.forEach(name => {
    levelCounts[name] = { GREEN: 0, AMBER: 0, RED: 0, GREY: 0 };
    varianceSums[name] = 0;
    varianceCounts[name] = 0;
  });

  rows.forEach(row => {
    supplierNames.forEach(name => {
      const variance = row.variances[name];
      levelCounts[name][variance.level]++;

      if (variance.percent !== null) {
        varianceSums[name] += Math.abs(variance.percent);
        varianceCounts[name]++;
      }
    });
  });

  const averageVariance: Record<string, number> = {};
  supplierNames.forEach(name => {
    averageVariance[name] = varianceCounts[name] > 0
      ? varianceSums[name] / varianceCounts[name]
      : 0;
  });

  return {
    rows,
    supplierNames,
    levelCounts,
    averageVariance
  };
}
