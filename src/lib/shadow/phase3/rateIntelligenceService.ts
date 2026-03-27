import { supabase } from '../../supabase';
import type { ResolvedDataset } from '../phase1/sourceAdapters';

export interface ShadowRateIntelligence {
  id: string;
  run_id: string;
  item_description: string;
  normalized_item: string;
  unit: string | null;
  rate: number | null;
  benchmark_rate: number | null;
  variance_percent: number | null;
  variance_type: string;
  anomaly_flag: boolean;
  created_at: string;
}

export interface ShadowRateBenchmark {
  id: string;
  normalized_item: string;
  unit: string;
  median_rate: number;
  p25_rate: number;
  p75_rate: number;
  sample_size: number;
  last_updated: string;
}

export interface RateIntelligenceResult {
  records: ShadowRateIntelligence[];
  anomalyCount: number;
  underPricedCount: number;
  overPricedCount: number;
}

function normalizeItem(desc: string): string {
  return desc
    .trim()
    .toLowerCase()
    .replace(/\d+mm/g, 'NNmm')
    .replace(/\d+dn/g, 'DNnn')
    .replace(/\d+\s*l\/s/gi, 'NNL/s')
    .replace(/no\.\s*\d+/gi, 'no.N')
    .replace(/\s+/g, ' ')
    .slice(0, 120);
}

function classifyVariance(
  rate: number,
  benchmarkRate: number | null,
): { variancePercent: number | null; varianceType: string; anomalyFlag: boolean } {
  if (benchmarkRate == null || benchmarkRate === 0 || rate == null || rate === 0) {
    return { variancePercent: null, varianceType: 'no_benchmark', anomalyFlag: false };
  }

  const variancePercent = ((rate - benchmarkRate) / benchmarkRate) * 100;

  if (variancePercent < -40) {
    return { variancePercent, varianceType: 'significantly_under', anomalyFlag: true };
  }
  if (variancePercent < -15) {
    return { variancePercent, varianceType: 'under_priced', anomalyFlag: false };
  }
  if (variancePercent > 50) {
    return { variancePercent, varianceType: 'significantly_over', anomalyFlag: true };
  }
  if (variancePercent > 20) {
    return { variancePercent, varianceType: 'over_priced', anomalyFlag: false };
  }
  return { variancePercent, varianceType: 'within_range', anomalyFlag: false };
}

async function fetchBenchmarksForItems(
  normalizedItems: string[],
): Promise<Map<string, ShadowRateBenchmark>> {
  if (normalizedItems.length === 0) return new Map();

  const { data, error } = await supabase
    .from('shadow_rate_benchmarks')
    .select('*')
    .in('normalized_item', normalizedItems.slice(0, 100));

  if (error || !data) return new Map();

  const map = new Map<string, ShadowRateBenchmark>();
  for (const b of data) {
    map.set(b.normalized_item, b as ShadowRateBenchmark);
  }
  return map;
}

async function upsertBenchmarks(
  items: { normalizedItem: string; unit: string; rate: number }[],
): Promise<void> {
  if (items.length === 0) return;

  for (const item of items) {
    const { data: existing } = await supabase
      .from('shadow_rate_benchmarks')
      .select('id, median_rate, p25_rate, p75_rate, sample_size')
      .eq('normalized_item', item.normalizedItem)
      .eq('unit', item.unit)
      .maybeSingle();

    if (existing) {
      const n = existing.sample_size + 1;
      const newMedian = (existing.median_rate * existing.sample_size + item.rate) / n;
      const newP25 = Math.min(existing.p25_rate, item.rate);
      const newP75 = Math.max(existing.p75_rate, item.rate);
      await supabase
        .from('shadow_rate_benchmarks')
        .update({
          median_rate: newMedian,
          p25_rate: newP25,
          p75_rate: newP75,
          sample_size: n,
          last_updated: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      await supabase.from('shadow_rate_benchmarks').insert({
        normalized_item: item.normalizedItem,
        unit: item.unit,
        median_rate: item.rate,
        p25_rate: item.rate,
        p75_rate: item.rate,
        sample_size: 1,
        last_updated: new Date().toISOString(),
      });
    }
  }
}

export async function runRateIntelligence(
  runId: string,
  dataset: ResolvedDataset,
): Promise<RateIntelligenceResult> {
  const itemsWithRates = dataset.lineItems.filter(
    (i) =>
      i.description &&
      i.description.trim().length > 3 &&
      typeof i.rate === 'number' &&
      i.rate > 0,
  );

  const benchmarkItems = itemsWithRates.map((i) => ({
    normalizedItem: normalizeItem(i.description),
    unit: (i.unit ?? 'ea').toLowerCase(),
    rate: i.rate as number,
  }));

  await upsertBenchmarks(benchmarkItems);

  const normalizedKeys = benchmarkItems.map((b) => b.normalizedItem);
  const benchmarkMap = await fetchBenchmarksForItems(normalizedKeys);

  const rateRecords: Omit<ShadowRateIntelligence, 'id' | 'created_at'>[] = itemsWithRates.map(
    (item, idx) => {
      const normalizedItem = benchmarkItems[idx].normalizedItem;
      const benchmark = benchmarkMap.get(normalizedItem) ?? null;
      const { variancePercent, varianceType, anomalyFlag } = classifyVariance(
        item.rate as number,
        benchmark ? benchmark.median_rate : null,
      );
      return {
        run_id: runId,
        item_description: item.description.slice(0, 500),
        normalized_item: normalizedItem,
        unit: item.unit ?? null,
        rate: item.rate as number,
        benchmark_rate: benchmark ? benchmark.median_rate : null,
        variance_percent: variancePercent,
        variance_type: varianceType,
        anomaly_flag: anomalyFlag,
      };
    },
  );

  if (rateRecords.length > 0) {
    await supabase.from('shadow_rate_intelligence').insert(rateRecords);
  }

  const anomalyCount = rateRecords.filter((r) => r.anomaly_flag).length;
  const underPricedCount = rateRecords.filter(
    (r) => r.variance_type === 'under_priced' || r.variance_type === 'significantly_under',
  ).length;
  const overPricedCount = rateRecords.filter(
    (r) => r.variance_type === 'over_priced' || r.variance_type === 'significantly_over',
  ).length;

  return {
    records: rateRecords as ShadowRateIntelligence[],
    anomalyCount,
    underPricedCount,
    overPricedCount,
  };
}

export async function getRateIntelligenceForRun(runId: string): Promise<RateIntelligenceResult> {
  const { data, error } = await supabase
    .from('shadow_rate_intelligence')
    .select('*')
    .eq('run_id', runId)
    .order('anomaly_flag', { ascending: false })
    .order('variance_percent', { ascending: true });

  if (error) return { records: [], anomalyCount: 0, underPricedCount: 0, overPricedCount: 0 };

  const records = (data ?? []) as ShadowRateIntelligence[];
  const anomalyCount = records.filter((r) => r.anomaly_flag).length;
  const underPricedCount = records.filter(
    (r) => r.variance_type === 'under_priced' || r.variance_type === 'significantly_under',
  ).length;
  const overPricedCount = records.filter(
    (r) => r.variance_type === 'over_priced' || r.variance_type === 'significantly_over',
  ).length;

  return { records, anomalyCount, underPricedCount, overPricedCount };
}

export async function getTopBenchmarks(limit = 50): Promise<ShadowRateBenchmark[]> {
  const { data, error } = await supabase
    .from('shadow_rate_benchmarks')
    .select('*')
    .order('sample_size', { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data ?? []) as ShadowRateBenchmark[];
}
