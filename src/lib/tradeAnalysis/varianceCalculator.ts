import type {
  SupplierQuoteItem,
  ComparisonRow,
  VarianceLevel,
  MatchStatus,
  SectionStats,
  TotalsSummary,
} from '../../types/tradeAnalysis.types';
import { fuzzyMatchItems } from './fuzzyMatcher';

export async function buildMultiSupplierComparison(
  supplierItemsArray: SupplierQuoteItem[][],
  supplierNames: (string | undefined)[]
): Promise<ComparisonRow[]> {
  if (supplierItemsArray.length < 2) {
    return [];
  }

  const activeSuppliers = supplierItemsArray.filter(items => items.length > 0);
  if (activeSuppliers.length < 2) {
    return [];
  }

  const baseItems = supplierItemsArray[0];
  const rows: ComparisonRow[] = [];
  const allUsedIds = supplierItemsArray.map(() => new Set<string>());

  for (const baseItem of baseItems) {
    const row: ComparisonRow = {
      id: baseItem.id,
      section: baseItem.section,
      description: baseItem.description,
      size: baseItem.size,
      unit: baseItem.unit,
      qty: baseItem.qty,
      supplier1Item: baseItem,
      supplier1Rate: baseItem.rate,
      supplier1Total: baseItem.total,
      varianceLevel: 'exact',
      matchStatus: 'matched',
    };

    allUsedIds[0].add(baseItem.id);

    for (let i = 1; i < supplierItemsArray.length; i++) {
      if (supplierItemsArray[i].length === 0) continue;

      const matches = await fuzzyMatchItems(
        [baseItem],
        supplierItemsArray[i],
        supplierNames[0],
        supplierNames[i]
      );

      const match = matches.get(baseItem.id);

      if (match) {
        const matchedItem = match.supplier2Item;
        allUsedIds[i].add(matchedItem.id);

        if (i === 1) {
          row.supplier2Item = matchedItem;
          row.supplier2Rate = matchedItem.rate;
          row.supplier2Total = matchedItem.total;
        } else if (i === 2) {
          row.supplier3Item = matchedItem;
          row.supplier3Rate = matchedItem.rate;
          row.supplier3Total = matchedItem.total;
        } else if (i === 3) {
          row.supplier4Item = matchedItem;
          row.supplier4Rate = matchedItem.rate;
          row.supplier4Total = matchedItem.total;
        } else if (i === 4) {
          row.supplier5Item = matchedItem;
          row.supplier5Rate = matchedItem.rate;
          row.supplier5Total = matchedItem.total;
        }
      }
    }

    const rates = [row.supplier1Rate, row.supplier2Rate, row.supplier3Rate, row.supplier4Rate, row.supplier5Rate]
      .filter((r): r is number => r !== undefined);

    if (rates.length > 1) {
      const avgRate = rates.reduce((a, b) => a + b, 0) / rates.length;
      const maxVariance = Math.max(...rates.map(r => Math.abs(((r - avgRate) / avgRate) * 100)));
      row.rateVariance = maxVariance;
      row.varianceLevel = getVarianceLevel(maxVariance);
    }

    rows.push(row);
  }

  for (let i = 1; i < supplierItemsArray.length; i++) {
    for (const item of supplierItemsArray[i]) {
      if (!allUsedIds[i].has(item.id)) {
        const row: ComparisonRow = {
          id: `missing-${i}-${item.id}`,
          section: item.section,
          description: item.description,
          size: item.size,
          unit: item.unit,
          qty: item.qty,
          varianceLevel: 'missing',
          matchStatus: `missing_supplier${i + 1}` as MatchStatus,
        };

        if (i === 1) {
          row.supplier2Item = item;
          row.supplier2Rate = item.rate;
          row.supplier2Total = item.total;
        } else if (i === 2) {
          row.supplier3Item = item;
          row.supplier3Rate = item.rate;
          row.supplier3Total = item.total;
        } else if (i === 3) {
          row.supplier4Item = item;
          row.supplier4Rate = item.rate;
          row.supplier4Total = item.total;
        } else if (i === 4) {
          row.supplier5Item = item;
          row.supplier5Rate = item.rate;
          row.supplier5Total = item.total;
        }

        rows.push(row);
      }
    }
  }

  return rows;
}

export async function buildComparisonRows(
  supplier1Items: SupplierQuoteItem[],
  supplier2Items: SupplierQuoteItem[],
  supplier1Name?: string,
  supplier2Name?: string
): Promise<ComparisonRow[]> {
  const rows: ComparisonRow[] = [];
  const matches = await fuzzyMatchItems(supplier1Items, supplier2Items, supplier1Name, supplier2Name);
  const usedSupplier2Ids = new Set<string>();

  for (const item1 of supplier1Items) {
    const match = matches.get(item1.id);

    if (match) {
      usedSupplier2Ids.add(match.supplier2Item.id);

      const rateVariance = calculateVariancePercent(item1.rate, match.supplier2Item.rate);
      const totalVariance = calculateVariancePercent(item1.total, match.supplier2Item.total);

      rows.push({
        id: `${item1.id}-${match.supplier2Item.id}`,
        section: item1.section,
        description: item1.description,
        size: item1.size,
        unit: item1.unit,
        qty: item1.qty,
        supplier1Item: item1,
        supplier2Item: match.supplier2Item,
        supplier1Rate: item1.rate,
        supplier2Rate: match.supplier2Item.rate,
        supplier1Total: item1.total,
        supplier2Total: match.supplier2Item.total,
        rateVariance,
        totalVariance,
        varianceLevel: getVarianceLevel(rateVariance),
        matchStatus: 'matched',
        matchScore: match.score,
      });
    } else {
      rows.push({
        id: `${item1.id}-missing`,
        section: item1.section,
        description: item1.description,
        size: item1.size,
        unit: item1.unit,
        qty: item1.qty,
        supplier1Item: item1,
        supplier1Rate: item1.rate,
        supplier1Total: item1.total,
        varianceLevel: 'missing',
        matchStatus: 'missing_supplier2',
        notes: 'Not quoted by Supplier 2',
      });
    }
  }

  for (const item2 of supplier2Items) {
    if (!usedSupplier2Ids.has(item2.id)) {
      rows.push({
        id: `missing-${item2.id}`,
        section: item2.section,
        description: item2.description,
        size: item2.size,
        unit: item2.unit,
        qty: item2.qty,
        supplier2Item: item2,
        supplier2Rate: item2.rate,
        supplier2Total: item2.total,
        varianceLevel: 'missing',
        matchStatus: 'missing_supplier1',
        notes: 'Not quoted by Supplier 1',
      });
    }
  }

  return rows.sort((a, b) => {
    const sectionCompare = a.section.localeCompare(b.section);
    if (sectionCompare !== 0) return sectionCompare;
    return a.description.localeCompare(b.description);
  });
}

export function calculateVariancePercent(value1: number, value2: number): number {
  if (value1 === 0) return value2 === 0 ? 0 : 100;
  return ((value2 - value1) / value1) * 100;
}

export function getVarianceLevel(variancePercent?: number): VarianceLevel {
  if (variancePercent === undefined) return 'missing';

  const absVariance = Math.abs(variancePercent);

  if (absVariance <= 5) return 'good';
  if (absVariance <= 10) return 'moderate';
  return 'high';
}

export function getVarianceColor(level: VarianceLevel): string {
  switch (level) {
    case 'exact':
    case 'good':
      return 'bg-green-50 border-green-200 text-green-900';
    case 'moderate':
      return 'bg-amber-50 border-amber-200 text-amber-900';
    case 'high':
      return 'bg-red-50 border-red-200 text-red-900';
    case 'missing':
      return 'bg-gray-50 border-gray-200 text-gray-600';
  }
}

export function calculateSectionStats(rows: ComparisonRow[]): SectionStats[] {
  const sectionMap = new Map<string, ComparisonRow[]>();

  for (const row of rows) {
    if (!sectionMap.has(row.section)) {
      sectionMap.set(row.section, []);
    }
    sectionMap.get(row.section)!.push(row);
  }

  const stats: SectionStats[] = [];

  for (const [section, sectionRows] of sectionMap) {
    const linesCompared = sectionRows.filter(r => r.matchStatus === 'matched').length;
    const linesMissing = sectionRows.filter(r => r.matchStatus !== 'matched').length;

    const matchedRows = sectionRows.filter(r => r.matchStatus === 'matched');
    const averageRateVariance =
      matchedRows.length > 0
        ? matchedRows.reduce((sum, r) => sum + Math.abs(r.rateVariance || 0), 0) / matchedRows.length
        : 0;

    const supplier1Total = sectionRows.reduce((sum, r) => sum + (r.supplier1Total || 0), 0);
    const supplier2Total = sectionRows.reduce((sum, r) => sum + (r.supplier2Total || 0), 0);
    const supplier3Total = sectionRows.reduce((sum, r) => sum + (r.supplier3Total || 0), 0);
    const supplier4Total = sectionRows.reduce((sum, r) => sum + (r.supplier4Total || 0), 0);
    const supplier5Total = sectionRows.reduce((sum, r) => sum + (r.supplier5Total || 0), 0);
    const sectionTotalVariance = supplier2Total - supplier1Total;

    stats.push({
      section,
      linesCompared,
      linesMissing,
      averageRateVariance,
      sectionTotalVariance,
      supplier1Total,
      supplier2Total,
      supplier3Total: supplier3Total > 0 ? supplier3Total : undefined,
      supplier4Total: supplier4Total > 0 ? supplier4Total : undefined,
      supplier5Total: supplier5Total > 0 ? supplier5Total : undefined,
    });
  }

  return stats.sort((a, b) => a.section.localeCompare(b.section));
}

export function calculateTotalsSummary(rows: ComparisonRow[]): TotalsSummary {
  const matchedRows = rows.filter(r => r.matchStatus === 'matched');

  const supplier1MatchedTotal = matchedRows.reduce((sum, r) => sum + (r.supplier1Total || 0), 0);
  const supplier2MatchedTotal = matchedRows.reduce((sum, r) => sum + (r.supplier2Total || 0), 0);

  const supplier1GrandTotal = rows.reduce((sum, r) => sum + (r.supplier1Total || 0), 0);
  const supplier2GrandTotal = rows.reduce((sum, r) => sum + (r.supplier2Total || 0), 0);
  const supplier3GrandTotal = rows.reduce((sum, r) => sum + (r.supplier3Total || 0), 0);
  const supplier4GrandTotal = rows.reduce((sum, r) => sum + (r.supplier4Total || 0), 0);
  const supplier5GrandTotal = rows.reduce((sum, r) => sum + (r.supplier5Total || 0), 0);

  const totalValueDifference = supplier2GrandTotal - supplier1GrandTotal;
  const overallVariancePercent = calculateVariancePercent(supplier1GrandTotal, supplier2GrandTotal);

  const missingItemsCount = rows.filter(r => r.matchStatus !== 'matched').length;
  const totalItemsCompared = matchedRows.length;

  const weightedAverageDifference =
    matchedRows.length > 0 && supplier1MatchedTotal > 0
      ? matchedRows.reduce((sum, r) => {
          const weight = r.supplier1Total || 0;
          const variance = r.rateVariance || 0;
          return sum + weight * variance;
        }, 0) / supplier1MatchedTotal
      : 0;

  return {
    overallVariancePercent,
    totalValueDifference,
    missingItemsCount,
    weightedAverageDifference,
    supplier1GrandTotal,
    supplier2GrandTotal,
    supplier3GrandTotal: supplier3GrandTotal > 0 ? supplier3GrandTotal : undefined,
    supplier4GrandTotal: supplier4GrandTotal > 0 ? supplier4GrandTotal : undefined,
    supplier5GrandTotal: supplier5GrandTotal > 0 ? supplier5GrandTotal : undefined,
    totalItemsCompared,
  };
}
