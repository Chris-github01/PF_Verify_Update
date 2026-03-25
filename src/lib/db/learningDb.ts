import { supabase } from '../supabase';
import { logAdminAction } from '../shadow/auditLogger';
import { PLUMBING_RULE_CONFIG } from '../modules/parsers/plumbing/ruleConfig';
import type {
  LearningEventRecord,
  PatternClusterRecord,
  RuleSuggestionRecord,
  RuleVersionRecord,
  PatternSignature,
  SuggestionStatus,
} from '../modules/parsers/plumbing/learning/learningTypes';
import { extractPatternSignature, derivePatternKey } from '../modules/parsers/plumbing/learning/clusterPatterns';
import type { SuggestionCandidate } from '../modules/parsers/plumbing/learning/generateRuleSuggestions';

const MODULE_KEY = 'plumbing_parser';

// ─── Learning Events ──────────────────────────────────────────────────────────

export async function dbCaptureLearningEvent(params: {
  sourceType: 'regression_failure' | 'beta_anomaly' | 'manual';
  sourceId: string;
  runId?: string;
  signals: string[];
  rawText?: string;
  amount?: number | null;
  quantity?: number | null;
  unit?: string | null;
  rate?: number | null;
  rowIndex?: number;
  totalRows?: number;
  severity?: string;
  anomalyType?: string;
  extraContext?: Record<string, unknown>;
}): Promise<string | null> {
  const sig: PatternSignature = extractPatternSignature({
    rawText: params.rawText,
    signals: params.signals,
    amount: params.amount,
    quantity: params.quantity,
    unit: params.unit,
    rate: params.rate,
    rowIndex: params.rowIndex,
    totalRows: params.totalRows,
  });
  const patternKey = derivePatternKey(sig);

  const { data, error } = await supabase
    .from('parser_learning_events')
    .insert({
      module_key: MODULE_KEY,
      source_type: params.sourceType,
      source_id: params.sourceId,
      run_id: params.runId ?? null,
      learning_type: params.sourceType === 'manual' ? 'beta_anomaly' : params.sourceType,
      pattern_key: patternKey,
      pattern_signature_json: sig,
      context_json: {
        severity: params.severity ?? 'info',
        anomalyType: params.anomalyType,
        rawText: params.rawText?.slice(0, 200),
        ...params.extraContext,
      },
    })
    .select('id')
    .single();

  if (error) { console.error('[learningDb] capture event error', error); return null; }
  return data.id;
}

export async function dbGetLearningEvents(opts: { limit?: number; periodDays?: number } = {}): Promise<LearningEventRecord[]> {
  let q = supabase
    .from('parser_learning_events')
    .select('*')
    .eq('module_key', MODULE_KEY)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 200);

  if (opts.periodDays) {
    const cutoff = new Date(Date.now() - opts.periodDays * 86400_000).toISOString();
    q = q.gte('created_at', cutoff);
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as LearningEventRecord[];
}

// ─── Pattern Clusters ─────────────────────────────────────────────────────────

export async function dbGetPatternClusters(): Promise<PatternClusterRecord[]> {
  const { data, error } = await supabase
    .from('parser_pattern_clusters')
    .select('*')
    .eq('module_key', MODULE_KEY)
    .order('occurrence_count', { ascending: false });
  if (error) throw error;
  return (data ?? []) as PatternClusterRecord[];
}

export async function dbUpsertPatternCluster(cluster: Omit<PatternClusterRecord, 'id' | 'created_at'> & { id?: string }): Promise<PatternClusterRecord> {
  const existing = await supabase
    .from('parser_pattern_clusters')
    .select('id')
    .eq('module_key', MODULE_KEY)
    .eq('pattern_key', cluster.pattern_key)
    .maybeSingle();

  if (existing.data?.id) {
    const { data, error } = await supabase
      .from('parser_pattern_clusters')
      .update({
        occurrence_count: cluster.occurrence_count,
        failure_count: cluster.failure_count,
        last_seen_at: cluster.last_seen_at,
        severity_distribution_json: cluster.severity_distribution_json,
        example_rows_json: cluster.example_rows_json,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.data.id)
      .select()
      .single();
    if (error) throw error;
    return data as PatternClusterRecord;
  }

  const { data, error } = await supabase
    .from('parser_pattern_clusters')
    .insert({
      module_key: MODULE_KEY,
      pattern_key: cluster.pattern_key,
      pattern_label: cluster.pattern_label,
      pattern_signature_json: cluster.pattern_signature_json,
      example_rows_json: cluster.example_rows_json,
      occurrence_count: cluster.occurrence_count,
      failure_count: cluster.failure_count,
      last_seen_at: cluster.last_seen_at,
      severity_distribution_json: cluster.severity_distribution_json,
    })
    .select()
    .single();
  if (error) throw error;
  return data as PatternClusterRecord;
}

// ─── Rule Suggestions ─────────────────────────────────────────────────────────

export async function dbGetRuleSuggestions(status?: SuggestionStatus): Promise<RuleSuggestionRecord[]> {
  let q = supabase
    .from('parser_rule_suggestions')
    .select('*')
    .eq('module_key', MODULE_KEY)
    .order('confidence_score', { ascending: false });
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as RuleSuggestionRecord[];
}

export async function dbInsertRuleSuggestions(candidates: SuggestionCandidate[]): Promise<void> {
  if (candidates.length === 0) return;
  const rows = candidates.map((c) => ({
    module_key: MODULE_KEY,
    suggestion_type: c.suggestionType,
    pattern_key: c.patternKey,
    cluster_id: c.clusterId ?? null,
    description: c.description,
    proposed_rule_json: c.proposedRule,
    expected_impact_json: c.expectedImpact,
    confidence_score: Math.round(c.confidenceScore * 1000) / 1000,
    status: 'pending',
  }));
  const { error } = await supabase.from('parser_rule_suggestions').insert(rows);
  if (error) throw error;
}

export async function dbUpdateSuggestionStatus(
  id: string,
  status: SuggestionStatus,
  notes?: string
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data: before } = await supabase.from('parser_rule_suggestions').select('status').eq('id', id).maybeSingle();

  const { error } = await supabase
    .from('parser_rule_suggestions')
    .update({
      status,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user?.id ?? null,
      review_notes: notes ?? null,
    })
    .eq('id', id);
  if (error) throw error;

  await logAdminAction({
    action: `rule_suggestion.${status}`,
    entityType: 'parser_rule_suggestions',
    entityId: id,
    moduleKey: MODULE_KEY,
    before: { status: before?.status },
    after: { status, notes },
  });
}

// ─── Rule Versions ─────────────────────────────────────────────────────────────

export async function dbGetRuleVersions(): Promise<RuleVersionRecord[]> {
  const { data, error } = await supabase
    .from('parser_rule_versions')
    .select('*')
    .eq('module_key', MODULE_KEY)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data ?? []) as RuleVersionRecord[];
}

export async function dbGetActiveRuleVersion(): Promise<RuleVersionRecord | null> {
  const { data } = await supabase
    .from('parser_rule_versions')
    .select('*')
    .eq('module_key', MODULE_KEY)
    .eq('is_active_shadow', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as RuleVersionRecord | null;
}

export async function dbCreateRuleVersion(params: {
  version: string;
  label: string;
  rules: Record<string, unknown>;
  parentVersionId?: string;
  sourceSuggestionIds?: string[];
  notes?: string;
}): Promise<RuleVersionRecord> {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('parser_rule_versions')
    .insert({
      module_key: MODULE_KEY,
      version: params.version,
      label: params.label,
      rules_json: params.rules,
      parent_version_id: params.parentVersionId ?? null,
      source_suggestion_ids: params.sourceSuggestionIds ?? [],
      is_active_shadow: false,
      notes: params.notes ?? null,
      created_by: user?.id ?? null,
    })
    .select()
    .single();
  if (error) throw error;

  await logAdminAction({
    action: 'rule_version.created',
    entityType: 'parser_rule_versions',
    entityId: data.id,
    moduleKey: MODULE_KEY,
    after: { version: params.version, label: params.label },
    metadata: { sourceSuggestionIds: params.sourceSuggestionIds },
  });

  return data as RuleVersionRecord;
}

export async function dbSetActiveShadowRuleVersion(versionId: string): Promise<void> {
  await supabase
    .from('parser_rule_versions')
    .update({ is_active_shadow: false })
    .eq('module_key', MODULE_KEY);

  const { error } = await supabase
    .from('parser_rule_versions')
    .update({ is_active_shadow: true })
    .eq('id', versionId);
  if (error) throw error;

  await logAdminAction({
    action: 'rule_version.set_active_shadow',
    entityType: 'parser_rule_versions',
    entityId: versionId,
    moduleKey: MODULE_KEY,
    after: { is_active_shadow: true },
  });
}

export async function dbUpdateRuleVersionPassRate(versionId: string, passRate: number): Promise<void> {
  await supabase
    .from('parser_rule_versions')
    .update({ regression_pass_rate: passRate })
    .eq('id', versionId);
}

export function getDefaultRuleVersionConfig(): Record<string, unknown> {
  return {
    summaryPhrases: [...PLUMBING_RULE_CONFIG.summaryPhrases],
    nearMatchTolerancePercent: PLUMBING_RULE_CONFIG.nearMatchTolerancePercent,
    nearMatchToleranceAbsolute: PLUMBING_RULE_CONFIG.nearMatchToleranceAbsolute,
    lastRowsWindowSize: PLUMBING_RULE_CONFIG.lastRowsWindowSize,
    lastRowsWindowPercent: PLUMBING_RULE_CONFIG.lastRowsWindowPercent,
    highAmountMultiplierThreshold: PLUMBING_RULE_CONFIG.highAmountMultiplierThreshold,
    amountOnlyWeighting: PLUMBING_RULE_CONFIG.amountOnlyWeighting,
    missingQtyWeighting: PLUMBING_RULE_CONFIG.missingQtyWeighting,
    missingUnitWeighting: PLUMBING_RULE_CONFIG.missingUnitWeighting,
    lastRowPositionWeighting: PLUMBING_RULE_CONFIG.lastRowPositionWeighting,
    phraseMatchWeighting: PLUMBING_RULE_CONFIG.phraseMatchWeighting,
    valueMatchesDocumentTotalWeighting: PLUMBING_RULE_CONFIG.valueMatchesDocumentTotalWeighting,
    valueSumsPriorRowsWeighting: PLUMBING_RULE_CONFIG.valueSumsPriorRowsWeighting,
    classifyConfidenceThresholdHigh: PLUMBING_RULE_CONFIG.classifyConfidenceThresholdHigh,
    classifyConfidenceThresholdMedium: PLUMBING_RULE_CONFIG.classifyConfidenceThresholdMedium,
  };
}
