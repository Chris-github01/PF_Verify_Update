import { supabase } from '../supabase';

export type TimeWindow = '7d' | '30d' | '90d' | 'all_time';

export interface LeakageCategory {
  type: string;
  label: string;
  total_value: number;
  count: number;
}

export interface RevenueProtectionAggregate {
  id: string;
  module_key: string;
  time_window: TimeWindow;
  total_quotes: number;
  total_estimated_leakage: number;
  avg_risk_score: number;
  high_risk_quote_count: number;
  top_leakage_categories_json: LeakageCategory[];
  computed_at: string;
  created_at: string;
}

export interface RunRiskRow {
  run_id: string;
  module_key: string;
  overall_risk_score: number;
  overall_risk_level: string;
  total_leakage: number;
  source_label?: string;
  created_at: string;
}

export interface SupplierRiskRow {
  supplier_name: string;
  avg_risk_score: number;
  total_leakage: number;
  run_count: number;
}

function leakageTypeLabel(type: string): string {
  const map: Record<string, string> = {
    scope_gap: 'Scope Gaps',
    rate_anomaly: 'Rate Anomalies',
    document_mismatch: 'Document Mismatch',
    exclusion_risk: 'Exclusion Risk',
    provisional_sum_density: 'Provisional Sums',
  };
  return map[type] ?? type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function windowToDate(window: TimeWindow): string | null {
  const now = new Date();
  if (window === '7d') return new Date(now.getTime() - 7 * 86400000).toISOString();
  if (window === '30d') return new Date(now.getTime() - 30 * 86400000).toISOString();
  if (window === '90d') return new Date(now.getTime() - 90 * 86400000).toISOString();
  return null;
}

export async function computeRevenueProtectionAggregate(
  moduleKey: string,
  timeWindow: TimeWindow,
): Promise<RevenueProtectionAggregate | null> {
  const since = windowToDate(timeWindow);

  let profileQuery = supabase
    .from('shadow_commercial_risk_profiles')
    .select('run_id, overall_score, risk_level, module_key');
  if (moduleKey !== 'all') profileQuery = profileQuery.eq('module_key', moduleKey);
  if (since) profileQuery = profileQuery.gte('created_at', since);

  const { data: profiles } = await profileQuery;
  if (!profiles || profiles.length === 0) return null;

  const runIds = profiles.map((p) => p.run_id);

  let leakageQuery = supabase
    .from('shadow_revenue_leakage_events')
    .select('run_id, leakage_type, estimated_value')
    .in('run_id', runIds);
  if (since) leakageQuery = leakageQuery.gte('created_at', since);

  const { data: leakageEvents } = await leakageQuery;
  const events = leakageEvents ?? [];

  const totalQuotes = profiles.length;
  const avgRiskScore = parseFloat(
    (profiles.reduce((s, p) => s + (p.overall_score ?? 0), 0) / totalQuotes).toFixed(2),
  );
  const highRiskCount = profiles.filter(
    (p) => p.risk_level === 'high' || p.risk_level === 'critical',
  ).length;

  const totalLeakage = events.reduce((s, e) => s + (e.estimated_value ?? 0), 0);

  const byType: Record<string, { total: number; count: number }> = {};
  for (const e of events) {
    const t = e.leakage_type ?? 'unknown';
    if (!byType[t]) byType[t] = { total: 0, count: 0 };
    byType[t].total += e.estimated_value ?? 0;
    byType[t].count += 1;
  }

  const topCategories: LeakageCategory[] = Object.entries(byType)
    .sort(([, a], [, b]) => b.total - a.total)
    .slice(0, 6)
    .map(([type, { total, count }]) => ({
      type,
      label: leakageTypeLabel(type),
      total_value: parseFloat(total.toFixed(2)),
      count,
    }));

  const payload = {
    module_key: moduleKey,
    time_window: timeWindow,
    total_quotes: totalQuotes,
    total_estimated_leakage: parseFloat(totalLeakage.toFixed(2)),
    avg_risk_score: avgRiskScore,
    high_risk_quote_count: highRiskCount,
    top_leakage_categories_json: topCategories,
    computed_at: new Date().toISOString(),
  };

  const { data: existing } = await supabase
    .from('revenue_protection_aggregates')
    .select('id')
    .eq('module_key', moduleKey)
    .eq('time_window', timeWindow)
    .maybeSingle();

  if (existing?.id) {
    const { data } = await supabase
      .from('revenue_protection_aggregates')
      .update(payload)
      .eq('id', existing.id)
      .select()
      .maybeSingle();
    return data as RevenueProtectionAggregate | null;
  }

  const { data } = await supabase
    .from('revenue_protection_aggregates')
    .insert(payload)
    .select()
    .maybeSingle();
  return data as RevenueProtectionAggregate | null;
}

export async function getRevenueProtectionAggregate(
  moduleKey: string,
  timeWindow: TimeWindow,
): Promise<RevenueProtectionAggregate | null> {
  const { data } = await supabase
    .from('revenue_protection_aggregates')
    .select('*')
    .eq('module_key', moduleKey)
    .eq('time_window', timeWindow)
    .maybeSingle();
  return data as RevenueProtectionAggregate | null;
}

export async function getOrComputeAggregate(
  moduleKey: string,
  timeWindow: TimeWindow,
): Promise<RevenueProtectionAggregate | null> {
  const existing = await getRevenueProtectionAggregate(moduleKey, timeWindow);
  if (existing) {
    const age = Date.now() - new Date(existing.computed_at).getTime();
    if (age < 15 * 60 * 1000) return existing;
  }
  return computeRevenueProtectionAggregate(moduleKey, timeWindow);
}

export async function getTopRiskyRuns(
  moduleKey: string,
  timeWindow: TimeWindow,
  limit = 10,
): Promise<RunRiskRow[]> {
  const since = windowToDate(timeWindow);

  let q = supabase
    .from('shadow_commercial_risk_profiles')
    .select('run_id, module_key, overall_score, risk_level, created_at')
    .order('overall_score', { ascending: false })
    .limit(limit);
  if (moduleKey !== 'all') q = q.eq('module_key', moduleKey);
  if (since) q = q.gte('created_at', since);

  const { data: profiles } = await q;
  if (!profiles || profiles.length === 0) return [];

  const runIds = profiles.map((p) => p.run_id);
  const { data: leakageAgg } = await supabase
    .from('shadow_revenue_leakage_events')
    .select('run_id, estimated_value')
    .in('run_id', runIds);

  const leakageByRun: Record<string, number> = {};
  for (const e of leakageAgg ?? []) {
    leakageByRun[e.run_id] = (leakageByRun[e.run_id] ?? 0) + (e.estimated_value ?? 0);
  }

  const { data: runs } = await supabase
    .from('shadow_runs')
    .select('id, source_label')
    .in('id', runIds);
  const labelById: Record<string, string> = {};
  for (const r of runs ?? []) labelById[r.id] = r.source_label ?? r.id.slice(0, 8);

  return profiles.map((p) => ({
    run_id: p.run_id,
    module_key: p.module_key,
    overall_risk_score: p.overall_score ?? 0,
    overall_risk_level: p.risk_level ?? 'low',
    total_leakage: leakageByRun[p.run_id] ?? 0,
    source_label: labelById[p.run_id],
    created_at: p.created_at,
  }));
}
