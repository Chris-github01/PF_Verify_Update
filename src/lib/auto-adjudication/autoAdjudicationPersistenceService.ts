import { supabase } from '../supabase';
import type { AutoAdjudicationResult } from './autoAdjudicationTypes';

export async function persistAdjudicationRun(
  projectId: string,
  trade: string,
  result: AutoAdjudicationResult,
  runByUserId?: string
): Promise<string | null> {
  try {
    const eligibleCount = result.supplier_rankings.filter(r => r.recommendation_eligible).length;

    const { data: run, error: runError } = await supabase
      .from('adjudication_decision_runs')
      .insert({
        project_id: projectId,
        trade,
        final_outcome: result.final_outcome,
        recommended_supplier_id: result.recommended_supplier_id,
        recommended_supplier_name: result.recommended_supplier_name,
        cheapest_supplier_id: result.cheapest_supplier_id,
        cheapest_supplier_name: result.cheapest_supplier_name,
        recommendation_confidence_score: result.recommendation_confidence_score,
        recommendation_summary: result.recommendation_summary,
        adjudication_mode: result.adjudication_mode,
        config_version: result.config_version,
        supplier_count: result.supplier_rankings.length,
        eligible_supplier_count: eligibleCount,
        result_json: result,
        run_by_user_id: runByUserId ?? null,
      })
      .select('id')
      .maybeSingle();

    if (runError || !run) {
      console.warn('[AutoAdjudication] Failed to persist decision run:', runError?.message);
      return null;
    }

    const runId = run.id as string;

    const rankingRows = result.supplier_rankings.map(r => ({
      run_id: runId,
      project_id: projectId,
      supplier_id: r.supplier_id,
      supplier_name: r.supplier_name,
      submitted_total: r.submitted_total,
      normalised_total: r.normalised_total,
      gate_status: r.gate_status,
      overall_score: r.overall_score,
      price_position_score: r.price_position_score,
      scope_strength_score: r.scope_strength_score,
      validation_integrity_score: r.validation_integrity_score,
      behaviour_trust_score: r.behaviour_trust_score,
      variation_risk_score: r.variation_risk_score,
      recommendation_eligible: r.recommendation_eligible,
      rank_position: r.rank_position,
      ranking_summary: r.ranking_summary,
      ranking_reasons: r.ranking_reasons,
      ranking_warnings: r.ranking_warnings,
    }));

    if (rankingRows.length > 0) {
      const { error: rankError } = await supabase
        .from('adjudication_supplier_rankings')
        .insert(rankingRows);
      if (rankError) {
        console.warn('[AutoAdjudication] Failed to persist supplier rankings:', rankError.message);
      }
    }

    const reasonRows: { run_id: string; reason_type: string; reason_text: string; supplier_id: string | null }[] = [];

    result.recommendation_reasons.forEach(r => {
      reasonRows.push({ run_id: runId, reason_type: 'recommendation', reason_text: r, supplier_id: result.recommended_supplier_id });
    });
    result.warning_reasons.forEach(r => {
      reasonRows.push({ run_id: runId, reason_type: 'warning', reason_text: r, supplier_id: null });
    });
    result.block_reasons.forEach(r => {
      reasonRows.push({ run_id: runId, reason_type: 'block', reason_text: r, supplier_id: null });
    });
    result.manual_review_reasons.forEach(r => {
      reasonRows.push({ run_id: runId, reason_type: 'manual_review', reason_text: r, supplier_id: null });
    });

    if (reasonRows.length > 0) {
      const { error: reasonError } = await supabase
        .from('adjudication_decision_reasons')
        .insert(reasonRows);
      if (reasonError) {
        console.warn('[AutoAdjudication] Failed to persist decision reasons:', reasonError.message);
      }
    }

    return runId;
  } catch (err) {
    console.warn('[AutoAdjudication] Persistence failed gracefully:', err);
    return null;
  }
}

export async function fetchLatestAdjudicationRun(
  projectId: string,
  trade: string
): Promise<AutoAdjudicationResult | null> {
  try {
    const { data, error } = await supabase
      .from('adjudication_decision_runs')
      .select('result_json')
      .eq('project_id', projectId)
      .eq('trade', trade)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    return data.result_json as AutoAdjudicationResult;
  } catch {
    return null;
  }
}
