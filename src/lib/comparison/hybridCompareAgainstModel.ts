import type { ComparisonRow } from '../../types/comparison.types';

export interface ComparisonResult {
  system_id: string;
  supplier_rates: Record<string, number>;
  model_rate: number | null;
  variances: Record<string, number>;
}

interface NormalisedLine {
  quoteId: string;
  quoteItemId: string;
  supplier: string;
  originalDescription: string;
  quantity: number;
  rate: number;
  total: number;
  section?: string;
  service?: string;
  serviceType?: string;
  subclass?: string;
  frr?: string;
  size?: string;
  systemType?: string;
  penetrationType?: string;
}

interface Mapping {
  quoteItemId: string;
  systemId: string | null;
  systemLabel: string | null;
}

type ModelRateLookup = (criteria: any) => { rate: number | null; componentCount: number | null };

export async function compareAgainstModelHybrid(
  normalisedLines: NormalisedLine[],
  mappings: Mapping[],
  modelRateLookup: ModelRateLookup
): Promise<ComparisonRow[]> {
  console.log('compareAgainstModelHybrid: Processing', normalisedLines.length, 'lines');
  console.log('compareAgainstModelHybrid: Mappings:', mappings.length);
  console.log('compareAgainstModelHybrid: Sample mapping:', mappings[0]);

  const comparisonRows: ComparisonRow[] = [];
  let skippedCount = 0;
  let mappedCount = 0;

  for (const line of normalisedLines) {
    const mapping = mappings.find(m => m.quoteItemId === line.quoteItemId);

    if (!mapping) {
      console.warn('compareAgainstModelHybrid: No mapping found for quote item:', line.quoteItemId);
      skippedCount++;
      comparisonRows.push({
        quoteId: line.quoteId,
        quoteItemId: line.quoteItemId,
        supplier: line.supplier,
        systemId: 'UNMAPPED',
        systemLabel: 'Unmapped Items',
        section: line.section,
        service: line.service || line.serviceType,
        subclass: line.subclass,
        frr: line.frr,
        sizeBucket: line.size,
        quantity: line.quantity,
        unitRate: line.rate,
        total: line.total,
        modelRate: null,
        componentCount: null,
        variancePct: null,
        flag: 'NA',
      });
      continue;
    }

    if (!mapping.systemId) {
      if (skippedCount < 3) {
        console.warn('compareAgainstModelHybrid: Mapping has no systemId:', {
          quoteItemId: mapping.quoteItemId,
          systemId: mapping.systemId,
          systemLabel: mapping.systemLabel
        });
      }
      skippedCount++;
      comparisonRows.push({
        quoteId: line.quoteId,
        quoteItemId: line.quoteItemId,
        supplier: line.supplier,
        systemId: 'UNMAPPED',
        systemLabel: 'Unmapped Items',
        section: line.section,
        service: line.service || line.serviceType,
        subclass: line.subclass,
        frr: line.frr,
        sizeBucket: line.size,
        quantity: line.quantity,
        unitRate: line.rate,
        total: line.total,
        modelRate: null,
        componentCount: null,
        variancePct: null,
        flag: 'NA',
      });
      continue;
    }

    mappedCount++;

    const criteria = {
      systemId: mapping.systemId,
      section: line.section,
      service: line.service || line.serviceType,
      subclass: line.subclass,
      frr: line.frr,
      size: line.size,
    };

    const modelRateResult = modelRateLookup(criteria);
    const modelRate = modelRateResult?.rate || null;
    const componentCount = modelRateResult?.componentCount || null;

    let variancePct: number | null = null;
    let flag: 'GREEN' | 'AMBER' | 'RED' | 'NA' = 'NA';

    if (modelRate !== null && line.rate > 0) {
      variancePct = ((line.rate - modelRate) / modelRate) * 100;

      if (Math.abs(variancePct) <= 10) {
        flag = 'GREEN';
      } else if (Math.abs(variancePct) <= 25) {
        flag = 'AMBER';
      } else {
        flag = 'RED';
      }
    }

    comparisonRows.push({
      quoteId: line.quoteId,
      quoteItemId: line.quoteItemId,
      supplier: line.supplier,
      systemId: mapping.systemId,
      systemLabel: mapping.systemLabel || '',
      section: line.section,
      service: line.service || line.serviceType,
      subclass: line.subclass,
      frr: line.frr,
      sizeBucket: line.size,
      quantity: line.quantity,
      unitRate: line.rate,
      total: line.total,
      modelRate,
      componentCount,
      variancePct,
      flag,
    });
  }

  console.log('compareAgainstModelHybrid: Generated', comparisonRows.length, 'comparison rows');
  console.log('compareAgainstModelHybrid: Mapped items:', mappedCount);
  console.log('compareAgainstModelHybrid: Unmapped items:', skippedCount);
  if (comparisonRows.length > 0) {
    console.log('compareAgainstModelHybrid: Sample comparison row:', comparisonRows[0]);
  }
  return comparisonRows;
}
