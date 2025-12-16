import { supabase } from '../supabase';

export interface AuditKPIs {
  totalQuotes: number;
  quotesSuccessfullyParsed: number;
  parseSuccessRate: number;
  totalLineItems: number;
  avgParseConfidence: number;
  avgTimeToAudit: number;
  totalAuditsCompleted: number;
  riskDistribution: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  topGapTypes: Array<{ type: string; count: number }>;
  topManufacturers: Array<{ manufacturer: string; count: number }>;
  timeSavings: {
    hoursSaved: number;
    labourSavingsNZD: number;
  };
  costSavings: {
    conservative: number;
    expected: number;
    aggressive: number;
  };
}

export interface SystemConfig {
  manual_review_hours_per_quote: number;
  manual_scope_matrix_hours_per_audit: number;
  labour_rate_per_hour_nzd: number;
  risk_avoidance_percent_low: number;
  risk_avoidance_percent_med: number;
  risk_avoidance_percent_high: number;
  scenario_multiplier_conservative: number;
  scenario_multiplier_expected: number;
  scenario_multiplier_aggressive: number;
}

export async function getSystemConfig(): Promise<SystemConfig> {
  const { data, error } = await supabase
    .from('system_config')
    .select('key, value');

  if (error) throw error;

  const config: any = {};
  data?.forEach(item => {
    config[item.key] = parseFloat(JSON.parse(item.value));
  });

  return config as SystemConfig;
}

export async function calculateAuditKPIs(filters?: {
  organisationId?: string;
  projectId?: string;
  module?: string;
  startDate?: string;
  endDate?: string;
}): Promise<AuditKPIs> {
  const config = await getSystemConfig();

  // Convert camelCase filters to snake_case RPC parameters
  const rpcParams = {
    p_organisation_id: filters?.organisationId || null,
    p_project_id: filters?.projectId || null,
    p_module: filters?.module || null,
    p_start_date: filters?.startDate || null,
    p_end_date: filters?.endDate || null,
  };

  // Get quote statistics
  const { data: quoteStats, error: quoteError } = await supabase.rpc('calculate_quote_stats', rpcParams);

  if (quoteError) {
    console.error('Error fetching quote stats:', quoteError);
  }

  // Get audit statistics
  const { data: auditStats, error: auditError } = await supabase.rpc('calculate_audit_stats', rpcParams);

  if (auditError) {
    console.error('Error fetching audit stats:', auditError);
  }

  // Calculate time savings
  const quotesCount = quoteStats?.total_quotes || 0;
  const auditsCount = auditStats?.total_audits || 0;

  const hoursSaved =
    quotesCount * config.manual_review_hours_per_quote +
    auditsCount * config.manual_scope_matrix_hours_per_audit;

  const labourSavingsNZD = hoursSaved * config.labour_rate_per_hour_nzd;

  // Calculate cost savings
  const estimatedCostAvoided = auditStats?.estimated_cost_avoided || 0;

  return {
    totalQuotes: quoteStats?.total_quotes || 0,
    quotesSuccessfullyParsed: quoteStats?.success_quotes || 0,
    parseSuccessRate: quoteStats?.success_rate || 0,
    totalLineItems: quoteStats?.total_line_items || 0,
    avgParseConfidence: quoteStats?.avg_confidence || 0,
    avgTimeToAudit: auditStats?.avg_duration_seconds || 0,
    totalAuditsCompleted: auditsCount,
    riskDistribution: auditStats?.risk_distribution || {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    },
    topGapTypes: auditStats?.top_gap_types || [],
    topManufacturers: quoteStats?.top_manufacturers || [],
    timeSavings: {
      hoursSaved,
      labourSavingsNZD,
    },
    costSavings: {
      conservative: estimatedCostAvoided * config.scenario_multiplier_conservative,
      expected: estimatedCostAvoided * config.scenario_multiplier_expected,
      aggressive: estimatedCostAvoided * config.scenario_multiplier_aggressive,
    },
  };
}

export async function logAuditEvent(
  organisationId: string,
  entityType: string,
  entityId: string,
  action: string,
  actorUserId: string | null,
  metadata?: any
) {
  const { error } = await supabase.from('audit_events').insert({
    organisation_id: organisationId,
    entity_type: entityType,
    entity_id: entityId,
    action,
    actor_user_id: actorUserId,
    metadata_json: metadata || {},
  });

  if (error) {
    console.error('Failed to log audit event:', error);
  }
}

export async function calculateRiskScore(
  gapsCount: number,
  exclusionsCount: number,
  complianceFlagsCount: number,
  avgConfidence: number
): Promise<number> {
  // Risk score algorithm (0-100)
  // Higher gaps/exclusions/flags = higher risk
  // Lower confidence = higher risk

  const gapWeight = 0.3;
  const exclusionWeight = 0.3;
  const complianceWeight = 0.25;
  const confidenceWeight = 0.15;

  const normalizedGaps = Math.min(gapsCount / 10, 1) * 100;
  const normalizedExclusions = Math.min(exclusionsCount / 5, 1) * 100;
  const normalizedCompliance = Math.min(complianceFlagsCount / 5, 1) * 100;
  const normalizedConfidence = (100 - avgConfidence);

  const riskScore =
    normalizedGaps * gapWeight +
    normalizedExclusions * exclusionWeight +
    normalizedCompliance * complianceWeight +
    normalizedConfidence * confidenceWeight;

  return Math.min(Math.round(riskScore), 100);
}

export async function estimateCostImpact(
  riskScore: number,
  contractValue: number
): Promise<{ conservative: number; expected: number; aggressive: number }> {
  const config = await getSystemConfig();

  let riskPercent = config.risk_avoidance_percent_low;
  if (riskScore > 70) {
    riskPercent = config.risk_avoidance_percent_high;
  } else if (riskScore >= 40) {
    riskPercent = config.risk_avoidance_percent_med;
  }

  const baseImpact = (contractValue * riskPercent) / 100;

  return {
    conservative: baseImpact * config.scenario_multiplier_conservative,
    expected: baseImpact * config.scenario_multiplier_expected,
    aggressive: baseImpact * config.scenario_multiplier_aggressive,
  };
}
