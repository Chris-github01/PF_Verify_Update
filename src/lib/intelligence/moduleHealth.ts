import { supabase } from '../supabase';

export interface ModuleHealthScore {
  id: string;
  module_key: string;
  snapshot_date: string;
  accuracy_score: number;
  anomaly_rate: number;
  regression_pass_rate: number;
  review_backlog_count: number;
  predictive_accuracy: number;
  optimization_score: number;
  overall_health_score: number;
  trend: 'improving' | 'stable' | 'degrading';
  notes?: string;
  created_at: string;
}

export interface PlatformHealthSummary {
  overallScore: number;
  strongestModule: string;
  weakestModule: string;
  totalModules: number;
  activeModules: number;
  avgAnomalyRate: number;
  avgRegressionPassRate: number;
  trend: 'improving' | 'stable' | 'degrading';
}

export function calculateOverallHealth(params: {
  accuracy_score: number;
  anomaly_rate: number;
  regression_pass_rate: number;
  review_backlog_count: number;
  predictive_accuracy: number;
  optimization_score: number;
}): number {
  const anomalyPenalty = Math.min(params.anomaly_rate * 3, 30);
  const backlogPenalty = Math.min(params.review_backlog_count * 2, 20);

  const raw =
    params.accuracy_score * 0.25 +
    params.regression_pass_rate * 0.30 +
    params.predictive_accuracy * 0.20 +
    params.optimization_score * 0.10 +
    (100 - params.anomaly_rate * 10) * 0.15 -
    anomalyPenalty * 0.1 -
    backlogPenalty * 0.05;

  return Math.max(0, Math.min(100, Math.round(raw)));
}

export function deriveTrend(current: number, previous?: number): 'improving' | 'stable' | 'degrading' {
  if (previous == null) return 'stable';
  if (current >= previous + 3) return 'improving';
  if (current <= previous - 3) return 'degrading';
  return 'stable';
}

export function buildDefaultHealthScore(moduleKey: string): Omit<ModuleHealthScore, 'id' | 'created_at'> {
  const defaults: Record<string, Partial<ModuleHealthScore>> = {
    plumbing_parser: {
      accuracy_score: 88,
      anomaly_rate: 4.5,
      regression_pass_rate: 92,
      review_backlog_count: 0,
      predictive_accuracy: 82,
      optimization_score: 75,
    },
    passive_fire_parser: {
      accuracy_score: 85,
      anomaly_rate: 5.0,
      regression_pass_rate: 88,
      review_backlog_count: 0,
      predictive_accuracy: 0,
      optimization_score: 0,
    },
    active_fire_parser: {
      accuracy_score: 70,
      anomaly_rate: 8.0,
      regression_pass_rate: 75,
      review_backlog_count: 0,
      predictive_accuracy: 0,
      optimization_score: 0,
    },
    electrical_parser: {
      accuracy_score: 0,
      anomaly_rate: 0,
      regression_pass_rate: 0,
      review_backlog_count: 0,
      predictive_accuracy: 0,
      optimization_score: 0,
    },
    hvac_parser: {
      accuracy_score: 0,
      anomaly_rate: 0,
      regression_pass_rate: 0,
      review_backlog_count: 0,
      predictive_accuracy: 0,
      optimization_score: 0,
    },
  };

  const d = defaults[moduleKey] ?? {};
  const params = {
    accuracy_score: d.accuracy_score ?? 0,
    anomaly_rate: d.anomaly_rate ?? 0,
    regression_pass_rate: d.regression_pass_rate ?? 0,
    review_backlog_count: d.review_backlog_count ?? 0,
    predictive_accuracy: d.predictive_accuracy ?? 0,
    optimization_score: d.optimization_score ?? 0,
  };

  const overall = calculateOverallHealth(params);

  return {
    module_key: moduleKey,
    snapshot_date: new Date().toISOString().split('T')[0],
    ...params,
    overall_health_score: overall,
    trend: 'stable',
  };
}

export async function dbGetModuleHealthScores(opts: { moduleKey?: string; limit?: number } = {}): Promise<ModuleHealthScore[]> {
  let q = supabase
    .from('module_health_scores')
    .select('*')
    .order('snapshot_date', { ascending: false })
    .limit(opts.limit ?? 100);
  if (opts.moduleKey) q = q.eq('module_key', opts.moduleKey);
  const { data } = await q;
  return (data ?? []) as ModuleHealthScore[];
}

export async function dbGetLatestHealthScores(): Promise<ModuleHealthScore[]> {
  const { data } = await supabase
    .from('module_health_scores')
    .select('*')
    .order('snapshot_date', { ascending: false })
    .limit(20);
  if (!data || data.length === 0) return [];

  const latest = new Map<string, ModuleHealthScore>();
  for (const row of data as ModuleHealthScore[]) {
    if (!latest.has(row.module_key)) latest.set(row.module_key, row);
  }
  return [...latest.values()];
}

export async function dbSaveHealthScore(score: Omit<ModuleHealthScore, 'id' | 'created_at'>): Promise<ModuleHealthScore> {
  const { data, error } = await supabase
    .from('module_health_scores')
    .upsert(score, { onConflict: 'module_key,snapshot_date' })
    .select()
    .single();
  if (error) throw error;
  return data as ModuleHealthScore;
}

export async function computePlatformHealthSummary(scores: ModuleHealthScore[]): Promise<PlatformHealthSummary> {
  const active = scores.filter((s) => s.overall_health_score > 0);
  if (active.length === 0) {
    return { overallScore: 0, strongestModule: 'n/a', weakestModule: 'n/a', totalModules: scores.length, activeModules: 0, avgAnomalyRate: 0, avgRegressionPassRate: 0, trend: 'stable' };
  }

  const sorted = [...active].sort((a, b) => b.overall_health_score - a.overall_health_score);
  const overall = Math.round(active.reduce((s, x) => s + x.overall_health_score, 0) / active.length);
  const avgAnomaly = active.reduce((s, x) => s + x.anomaly_rate, 0) / active.length;
  const avgRegression = active.reduce((s, x) => s + x.regression_pass_rate, 0) / active.length;
  const improving = active.filter((s) => s.trend === 'improving').length;
  const degrading = active.filter((s) => s.trend === 'degrading').length;

  return {
    overallScore: overall,
    strongestModule: sorted[0]?.module_key ?? 'n/a',
    weakestModule: sorted[sorted.length - 1]?.module_key ?? 'n/a',
    totalModules: scores.length,
    activeModules: active.length,
    avgAnomalyRate: Math.round(avgAnomaly * 10) / 10,
    avgRegressionPassRate: Math.round(avgRegression * 10) / 10,
    trend: improving > degrading ? 'improving' : degrading > improving ? 'degrading' : 'stable',
  };
}
