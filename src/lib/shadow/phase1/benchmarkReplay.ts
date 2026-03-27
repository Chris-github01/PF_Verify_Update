import { supabase } from '../../supabase';

export interface BenchmarkSet {
  id: string;
  name: string;
  module_key: string;
  description: string | null;
  active: boolean;
  created_at: string;
}

export interface BenchmarkQuote {
  id: string;
  benchmark_set_id: string;
  dataset_id: string;
  supplier_name: string | null;
  expected_total: number | null;
  expected_line_count: number | null;
  expected_classifications_json: Record<string, unknown>;
  expected_qualifications_json: unknown[];
  expected_truth_json: Record<string, unknown>;
  tags_json: string[];
  created_at: string;
}

export interface BenchmarkReplayRun {
  id: string;
  benchmark_set_id: string;
  module_key: string;
  shadow_version: string;
  total_accuracy: number | null;
  line_accuracy: number | null;
  regression_count: number;
  critical_failures: number;
  pass_status: 'pending' | 'pass' | 'fail' | 'error';
  results_json: unknown[];
  created_at: string;
}

export interface ReplayQuoteResult {
  dataset_id: string;
  supplier_name: string | null;
  expected_total: number | null;
  actual_total: number | null;
  total_delta: number | null;
  total_delta_pct: number | null;
  expected_line_count: number | null;
  actual_line_count: number | null;
  line_delta: number | null;
  pass: boolean;
  failure_codes: string[];
}

export interface ReplayScore {
  totalAccuracy: number;
  lineAccuracy: number;
  weightedScore: number;
  passStatus: 'pass' | 'fail';
  regressionCount: number;
  criticalFailures: number;
}

function scoreTotalAccuracy(results: ReplayQuoteResult[]): number {
  const withExpected = results.filter((r) => r.expected_total != null && r.expected_total > 0);
  if (withExpected.length === 0) return 100;
  const passing = withExpected.filter((r) => {
    if (r.total_delta_pct == null) return false;
    return Math.abs(r.total_delta_pct) <= 5;
  });
  return Math.round((passing.length / withExpected.length) * 100);
}

function scoreLineAccuracy(results: ReplayQuoteResult[]): number {
  const withExpected = results.filter((r) => r.expected_line_count != null && r.expected_line_count > 0);
  if (withExpected.length === 0) return 100;
  const passing = withExpected.filter((r) => {
    if (r.line_delta == null) return false;
    return Math.abs(r.line_delta) <= 2;
  });
  return Math.round((passing.length / withExpected.length) * 100);
}

function calculateWeightedScore(totalAcc: number, lineAcc: number): number {
  return Math.round(totalAcc * 0.4 + lineAcc * 0.3 + 100 * 0.2 + 100 * 0.1);
}

export async function getBenchmarkSets(moduleKey?: string): Promise<BenchmarkSet[]> {
  let query = supabase
    .from('benchmark_sets')
    .select('*')
    .eq('active', true)
    .order('created_at', { ascending: false });
  if (moduleKey) query = query.eq('module_key', moduleKey);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as BenchmarkSet[];
}

export async function getBenchmarkQuotes(benchmarkSetId: string): Promise<BenchmarkQuote[]> {
  const { data, error } = await supabase
    .from('benchmark_quotes')
    .select('*')
    .eq('benchmark_set_id', benchmarkSetId)
    .order('created_at');
  if (error) throw error;
  return (data ?? []) as BenchmarkQuote[];
}

export async function getReplayRuns(benchmarkSetId: string): Promise<BenchmarkReplayRun[]> {
  const { data, error } = await supabase
    .from('benchmark_replay_runs')
    .select('*')
    .eq('benchmark_set_id', benchmarkSetId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as BenchmarkReplayRun[];
}

export async function createBenchmarkSet(
  name: string,
  moduleKey: string,
  description?: string,
): Promise<BenchmarkSet> {
  const { data, error } = await supabase
    .from('benchmark_sets')
    .insert({ name, module_key: moduleKey, description: description ?? null })
    .select()
    .single();
  if (error) throw error;
  return data as BenchmarkSet;
}

export async function addBenchmarkQuote(
  benchmarkSetId: string,
  quote: Omit<BenchmarkQuote, 'id' | 'benchmark_set_id' | 'created_at'>,
): Promise<BenchmarkQuote> {
  const { data, error } = await supabase
    .from('benchmark_quotes')
    .insert({ ...quote, benchmark_set_id: benchmarkSetId })
    .select()
    .single();
  if (error) throw error;
  return data as BenchmarkQuote;
}

export async function runBenchmarkReplay(
  benchmarkSetId: string,
  moduleKey: string,
  shadowVersion: string,
  fetchActualOutput: (datasetId: string) => Promise<{ total: number | null; lineCount: number | null }>,
): Promise<BenchmarkReplayRun> {
  const quotes = await getBenchmarkQuotes(benchmarkSetId);

  if (quotes.length === 0) {
    const { data, error } = await supabase
      .from('benchmark_replay_runs')
      .insert({
        benchmark_set_id: benchmarkSetId,
        module_key: moduleKey,
        shadow_version: shadowVersion,
        total_accuracy: null,
        line_accuracy: null,
        regression_count: 0,
        critical_failures: 0,
        pass_status: 'error',
        results_json: [],
      })
      .select()
      .single();
    if (error) throw error;
    return data as BenchmarkReplayRun;
  }

  const results: ReplayQuoteResult[] = [];
  let regressionCount = 0;
  let criticalFailures = 0;

  for (const bq of quotes) {
    try {
      const actual = await fetchActualOutput(bq.dataset_id);
      const expectedTotal = bq.expected_total;
      const actualTotal = actual.total;
      const totalDelta = expectedTotal != null && actualTotal != null ? actualTotal - expectedTotal : null;
      const totalDeltaPct =
        totalDelta != null && expectedTotal != null && expectedTotal > 0
          ? (totalDelta / expectedTotal) * 100
          : null;
      const lineDelta =
        bq.expected_line_count != null && actual.lineCount != null
          ? actual.lineCount - bq.expected_line_count
          : null;

      const pass =
        (totalDeltaPct == null || Math.abs(totalDeltaPct) <= 5) &&
        (lineDelta == null || Math.abs(lineDelta) <= 2);

      if (!pass) regressionCount++;
      if (totalDeltaPct != null && Math.abs(totalDeltaPct) > 20) criticalFailures++;

      results.push({
        dataset_id: bq.dataset_id,
        supplier_name: bq.supplier_name,
        expected_total: expectedTotal,
        actual_total: actualTotal,
        total_delta: totalDelta,
        total_delta_pct: totalDeltaPct,
        expected_line_count: bq.expected_line_count,
        actual_line_count: actual.lineCount,
        line_delta: lineDelta,
        pass,
        failure_codes: pass ? [] : totalDeltaPct != null && Math.abs(totalDeltaPct) > 5 ? ['total_mismatch'] : ['line_count_mismatch'],
      });
    } catch {
      regressionCount++;
      criticalFailures++;
      results.push({
        dataset_id: bq.dataset_id,
        supplier_name: bq.supplier_name,
        expected_total: bq.expected_total,
        actual_total: null,
        total_delta: null,
        total_delta_pct: null,
        expected_line_count: bq.expected_line_count,
        actual_line_count: null,
        line_delta: null,
        pass: false,
        failure_codes: ['execution_error'],
      });
    }
  }

  const totalAccuracy = scoreTotalAccuracy(results);
  const lineAccuracy = scoreLineAccuracy(results);
  const weightedScore = calculateWeightedScore(totalAccuracy, lineAccuracy);
  const passStatus: 'pass' | 'fail' = weightedScore >= 70 && criticalFailures === 0 ? 'pass' : 'fail';

  const { data, error } = await supabase
    .from('benchmark_replay_runs')
    .insert({
      benchmark_set_id: benchmarkSetId,
      module_key: moduleKey,
      shadow_version: shadowVersion,
      total_accuracy: totalAccuracy,
      line_accuracy: lineAccuracy,
      regression_count: regressionCount,
      critical_failures: criticalFailures,
      pass_status: passStatus,
      results_json: results,
    })
    .select()
    .single();
  if (error) throw error;
  return data as BenchmarkReplayRun;
}
