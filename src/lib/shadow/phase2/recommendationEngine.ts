import { supabase } from '../../supabase';

export type RecommendationType =
  | 'parser_rule_candidate'
  | 'anchor_pattern_candidate'
  | 'supplier_template_rule'
  | 'review_workflow_improvement'
  | 'benchmark_gap'
  | 'confidence_threshold_adjustment'
  | 'diagnostics_enhancement';

export type RecommendationStatus =
  | 'open'
  | 'accepted'
  | 'deferred'
  | 'rejected'
  | 'implemented';

export type ImplementationComplexity = 'low' | 'medium' | 'high';

export interface ImprovementRecommendation {
  id: string;
  module_key: string;
  title: string;
  recommendation_type: RecommendationType;
  target_failure_code: string | null;
  target_supplier_family: string | null;
  evidence_count: number;
  expected_impact_score: number;
  implementation_complexity: ImplementationComplexity;
  recommendation_text: string;
  status: RecommendationStatus;
  supporting_run_ids_json: string[];
  created_at: string;
  updated_at: string;
}

interface FailureAggregation {
  failure_code: string;
  count: number;
  total_financial_impact: number;
  run_ids: string[];
}

interface FingerprintAggregation {
  template_family_id: string;
  supplier_name_normalized: string | null;
  run_count: number;
  historical_accuracy: number;
  common_failure_modes: string[];
}

async function aggregateFailures(moduleKey: string): Promise<FailureAggregation[]> {
  // Step 1: fetch run IDs for this module (avoids relying on PostgREST embedded join
  // which requires the FK to be in the schema cache — safe regardless of FK state)
  const { data: runs, error: runsErr } = await supabase
    .from('shadow_runs')
    .select('id')
    .eq('module_key', moduleKey)
    .eq('status', 'completed');

  if (runsErr || !runs || runs.length === 0) return [];

  const runIds = runs.map((r) => String(r.id));

  // Step 2: fetch all failures for those run IDs
  const { data, error } = await supabase
    .from('shadow_run_failures')
    .select('failure_code, financial_impact_estimate, run_id')
    .in('run_id', runIds);

  if (error || !data) return [];

  const map = new Map<string, FailureAggregation>();
  for (const row of data) {
    const code = String(row.failure_code);
    const existing = map.get(code) ?? {
      failure_code: code,
      count: 0,
      total_financial_impact: 0,
      run_ids: [],
    };
    existing.count += 1;
    existing.total_financial_impact += typeof row.financial_impact_estimate === 'number'
      ? row.financial_impact_estimate
      : 0;
    if (row.run_id && !existing.run_ids.includes(String(row.run_id))) {
      existing.run_ids.push(String(row.run_id));
    }
    map.set(code, existing);
  }

  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

async function aggregateFingerprints(): Promise<FingerprintAggregation[]> {
  const { data, error } = await supabase
    .from('supplier_fingerprints')
    .select('template_family_id, supplier_name_normalized, historical_run_count, historical_accuracy, common_failure_modes_json')
    .order('historical_run_count', { ascending: false })
    .limit(50);

  if (error || !data) return [];

  return data.map((row) => ({
    template_family_id: String(row.template_family_id),
    supplier_name_normalized: row.supplier_name_normalized ? String(row.supplier_name_normalized) : null,
    run_count: Number(row.historical_run_count ?? 0),
    historical_accuracy: Number(row.historical_accuracy ?? 0),
    common_failure_modes: Array.isArray(row.common_failure_modes_json)
      ? row.common_failure_modes_json.map(String)
      : [],
  }));
}

async function aggregateAdjudications(moduleKey: string): Promise<{
  byRootCause: Map<string, number>;
  byCorrectionType: Map<string, number>;
  totalCount: number;
}> {
  const { data, error } = await supabase
    .from('adjudication_events')
    .select('root_cause_category, correction_type')
    .eq('module_key', moduleKey);

  if (error || !data) {
    return { byRootCause: new Map(), byCorrectionType: new Map(), totalCount: 0 };
  }

  const byRootCause = new Map<string, number>();
  const byCorrectionType = new Map<string, number>();

  for (const row of data) {
    if (row.root_cause_category) {
      byRootCause.set(
        String(row.root_cause_category),
        (byRootCause.get(String(row.root_cause_category)) ?? 0) + 1,
      );
    }
    if (row.correction_type) {
      byCorrectionType.set(
        String(row.correction_type),
        (byCorrectionType.get(String(row.correction_type)) ?? 0) + 1,
      );
    }
  }

  return { byRootCause, byCorrectionType, totalCount: data.length };
}

function computeImpactScore(
  evidenceCount: number,
  avgFinancialImpact: number,
  supplierBreadth: number,
  adjudicationCount: number,
): number {
  let score = 0;
  if (evidenceCount >= 10) score += 30;
  else if (evidenceCount >= 5) score += 20;
  else if (evidenceCount >= 2) score += 10;
  else score += 5;

  if (avgFinancialImpact > 50000) score += 30;
  else if (avgFinancialImpact > 10000) score += 20;
  else if (avgFinancialImpact > 1000) score += 10;

  if (supplierBreadth >= 3) score += 20;
  else if (supplierBreadth >= 2) score += 10;

  if (adjudicationCount >= 3) score += 20;
  else if (adjudicationCount > 0) score += 10;

  return Math.min(100, score);
}

function buildRecommendations(
  moduleKey: string,
  failures: FailureAggregation[],
  fingerprints: FingerprintAggregation[],
  adjudications: { byRootCause: Map<string, number>; byCorrectionType: Map<string, number>; totalCount: number },
): Omit<ImprovementRecommendation, 'id' | 'created_at' | 'updated_at' | 'status'>[] {
  const recs: Omit<ImprovementRecommendation, 'id' | 'created_at' | 'updated_at' | 'status'>[] = [];

  const topFailures = failures.slice(0, 5);
  for (const f of topFailures) {
    if (f.count < 1) continue;

    const avgImpact = f.count > 0 ? f.total_financial_impact / f.count : 0;
    const affectedFamilies = fingerprints.filter((fp) =>
      fp.common_failure_modes.includes(f.failure_code),
    );

    let recType: RecommendationType = 'parser_rule_candidate';
    let complexity: ImplementationComplexity = 'medium';
    let title = '';
    let text = '';

    if (f.failure_code === 'total_extraction_failure' || f.failure_code === 'document_extraction_failure') {
      recType = 'anchor_pattern_candidate';
      complexity = 'medium';
      title = `Improve document total anchor detection (${f.count} runs affected)`;
      text = `The failure code '${f.failure_code}' has appeared in ${f.count} shadow runs across this module. ` +
        `This indicates the parser is unable to reliably locate the document total anchor. ` +
        `Consider extending the anchor pattern library with new total phrase variants, ` +
        `or improving fallback detection for documents without explicit total rows.`;
    } else if (f.failure_code === 'systemic_failure') {
      recType = 'parser_rule_candidate';
      complexity = 'high';
      title = `Address systemic parse miss — ${f.count} runs with >25% undercapture`;
      text = `Systemic failures indicate the parser is capturing less than 75% of the document total in ${f.count} runs. ` +
        `This commonly occurs when documents have unusual section structures or non-standard line item groupings. ` +
        `Review the supporting runs for common formatting patterns and consider adding targeted parsing rules.`;
    } else if (f.failure_code === 'confidence_misalignment') {
      recType = 'confidence_threshold_adjustment';
      complexity = 'low';
      title = `Calibrate confidence scoring — high-confidence incorrect results (${f.count} runs)`;
      text = `${f.count} runs were flagged with high diagnostics confidence but material parse deviations. ` +
        `This indicates the confidence model is not detecting structural errors in otherwise clean documents. ` +
        `Consider adding new anomaly signals for this pattern type to the diagnostics confidence scorer.`;
    } else if (f.failure_code === 'duplicate_line_extraction') {
      recType = 'parser_rule_candidate';
      complexity = 'low';
      title = `Add deduplication guard for duplicate line extraction (${f.count} occurrences)`;
      text = `The duplicate_line_extraction failure has occurred ${f.count} times. ` +
        `This typically means a subtotal or repeated value is being included alongside component line items. ` +
        `A targeted exclusion rule for this pattern class could eliminate the issue with low implementation effort.`;
    } else {
      recType = 'parser_rule_candidate';
      complexity = 'medium';
      title = `Address recurring failure: ${f.failure_code} (${f.count} runs)`;
      text = `The failure code '${f.failure_code}' has appeared ${f.count} times across shadow runs for module '${moduleKey}'. ` +
        `Reviewing the ${f.run_ids.slice(0, 5).length} supporting runs may reveal a consistent source document pattern ` +
        `that can be addressed with a targeted rule addition.`;
    }

    const impactScore = computeImpactScore(
      f.count,
      avgImpact,
      affectedFamilies.length,
      adjudications.totalCount,
    );

    recs.push({
      module_key: moduleKey,
      title,
      recommendation_type: recType,
      target_failure_code: f.failure_code,
      target_supplier_family: affectedFamilies[0]?.template_family_id ?? null,
      evidence_count: f.count,
      expected_impact_score: impactScore,
      implementation_complexity: complexity,
      recommendation_text: text,
      supporting_run_ids_json: f.run_ids.slice(0, 20),
    });
  }

  const lowAccuracyFamilies = fingerprints.filter(
    (fp) => fp.run_count >= 3 && fp.historical_accuracy < 0.70,
  );
  for (const fp of lowAccuracyFamilies.slice(0, 3)) {
    const label = fp.supplier_name_normalized ?? fp.template_family_id;
    recs.push({
      module_key: moduleKey,
      title: `Add supplier-specific rule for low-accuracy family: ${label}`,
      recommendation_type: 'supplier_template_rule',
      target_failure_code: fp.common_failure_modes[0] ?? null,
      target_supplier_family: fp.template_family_id,
      evidence_count: fp.run_count,
      expected_impact_score: computeImpactScore(fp.run_count, 0, 1, 0),
      implementation_complexity: 'medium',
      recommendation_text: `The supplier/template family '${label}' has ${fp.run_count} runs with an average parse accuracy of ${(fp.historical_accuracy * 100).toFixed(1)}%. ` +
        `This consistently under-performing family likely requires a supplier-specific parsing rule or section pattern override. ` +
        `Common failure modes include: ${fp.common_failure_modes.slice(0, 3).join(', ') || 'none recorded yet'}.`,
      supporting_run_ids_json: [],
    });
  }

  const topRootCause = Array.from(adjudications.byRootCause.entries())
    .sort((a, b) => b[1] - a[1])[0];

  if (topRootCause && topRootCause[1] >= 2) {
    recs.push({
      module_key: moduleKey,
      title: `Human corrections point to recurring root cause: ${topRootCause[0]}`,
      recommendation_type: 'parser_rule_candidate',
      target_failure_code: null,
      target_supplier_family: null,
      evidence_count: topRootCause[1],
      expected_impact_score: computeImpactScore(topRootCause[1], 0, 0, adjudications.totalCount),
      implementation_complexity: 'medium',
      recommendation_text: `Human adjudication events have identified '${topRootCause[0]}' as the root cause in ${topRootCause[1]} corrections. ` +
        `This recurring pattern in human reviews is a strong signal for a targeted parser improvement. ` +
        `Review the adjudication events for this module to understand the specific document structures involved.`,
      supporting_run_ids_json: [],
    });
  }

  return recs;
}

export async function generateRecommendations(moduleKey: string): Promise<ImprovementRecommendation[]> {
  const [failures, fingerprints, adjudications] = await Promise.all([
    aggregateFailures(moduleKey),
    aggregateFingerprints(),
    aggregateAdjudications(moduleKey),
  ]);

  const recs = buildRecommendations(moduleKey, failures, fingerprints, adjudications);
  if (recs.length === 0) return [];

  const saved: ImprovementRecommendation[] = [];

  for (const rec of recs) {
    // Look up existing recommendation by module_key + target_failure_code
    // to prevent duplicate rows on repeated generate() calls.
    const existingQuery = supabase
      .from('improvement_recommendations')
      .select('id, status')
      .eq('module_key', rec.module_key);

    const { data: existing } = rec.target_failure_code != null
      ? await existingQuery.eq('target_failure_code', rec.target_failure_code).maybeSingle()
      : await existingQuery.is('target_failure_code', null).maybeSingle();

    if (existing) {
      const { data, error } = await supabase
        .from('improvement_recommendations')
        .update({
          title: rec.title,
          evidence_count: rec.evidence_count,
          expected_impact_score: rec.expected_impact_score,
          recommendation_text: rec.recommendation_text,
          supporting_run_ids_json: rec.supporting_run_ids_json,
          target_supplier_family: rec.target_supplier_family,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select('*')
        .single();

      if (!error && data) {
        saved.push(data as ImprovementRecommendation);
      } else if (error && import.meta.env.DEV) {
        console.warn('[recommendationEngine] update failed:', error.message);
      }
    } else {
      const { data, error } = await supabase
        .from('improvement_recommendations')
        .insert({ ...rec, status: 'open' })
        .select('*')
        .single();

      if (!error && data) {
        saved.push(data as ImprovementRecommendation);
      } else if (error && import.meta.env.DEV) {
        console.warn('[recommendationEngine] insert failed:', error.message);
      }
    }
  }

  return saved;
}

export async function getRecommendations(
  moduleKey?: string,
  status?: RecommendationStatus,
  limit = 100,
): Promise<ImprovementRecommendation[]> {
  let query = supabase
    .from('improvement_recommendations')
    .select('*')
    .order('expected_impact_score', { ascending: false })
    .limit(limit);

  if (moduleKey) query = query.eq('module_key', moduleKey);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw new Error(`[recommendationEngine] getRecommendations failed: ${error.message}`);
  return (data ?? []) as ImprovementRecommendation[];
}

export async function updateRecommendationStatus(
  id: string,
  status: RecommendationStatus,
): Promise<void> {
  const { error } = await supabase
    .from('improvement_recommendations')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw new Error(`[recommendationEngine] updateRecommendationStatus failed: ${error.message}`);
}

export const RECOMMENDATION_TYPE_LABELS: Record<RecommendationType, string> = {
  parser_rule_candidate: 'Parser Rule Candidate',
  anchor_pattern_candidate: 'Anchor Pattern Candidate',
  supplier_template_rule: 'Supplier Template Rule',
  review_workflow_improvement: 'Review Workflow Improvement',
  benchmark_gap: 'Benchmark Gap',
  confidence_threshold_adjustment: 'Confidence Threshold Adjustment',
  diagnostics_enhancement: 'Diagnostics Enhancement',
};

export const COMPLEXITY_LABELS: Record<ImplementationComplexity, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

export const STATUS_LABELS: Record<RecommendationStatus, string> = {
  open: 'Open',
  accepted: 'Accepted',
  deferred: 'Deferred',
  rejected: 'Rejected',
  implemented: 'Implemented',
};
