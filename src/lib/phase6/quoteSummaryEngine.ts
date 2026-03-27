import { supabase } from '../supabase';
import type { CommercialRiskLevel } from '../shadow/phase3/commercialRiskEngine';

export interface QuoteIssue {
  label: string;
  financial_impact: number | null;
  severity: CommercialRiskLevel;
}

export interface QuoteIntelligenceSummary {
  id: string;
  run_id: string;
  module_key: string;
  overall_risk_score: number;
  overall_risk_level: CommercialRiskLevel;
  key_issues_json: QuoteIssue[];
  key_strengths_json: string[];
  recommendation_text: string;
  confidence_score: number;
  created_at: string;
  updated_at: string;
}

function buildRecommendation(level: CommercialRiskLevel): string {
  if (level === 'critical') return 'Do NOT award without immediate clarification on all flagged items.';
  if (level === 'high') return 'Review flagged issues with senior commercial team before award.';
  if (level === 'medium') return 'Review before award — flagged items should be clarified with the subcontractor.';
  return 'Suitable for award. No significant commercial risks identified.';
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}k`;
  return `$${value.toLocaleString()}`;
}

function issueLabel(leakageType: string, value: number | null): string {
  const val = value ? ` (${formatCurrency(value)})` : '';
  const map: Record<string, string> = {
    scope_gap: `Missing scope items${val}`,
    rate_anomaly: `Rate anomaly detected${val}`,
    document_mismatch: `Parser total vs document total mismatch${val}`,
    exclusion_risk: `High-risk exclusions present${val}`,
    provisional_sum_density: `Excessive provisional sums${val}`,
  };
  return map[leakageType] ?? `${leakageType.replace(/_/g, ' ')}${val}`;
}

export async function generateQuoteIntelligenceSummary(
  runId: string,
  moduleKey: string,
): Promise<QuoteIntelligenceSummary | null> {
  const [riskResult, leakageResult, failuresResult] = await Promise.all([
    supabase
      .from('shadow_commercial_risk_profiles')
      .select('overall_score, risk_level, scope_score, rate_score, leakage_score, factors_json')
      .eq('run_id', runId)
      .maybeSingle(),
    supabase
      .from('shadow_revenue_leakage_events')
      .select('leakage_type, description, estimated_value, confidence')
      .eq('run_id', runId)
      .order('estimated_value', { ascending: false }),
    supabase
      .from('shadow_run_failures')
      .select('failure_code, severity, description')
      .eq('run_id', runId),
  ]);

  const risk = riskResult.data;
  const leakageEvents = leakageResult.data ?? [];
  const failures = failuresResult.data ?? [];

  const riskScore = risk?.overall_score ?? 0;
  const riskLevel: CommercialRiskLevel = (risk?.risk_level as CommercialRiskLevel) ?? 'low';

  const issues: QuoteIssue[] = [];

  for (const ev of leakageEvents.slice(0, 5)) {
    const severity: CommercialRiskLevel =
      (ev.estimated_value ?? 0) > 50_000
        ? 'critical'
        : (ev.estimated_value ?? 0) > 10_000
          ? 'high'
          : 'medium';
    issues.push({
      label: issueLabel(ev.leakage_type, ev.estimated_value),
      financial_impact: ev.estimated_value ?? null,
      severity,
    });
  }

  for (const f of failures.filter((x) => x.severity === 'critical' || x.severity === 'high').slice(0, 3)) {
    if (issues.length >= 5) break;
    issues.push({
      label: f.description ?? f.failure_code?.replace(/_/g, ' ') ?? 'Parser failure',
      financial_impact: null,
      severity: (f.severity as CommercialRiskLevel) ?? 'medium',
    });
  }

  issues.sort((a, b) => {
    const sev = { critical: 4, high: 3, medium: 2, low: 1 };
    return (sev[b.severity] ?? 0) - (sev[a.severity] ?? 0);
  });

  const strengths: string[] = [];
  if (leakageEvents.length === 0) strengths.push('No revenue leakage events detected');
  if ((risk?.scope_score ?? 100) <= 20) strengths.push('Complete scope coverage');
  if ((risk?.rate_score ?? 100) <= 20) strengths.push('Rates aligned with benchmark');
  if (failures.length === 0) strengths.push('No parser failures detected');
  if (strengths.length === 0 && riskLevel === 'low') strengths.push('No significant commercial risks identified');

  const totalLeakage = leakageEvents.reduce((s, e) => s + (e.estimated_value ?? 0), 0);
  const parserConfidence = failures.length === 0 ? 0.95 : failures.length < 3 ? 0.80 : 0.65;
  const leakageConfidence = leakageEvents.length > 0
    ? leakageEvents.reduce((s, e) => s + (e.confidence ?? 0.7), 0) / leakageEvents.length
    : 0.9;
  const confidenceScore = parseFloat(((parserConfidence + leakageConfidence) / 2).toFixed(3));

  const recommendation = buildRecommendation(riskLevel);

  const summaryPayload = {
    run_id: runId,
    module_key: moduleKey,
    overall_risk_score: riskScore,
    overall_risk_level: riskLevel,
    key_issues_json: issues,
    key_strengths_json: strengths,
    recommendation_text: recommendation,
    confidence_score: confidenceScore,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('quote_intelligence_summaries')
    .upsert(
      { ...summaryPayload, _match: `${runId}` },
      { onConflict: 'run_id' },
    )
    .select()
    .maybeSingle();

  if (error) {
    const { data: inserted } = await supabase
      .from('quote_intelligence_summaries')
      .insert(summaryPayload)
      .select()
      .maybeSingle();
    return inserted as QuoteIntelligenceSummary | null;
  }

  return data as QuoteIntelligenceSummary | null;
}

export async function getQuoteIntelligenceSummary(
  runId: string,
): Promise<QuoteIntelligenceSummary | null> {
  const { data } = await supabase
    .from('quote_intelligence_summaries')
    .select('*')
    .eq('run_id', runId)
    .maybeSingle();
  return data as QuoteIntelligenceSummary | null;
}

export async function getOrGenerateSummary(
  runId: string,
  moduleKey: string,
): Promise<QuoteIntelligenceSummary | null> {
  const existing = await getQuoteIntelligenceSummary(runId);
  if (existing) return existing;
  return generateQuoteIntelligenceSummary(runId, moduleKey);
}
