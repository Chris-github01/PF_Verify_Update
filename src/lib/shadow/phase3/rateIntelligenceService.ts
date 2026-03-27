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
    .replace(/\d+\s*mm/g, 'NNmm')
    .replace(/\d+\s*dn/gi, 'DNnn')
    .replace(/\d+\s*nb/gi, 'NNnb')
    .replace(/\d+\s*l\/s/gi, 'NNL/s')
    .replace(/no\.\s*\d+/gi, 'no.N')
    .replace(/\d+\s*kw/gi, 'NNkw')
    .replace(/\d+\s*kva/gi, 'NNkva')
    .replace(/\s+/g, ' ')
    .slice(0, 120);
}

function normalizeUnit(unit: string | undefined | null): string {
  if (!unit) return 'ea';
  const u = unit.trim().toLowerCase();
  if (u === 'each' || u === 'no' || u === 'no.' || u === 'nr' || u === 'item') return 'ea';
  if (u === 'lm' || u === 'lin m' || u === 'lineal m' || u === 'linear m') return 'lm';
  if (u === 'm2' || u === 'sqm' || u === 'm²') return 'm2';
  if (u === 'm3' || u === 'cum' || u === 'm³') return 'm3';
  if (u === 'ls' || u === 'l/s' || u === 'lump sum' || u === 'lumpsum') return 'ls';
  return u.slice(0, 10);
}

// Minimum sample size before anomaly detection is considered reliable.
// Below this threshold, we classify variance but suppress the anomaly flag
// to avoid false positives from sparse benchmark data.
const MIN_SAMPLE_FOR_ANOMALY = 3;

function classifyVariance(
  rate: number,
  benchmarkRate: number | null,
  sampleSize: number,
): { variancePercent: number | null; varianceType: string; anomalyFlag: boolean } {
  if (benchmarkRate == null || benchmarkRate <= 0 || rate <= 0) {
    return { variancePercent: null, varianceType: 'no_benchmark', anomalyFlag: false };
  }

  const variancePercent = ((rate - benchmarkRate) / benchmarkRate) * 100;

  // Anomaly flag suppressed until sample is statistically meaningful
  const anomalyEnabled = sampleSize >= MIN_SAMPLE_FOR_ANOMALY;

  if (variancePercent < -40) {
    return { variancePercent, varianceType: 'significantly_under', anomalyFlag: anomalyEnabled };
  }
  if (variancePercent < -15) {
    return { variancePercent, varianceType: 'under_priced', anomalyFlag: false };
  }
  if (variancePercent > 50) {
    return { variancePercent, varianceType: 'significantly_over', anomalyFlag: anomalyEnabled };
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

  const unique = [...new Set(normalizedItems)].slice(0, 100);
  const { data, error } = await supabase
    .from('shadow_rate_benchmarks')
    .select('*')
    .in('normalized_item', unique);

  if (error || !data) {
    console.warn('[Phase3/Rates] fetchBenchmarksForItems failed:', error?.message);
    return new Map();
  }

  const map = new Map<string, ShadowRateBenchmark>();
  for (const b of data) {
    // Invariant: median_rate must be > 0 when sample_size > 0.
    // If somehow a bad row exists, skip it to avoid polluting variance.
    if ((b.sample_size as number) > 0 && (b.median_rate as number) > 0) {
      map.set(b.normalized_item as string, b as ShadowRateBenchmark);
    }
  }
  return map;
}

async function upsertBenchmarks(
  items: { normalizedItem: string; unit: string; rate: number }[],
): Promise<void> {
  if (items.length === 0) return;

  // Deduplicate: if the same normalizedItem+unit appears multiple times in this batch,
  // aggregate before writing so we don't create duplicate benchmark rows per run.
  const aggregated = new Map<string, { sum: number; count: number; min: number; max: number }>();
  for (const item of items) {
    const key = `${item.normalizedItem}||${item.unit}`;
    const existing = aggregated.get(key);
    if (existing) {
      existing.sum += item.rate;
      existing.count += 1;
      existing.min = Math.min(existing.min, item.rate);
      existing.max = Math.max(existing.max, item.rate);
    } else {
      aggregated.set(key, { sum: item.rate, count: 1, min: item.rate, max: item.rate });
    }
  }

  for (const [key, agg] of aggregated.entries()) {
    const [normalizedItem, unit] = key.split('||');
    const batchMean = agg.sum / agg.count;

    const { data: existing } = await supabase
      .from('shadow_rate_benchmarks')
      .select('id, median_rate, p25_rate, p75_rate, sample_size')
      .eq('normalized_item', normalizedItem)
      .eq('unit', unit)
      .maybeSingle();

    if (existing) {
      const prevN = existing.sample_size as number;
      const prevMean = existing.median_rate as number;
      const prevP25 = existing.p25_rate as number;
      const prevP75 = existing.p75_rate as number;

      // Outlier guard: if the new batch mean is more than 3× or less than 1/3
      // of the established benchmark, treat as a likely data anomaly and skip update.
      // This prevents single bad runs from permanently skewing the benchmark.
      if (prevN >= MIN_SAMPLE_FOR_ANOMALY) {
        const ratio = batchMean / prevMean;
        if (ratio > 3 || ratio < 0.333) {
          console.warn(
            `[Phase3/Benchmarks] Outlier guard triggered for "${normalizedItem}": ` +
            `new batch mean ${batchMean.toFixed(2)} vs established ${prevMean.toFixed(2)} (ratio ${ratio.toFixed(2)}) — skipping update`,
          );
          continue;
        }
      }

      const n = prevN + agg.count;
      const newMean = (prevMean * prevN + agg.sum) / n;
      // p25/p75 track full historical range; only extend, never contract
      const newP25 = Math.min(prevP25, agg.min);
      const newP75 = Math.max(prevP75, agg.max);

      await supabase
        .from('shadow_rate_benchmarks')
        .update({
          median_rate: newMean,
          p25_rate: newP25,
          p75_rate: newP75,
          sample_size: n,
          last_updated: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      // First observation: median_rate = batchMean (always > 0 because we filter rate > 0 upstream)
      await supabase.from('shadow_rate_benchmarks').insert({
        normalized_item: normalizedItem,
        unit,
        median_rate: batchMean,
        p25_rate: agg.min,
        p75_rate: agg.max,
        sample_size: agg.count,
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

  if (itemsWithRates.length === 0) {
    console.warn(`[Phase3/Rates] runId=${runId.slice(0, 8)} — no items with rates, skipping rate intelligence`);
    return { records: [], anomalyCount: 0, underPricedCount: 0, overPricedCount: 0 };
  }

  const benchmarkItems = itemsWithRates.map((i) => ({
    normalizedItem: normalizeItem(i.description),
    unit: normalizeUnit(i.unit),
    rate: i.rate as number,
  }));

  // Upsert benchmarks first so the fetch immediately after has current data
  try {
    await upsertBenchmarks(benchmarkItems);
  } catch (err) {
    console.warn('[Phase3/Rates] upsertBenchmarks failed:', err);
  }

  const normalizedKeys = benchmarkItems.map((b) => b.normalizedItem);
  const benchmarkMap = await fetchBenchmarksForItems(normalizedKeys);

  const rateRecords: Omit<ShadowRateIntelligence, 'id' | 'created_at'>[] = itemsWithRates.map(
    (item, idx) => {
      const normalizedItem = benchmarkItems[idx].normalizedItem;
      const benchmark = benchmarkMap.get(normalizedItem) ?? null;

      // benchmark_rate is never null when sample_size > 0 — enforced in fetchBenchmarksForItems
      const benchmarkRate = benchmark ? benchmark.median_rate : null;

      const benchmarkSampleSize = benchmark ? benchmark.sample_size : 0;
      const { variancePercent, varianceType, anomalyFlag } = classifyVariance(
        item.rate as number,
        benchmarkRate,
        benchmarkSampleSize,
      );

      return {
        run_id: runId,
        item_description: item.description.slice(0, 500),
        normalized_item: normalizedItem,
        unit: item.unit ?? null,
        rate: item.rate as number,
        benchmark_rate: benchmarkRate,
        variance_percent: variancePercent,
        variance_type: varianceType,
        anomaly_flag: anomalyFlag,
      };
    },
  );

  if (rateRecords.length > 0) {
    const { error } = await supabase.from('shadow_rate_intelligence').insert(rateRecords);
    if (error) {
      console.warn(`[Phase3/Rates] shadow_rate_intelligence insert failed: ${error.message}`);
    } else {
      const anomCount = rateRecords.filter((r) => r.anomaly_flag).length;
      console.log(
        `[Phase3/Rates] Wrote ${rateRecords.length} rate records (${anomCount} anomalies) for run ${runId.slice(0, 8)}`,
      );
    }
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

  if (error) {
    return { records: [], anomalyCount: 0, underPricedCount: 0, overPricedCount: 0 };
  }

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
