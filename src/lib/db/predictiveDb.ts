import { supabase } from '../supabase';
import { logAdminAction } from '../shadow/auditLogger';
import type {
  RiskProfileRecord,
  RiskEventRecord,
  RiskPolicyRecord,
  RiskScoringResult,
  RiskTier,
  RiskPolicyConfig,
} from '../modules/parsers/plumbing/predictive/riskTypes';

const MODULE_KEY = 'plumbing_parser';

// ─── Risk Profiles ────────────────────────────────────────────────────────────

export async function dbUpsertRiskProfile(params: {
  sourceType: string;
  sourceId: string;
  orgId?: string;
  quoteSignature: Record<string, unknown>;
  scoringResult: RiskScoringResult;
}): Promise<RiskProfileRecord> {
  const existing = await supabase
    .from('parser_risk_profiles')
    .select('id')
    .eq('module_key', MODULE_KEY)
    .eq('source_id', params.sourceId)
    .maybeSingle();

  const payload = {
    module_key: MODULE_KEY,
    source_type: params.sourceType,
    source_id: params.sourceId,
    org_id: params.orgId ?? null,
    quote_signature_json: params.quoteSignature,
    risk_score: params.scoringResult.riskScore,
    risk_tier: params.scoringResult.riskTier,
    risk_factors_json: params.scoringResult.riskFactors,
    routing_recommendation: params.scoringResult.routingRecommendation,
    updated_at: new Date().toISOString(),
  };

  if (existing.data?.id) {
    const { data, error } = await supabase
      .from('parser_risk_profiles')
      .update(payload)
      .eq('id', existing.data.id)
      .select()
      .single();
    if (error) throw error;
    return data as RiskProfileRecord;
  }

  const { data, error } = await supabase
    .from('parser_risk_profiles')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data as RiskProfileRecord;
}

export async function dbEnrichRiskProfile(
  sourceId: string,
  postParseData: Record<string, unknown>
): Promise<void> {
  await supabase
    .from('parser_risk_profiles')
    .update({
      post_parse_enriched: true,
      post_parse_json: postParseData,
      updated_at: new Date().toISOString(),
    })
    .eq('module_key', MODULE_KEY)
    .eq('source_id', sourceId);
}

export async function dbRecordPredictionOutcome(
  sourceId: string,
  actualOutcome: 'ok' | 'anomaly' | 'failure' | 'discrepancy',
  predictionCorrect: boolean
): Promise<void> {
  await supabase
    .from('parser_risk_profiles')
    .update({
      actual_outcome: actualOutcome,
      prediction_correct: predictionCorrect,
      updated_at: new Date().toISOString(),
    })
    .eq('module_key', MODULE_KEY)
    .eq('source_id', sourceId);
}

export async function dbGetRiskProfiles(opts: {
  riskTier?: RiskTier;
  orgId?: string;
  limit?: number;
  periodDays?: number;
  enrichedOnly?: boolean;
} = {}): Promise<RiskProfileRecord[]> {
  let q = supabase
    .from('parser_risk_profiles')
    .select('*')
    .eq('module_key', MODULE_KEY)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 100);

  if (opts.riskTier) q = q.eq('risk_tier', opts.riskTier);
  if (opts.orgId) q = q.eq('org_id', opts.orgId);
  if (opts.enrichedOnly) q = q.eq('post_parse_enriched', true);
  if (opts.periodDays) {
    const cutoff = new Date(Date.now() - opts.periodDays * 86400_000).toISOString();
    q = q.gte('created_at', cutoff);
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as RiskProfileRecord[];
}

export async function dbGetRiskDistribution(periodDays?: number): Promise<{
  total: number;
  low: number;
  medium: number;
  high: number;
  critical: number;
  shadowRecommended: number;
  reviewRecommended: number;
}> {
  let q = supabase
    .from('parser_risk_profiles')
    .select('risk_tier, routing_recommendation')
    .eq('module_key', MODULE_KEY);

  if (periodDays) {
    const cutoff = new Date(Date.now() - periodDays * 86400_000).toISOString();
    q = q.gte('created_at', cutoff);
  }

  const { data } = await q;
  const rows = (data ?? []) as Array<{ risk_tier: string; routing_recommendation: string }>;

  return {
    total: rows.length,
    low: rows.filter((r) => r.risk_tier === 'low').length,
    medium: rows.filter((r) => r.risk_tier === 'medium').length,
    high: rows.filter((r) => r.risk_tier === 'high').length,
    critical: rows.filter((r) => r.risk_tier === 'critical').length,
    shadowRecommended: rows.filter((r) =>
      r.routing_recommendation === 'shadow_compare_recommended' ||
      r.routing_recommendation === 'shadow_only_recommended'
    ).length,
    reviewRecommended: rows.filter((r) => r.routing_recommendation === 'manual_review_recommended').length,
  };
}

// ─── Risk Events ──────────────────────────────────────────────────────────────

export async function dbInsertRiskEvent(params: {
  sourceType: string;
  sourceId: string;
  orgId?: string;
  runId?: string;
  eventType: 'pre_parse' | 'post_parse' | 'route_decision';
  scoringResult: RiskScoringResult;
  routingDecision?: Record<string, unknown>;
}): Promise<void> {
  await supabase.from('parser_risk_events').insert({
    module_key: MODULE_KEY,
    source_type: params.sourceType,
    source_id: params.sourceId,
    org_id: params.orgId ?? null,
    run_id: params.runId ?? null,
    risk_score: params.scoringResult.riskScore,
    risk_tier: params.scoringResult.riskTier,
    event_type: params.eventType,
    risk_factors_json: params.scoringResult.riskFactors,
    routing_decision_json: params.routingDecision ?? {},
  });
}

export async function dbGetRiskEvents(opts: {
  sourceId?: string;
  orgId?: string;
  riskTier?: RiskTier;
  eventType?: 'pre_parse' | 'post_parse' | 'route_decision';
  limit?: number;
  periodDays?: number;
} = {}): Promise<RiskEventRecord[]> {
  let q = supabase
    .from('parser_risk_events')
    .select('*')
    .eq('module_key', MODULE_KEY)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 100);

  if (opts.sourceId) q = q.eq('source_id', opts.sourceId);
  if (opts.orgId) q = q.eq('org_id', opts.orgId);
  if (opts.riskTier) q = q.eq('risk_tier', opts.riskTier);
  if (opts.eventType) q = q.eq('event_type', opts.eventType);
  if (opts.periodDays) {
    const cutoff = new Date(Date.now() - opts.periodDays * 86400_000).toISOString();
    q = q.gte('created_at', cutoff);
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as RiskEventRecord[];
}

// ─── Risk Policies ─────────────────────────────────────────────────────────────

export async function dbGetRiskPolicies(): Promise<RiskPolicyRecord[]> {
  const { data, error } = await supabase
    .from('parser_risk_policy')
    .select('*')
    .eq('module_key', MODULE_KEY)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as RiskPolicyRecord[];
}

export async function dbGetActivePolicyConfig(): Promise<RiskPolicyConfig | null> {
  const { data } = await supabase
    .from('parser_risk_policy')
    .select('policy_json')
    .eq('module_key', MODULE_KEY)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.policy_json as RiskPolicyConfig ?? null;
}

export async function dbCreateRiskPolicy(params: {
  policyName: string;
  description: string;
  policyJson: RiskPolicyConfig;
}): Promise<RiskPolicyRecord> {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('parser_risk_policy')
    .insert({
      module_key: MODULE_KEY,
      policy_name: params.policyName,
      description: params.description,
      policy_json: params.policyJson,
      is_active: false,
      created_by: user?.id ?? null,
    })
    .select()
    .single();
  if (error) throw error;

  await logAdminAction({
    action: 'risk_policy.created',
    entityType: 'parser_risk_policy',
    entityId: data.id,
    moduleKey: MODULE_KEY,
    after: { policyName: params.policyName },
  });

  return data as RiskPolicyRecord;
}

export async function dbActivateRiskPolicy(policyId: string): Promise<void> {
  const { data: before } = await supabase
    .from('parser_risk_policy')
    .select('policy_name')
    .eq('id', policyId)
    .maybeSingle();

  await supabase
    .from('parser_risk_policy')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('module_key', MODULE_KEY);

  await supabase
    .from('parser_risk_policy')
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq('id', policyId);

  await logAdminAction({
    action: 'risk_policy.activated',
    entityType: 'parser_risk_policy',
    entityId: policyId,
    moduleKey: MODULE_KEY,
    after: { policyName: before?.policy_name, is_active: true },
  });
}

export async function dbUpdateRiskPolicy(
  policyId: string,
  updates: { policyName?: string; description?: string; policyJson?: RiskPolicyConfig }
): Promise<void> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.policyName) payload.policy_name = updates.policyName;
  if (updates.description) payload.description = updates.description;
  if (updates.policyJson) payload.policy_json = updates.policyJson;

  const { error } = await supabase
    .from('parser_risk_policy')
    .update(payload)
    .eq('id', policyId);
  if (error) throw error;

  await logAdminAction({
    action: 'risk_policy.updated',
    entityType: 'parser_risk_policy',
    entityId: policyId,
    moduleKey: MODULE_KEY,
    after: updates,
  });
}
