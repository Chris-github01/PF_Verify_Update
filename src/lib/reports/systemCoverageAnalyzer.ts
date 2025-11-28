import type { ComparisonRow } from '../../types/comparison.types';

export interface SystemCoverageRow {
  systemId: string;
  systemName: string;
  required: boolean;
  supplierCoverage: Record<string, {
    hasItems: boolean;
    itemCount: number;
    quotedCount: number;
    coveragePercent: number;
  }>;
  variance: string;
  notes: string[];
}

export interface SystemCoverageSummary {
  rows: SystemCoverageRow[];
  totalSystems: number;
  supplierNames: string[];
  averageCoverage: Record<string, number>;
}

export function analyzeSystemCoverage(
  comparisonData: ComparisonRow[],
  supplierNames: string[]
): SystemCoverageSummary {
  const systemsMap = new Map<string, SystemCoverageRow>();

  comparisonData.forEach(row => {
    const systemId = row.systemId || 'UNMAPPED';
    const systemName = row.systemLabel || row.systemId || 'Unmapped Items';

    if (!systemsMap.has(systemId)) {
      const supplierCoverage: Record<string, any> = {};
      supplierNames.forEach(name => {
        supplierCoverage[name] = {
          hasItems: false,
          itemCount: 0,
          quotedCount: 0,
          coveragePercent: 0
        };
      });

      systemsMap.set(systemId, {
        systemId,
        systemName,
        required: true,
        supplierCoverage,
        variance: '',
        notes: []
      });
    }

    const system = systemsMap.get(systemId)!;

    supplierNames.forEach(name => {
      const supplierData = row.suppliers?.[name];
      if (supplierData) {
        system.supplierCoverage[name].hasItems = true;
        system.supplierCoverage[name].itemCount++;
        if (supplierData.unitPrice !== null && supplierData.unitPrice > 0) {
          system.supplierCoverage[name].quotedCount++;
        }
      }
    });
  });

  systemsMap.forEach(system => {
    supplierNames.forEach(name => {
      const coverage = system.supplierCoverage[name];
      if (coverage.itemCount > 0) {
        coverage.coveragePercent = (coverage.quotedCount / coverage.itemCount) * 100;
      }
    });

    const coverages = supplierNames.map(name =>
      system.supplierCoverage[name].coveragePercent
    );
    const maxCov = Math.max(...coverages);
    const minCov = Math.min(...coverages);
    const variance = maxCov - minCov;

    if (variance > 20) {
      system.variance = `${variance.toFixed(0)}% variance`;
      system.notes.push('Significant coverage difference between suppliers');
    } else if (variance > 0) {
      system.variance = `${variance.toFixed(0)}%`;
    } else {
      system.variance = 'No variance';
    }

    const allComplete = coverages.every(c => c === 100);
    const someComplete = coverages.some(c => c === 100);
    if (allComplete) {
      system.notes.push('Full coverage from all suppliers');
    } else if (someComplete) {
      system.notes.push('Partial coverage - some suppliers complete');
    }
  });

  const rows = Array.from(systemsMap.values()).sort((a, b) =>
    a.systemName.localeCompare(b.systemName)
  );

  const averageCoverage: Record<string, number> = {};
  supplierNames.forEach(name => {
    const total = rows.reduce((sum, row) =>
      sum + row.supplierCoverage[name].coveragePercent, 0
    );
    averageCoverage[name] = rows.length > 0 ? total / rows.length : 0;
  });

  return {
    rows,
    totalSystems: rows.length,
    supplierNames,
    averageCoverage
  };
}
