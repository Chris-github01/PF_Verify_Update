import { supabase } from '../supabase';
import { VARIATION_RISK_CONFIG_VERSION } from './variationRiskConfig';
import type { VariationRiskRunResult, SupplierVariationRiskResult } from './variationRiskTypes';

export async function persistVariationRiskRun(
  result: VariationRiskRunResult
): Promise<string | null> {
  try {
    const { data: runRow, error: runError } = await supabase
      .from('variation_risk_runs')
      .insert({
        project_id: result.project_id,
        trade: result.trade,
        config_version: VARIATION_RISK_CONFIG_VERSION,
        overall_data_quality: result.overall_data_quality,
        recommendation_changed: result.comparison.recommendation_changed_after_risk_adjustment,
        cheapest_submitted_supplier: result.comparison.cheapest_submitted_supplier_name,
        cheapest_risk_adjusted_supplier: result.comparison.cheapest_risk_adjusted_supplier_name,
        executive_summary: result.comparison.executive_variation_risk_summary,
        result_json: result as unknown as Record<string, unknown>,
        generated_at: result.generated_at,
        run_by_user_id: result.run_by_user_id ?? null,
      })
      .select('id')
      .single();

    if (runError || !runRow) {
      console.warn('[VariationRisk] Failed to persist run:', runError?.message);
      return null;
    }

    const runId: string = runRow.id;

    const supplierRows = result.supplier_results.map((s: SupplierVariationRiskResult) => ({
      run_id: runId,
      project_id: result.project_id,
      supplier_id: s.supplier_id,
      supplier_name: s.supplier_name,
      submitted_total: s.submitted_total,
      normalised_total: s.normalised_total,
      variation_risk_score: s.variation_risk_score,
      variation_risk_level: s.variation_risk_level,
      predicted_exposure_percent: s.predicted_variation_exposure_percent,
      predicted_exposure_value: s.predicted_variation_exposure_value,
      risk_adjusted_tender_value: s.risk_adjusted_tender_value,
      confidence_score: s.confidence_score,
      data_quality: s.data_quality,
      submitted_rank: s.submitted_rank,
      risk_adjusted_rank: s.risk_adjusted_rank,
      rank_changed: s.rank_changed,
      risk_summary: s.risk_summary,
      driver_summary: s.driver_summary,
      exposure_summary: s.exposure_summary,
      adjusted_position_summary: s.adjusted_position_summary,
    }));

    const { error: suppliersError } = await supabase
      .from('variation_risk_supplier_results')
      .insert(supplierRows);

    if (suppliersError) {
      console.warn('[VariationRisk] Failed to persist supplier results:', suppliersError.message);
    }

    const driverRows = result.supplier_results.flatMap((s: SupplierVariationRiskResult) =>
      s.main_risk_drivers.map((d) => ({
        run_id: runId,
        supplier_id: s.supplier_id,
        supplier_name: s.supplier_name,
        category: d.category,
        score: d.score,
        weight: d.weight,
        weighted_contribution: d.weighted_contribution,
        severity: d.severity,
        reason: d.reason,
        confidence_contribution: d.confidence_contribution,
      }))
    );

    if (driverRows.length > 0) {
      const { error: driversError } = await supabase
        .from('variation_risk_driver_events')
        .insert(driverRows);

      if (driversError) {
        console.warn('[VariationRisk] Failed to persist driver events:', driversError.message);
      }
    }

    return runId;
  } catch (err) {
    console.warn('[VariationRisk] Unexpected persistence error:', err);
    return null;
  }
}

export async function fetchLatestVariationRiskRun(
  projectId: string,
  trade: string
): Promise<VariationRiskRunResult | null> {
  try {
    const { data, error } = await supabase
      .from('variation_risk_runs')
      .select('result_json, generated_at')
      .eq('project_id', projectId)
      .eq('trade', trade)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    return data.result_json as unknown as VariationRiskRunResult;
  } catch {
    return null;
  }
}
