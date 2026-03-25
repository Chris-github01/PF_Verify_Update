import { supabase } from '../supabase';
import { logAdminAction } from '../shadow/auditLogger';
import type {
  BetaEventRecord,
  AnomalyEventRecord,
  BetaDailyMetrics,
  AnomalyResolutionStatus,
} from '../modules/parsers/plumbing/beta/anomalyTypes';
import type { DetectedAnomaly } from '../modules/parsers/plumbing/beta/detectAnomalies';

const MODULE_KEY = 'plumbing_parser';

// ─── Beta Events ─────────────────────────────────────────────────────────────

export async function dbInsertBetaEvent(event: Omit<BetaEventRecord, 'id' | 'created_at'>): Promise<string | null> {
  const { data, error } = await supabase
    .from('parser_beta_events')
    .insert({ ...event, module_key: MODULE_KEY })
    .select('id')
    .single();
  if (error) { console.error('beta event insert error', error); return null; }
  return data.id;
}

export async function dbGetBetaEvents(opts: {
  limit?: number;
  orgId?: string;
  runStatus?: string;
  periodDays?: number;
} = {}): Promise<BetaEventRecord[]> {
  let q = supabase
    .from('parser_beta_events')
    .select('*')
    .eq('module_key', MODULE_KEY)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 100);

  if (opts.orgId) q = q.eq('org_id', opts.orgId);
  if (opts.runStatus) q = q.eq('run_status', opts.runStatus);
  if (opts.periodDays) {
    const since = new Date(Date.now() - opts.periodDays * 86400000).toISOString();
    q = q.gte('created_at', since);
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as BetaEventRecord[];
}

// ─── Anomaly Events ───────────────────────────────────────────────────────────

export async function dbSaveAnomalies(params: {
  betaEventId: string;
  runId?: string;
  orgId?: string;
  sourceType?: string;
  sourceId?: string;
  anomalies: DetectedAnomaly[];
}): Promise<void> {
  if (params.anomalies.length === 0) return;

  const rows = params.anomalies.map((a) => ({
    module_key: MODULE_KEY,
    run_id: params.runId ?? null,
    beta_event_id: params.betaEventId,
    org_id: params.orgId ?? null,
    source_type: params.sourceType ?? null,
    source_id: params.sourceId ?? null,
    anomaly_type: a.anomaly_type,
    severity: a.severity,
    anomaly_score: a.anomaly_score,
    title: a.title,
    description: a.description ?? null,
    evidence_json: a.evidence_json,
    resolution_status: 'open' as AnomalyResolutionStatus,
  }));

  const { error } = await supabase.from('parser_anomaly_events').insert(rows);
  if (error) console.error('anomaly insert error', error);
}

export async function dbGetAnomalies(opts: {
  limit?: number;
  offset?: number;
  severity?: string;
  anomalyType?: string;
  orgId?: string;
  resolutionStatus?: string;
  periodDays?: number;
} = {}): Promise<{ data: AnomalyEventRecord[]; count: number }> {
  let q = supabase
    .from('parser_anomaly_events')
    .select('*', { count: 'exact' })
    .eq('module_key', MODULE_KEY)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 50)
    .range(opts.offset ?? 0, (opts.offset ?? 0) + (opts.limit ?? 50) - 1);

  if (opts.severity) q = q.eq('severity', opts.severity);
  if (opts.anomalyType) q = q.eq('anomaly_type', opts.anomalyType);
  if (opts.orgId) q = q.eq('org_id', opts.orgId);
  if (opts.resolutionStatus) q = q.eq('resolution_status', opts.resolutionStatus);
  if (opts.periodDays) {
    const since = new Date(Date.now() - opts.periodDays * 86400000).toISOString();
    q = q.gte('created_at', since);
  }

  const { data, error, count } = await q;
  if (error) throw error;
  return { data: (data ?? []) as AnomalyEventRecord[], count: count ?? 0 };
}

export async function dbGetAnomaly(id: string): Promise<AnomalyEventRecord | null> {
  const { data, error } = await supabase
    .from('parser_anomaly_events')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as AnomalyEventRecord | null;
}

export async function dbAcknowledgeAnomaly(id: string, notes?: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data: before } = await supabase
    .from('parser_anomaly_events')
    .select('severity, anomaly_type, resolution_status')
    .eq('id', id)
    .maybeSingle();

  const { error } = await supabase
    .from('parser_anomaly_events')
    .update({
      resolution_status: 'acknowledged',
      acknowledged_at: new Date().toISOString(),
      acknowledged_by: user?.id,
      resolution_notes: notes ?? null,
    })
    .eq('id', id);
  if (error) throw error;

  await logAdminAction({
    action: 'anomaly.acknowledged',
    entityType: 'parser_anomaly_events',
    entityId: id,
    moduleKey: MODULE_KEY,
    before: { resolution_status: before?.resolution_status },
    after: { resolution_status: 'acknowledged' },
    metadata: { notes },
  });
}

export async function dbUpdateAnomalyStatus(
  id: string,
  status: AnomalyResolutionStatus,
  notes?: string
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data: before } = await supabase
    .from('parser_anomaly_events')
    .select('resolution_status, anomaly_type')
    .eq('id', id)
    .maybeSingle();

  const update: Record<string, unknown> = { resolution_status: status };
  if (status === 'acknowledged' || status === 'resolved') {
    update.acknowledged_at = new Date().toISOString();
    update.acknowledged_by = user?.id;
  }
  if (notes) update.resolution_notes = notes;

  const { error } = await supabase.from('parser_anomaly_events').update(update).eq('id', id);
  if (error) throw error;

  await logAdminAction({
    action: `anomaly.${status}`,
    entityType: 'parser_anomaly_events',
    entityId: id,
    moduleKey: MODULE_KEY,
    before: { resolution_status: before?.resolution_status },
    after: { resolution_status: status },
  });
}

// ─── Daily Metrics ────────────────────────────────────────────────────────────

export async function dbGetDailyMetrics(opts: {
  periodDays?: number;
  orgId?: string;
  rolloutContext?: string;
} = {}): Promise<BetaDailyMetrics[]> {
  const days = opts.periodDays ?? 30;
  const since = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];

  let q = supabase
    .from('parser_beta_daily_metrics')
    .select('*')
    .eq('module_key', MODULE_KEY)
    .gte('metric_date', since)
    .order('metric_date', { ascending: false });

  if (opts.orgId) q = q.eq('org_id', opts.orgId);
  if (opts.rolloutContext) q = q.eq('rollout_context', opts.rolloutContext);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as BetaDailyMetrics[];
}

export async function dbUpsertDailyMetrics(
  metric_date: string,
  rollout_context: string | null,
  org_id: string | null,
  update: Partial<Omit<BetaDailyMetrics, 'id' | 'module_key' | 'metric_date' | 'rollout_context' | 'org_id' | 'created_at' | 'updated_at'>>
): Promise<void> {
  const { data: existing } = await supabase
    .from('parser_beta_daily_metrics')
    .select('id, total_runs, failed_runs, anomaly_count, critical_anomaly_count')
    .eq('module_key', MODULE_KEY)
    .eq('metric_date', metric_date)
    .is('org_id', org_id)
    .maybeSingle();

  const payload = {
    module_key: MODULE_KEY,
    metric_date,
    rollout_context,
    org_id,
    ...update,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    await supabase
      .from('parser_beta_daily_metrics')
      .update(payload)
      .eq('id', existing.id);
  } else {
    await supabase.from('parser_beta_daily_metrics').insert(payload);
  }
}

export async function dbRecomputeDailyMetrics(targetDate?: string): Promise<void> {
  const date = targetDate ?? new Date().toISOString().split('T')[0];
  const since = `${date}T00:00:00Z`;
  const until = `${date}T23:59:59Z`;

  const { data: events } = await supabase
    .from('parser_beta_events')
    .select('*')
    .eq('module_key', MODULE_KEY)
    .gte('created_at', since)
    .lte('created_at', until);

  if (!events || events.length === 0) return;

  const { data: anomalies } = await supabase
    .from('parser_anomaly_events')
    .select('severity, org_id, beta_event_id')
    .eq('module_key', MODULE_KEY)
    .gte('created_at', since)
    .lte('created_at', until);

  const anomalyMap = new Map<string, { count: number; critical: number }>();
  for (const a of anomalies ?? []) {
    if (!a.beta_event_id) continue;
    const key = a.beta_event_id;
    const existing = anomalyMap.get(key) ?? { count: 0, critical: 0 };
    existing.count++;
    if (a.severity === 'critical') existing.critical++;
    anomalyMap.set(key, existing);
  }

  const totalRuns = events.length;
  const failedRuns = events.filter((e: Record<string, unknown>) => e.run_status === 'failed').length;
  const anomalyCount = anomalies?.length ?? 0;
  const criticalCount = anomalies?.filter((a) => a.severity === 'critical').length ?? 0;

  await dbUpsertDailyMetrics(date, null, null, {
    total_runs: totalRuns,
    failed_runs: failedRuns,
    anomaly_count: anomalyCount,
    critical_anomaly_count: criticalCount,
  });
}
