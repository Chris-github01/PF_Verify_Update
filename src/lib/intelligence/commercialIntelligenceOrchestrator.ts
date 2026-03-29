import { supabase } from '../supabase';
import { classifyItems } from './scopeClassifier';
import { aggregateSupplierScope } from './scopeAggregator';
import { evaluateDecisionGate, persistGateResult } from './decisionGatingService';
import {
  fetchBehaviourProfile,
  fetchRecentBehaviourEvents,
  persistTenderSnapshot,
  persistBehaviourEvents,
  upsertBehaviourProfile,
  deriveBehaviourEvents,
} from './behaviourService';
import type {
  CommercialIntelligencePayload,
  SupplierIntelligenceView,
  SupplierScopeSummary,
  DecisionGateResult,
  BehaviourProfile,
  BehaviourEvent,
} from './types';

async function persistScopeSummary(summary: SupplierScopeSummary): Promise<void> {
  try {
    const row = {
      project_id: summary.projectId,
      quote_id: summary.quoteId,
      organisation_id: summary.organisationId,
      supplier_name: summary.supplierName,
      core_scope_coverage_pct: summary.coreScope.coveragePct,
      secondary_scope_coverage_pct: summary.secondaryScope.coveragePct,
      excluded_scope_count: summary.excludedScopeCount,
      risk_scope_count: summary.riskScopeCount,
      optional_scope_count: summary.optionalScopeCount,
      unknown_scope_count: summary.unknownScopeCount,
      summary_only_count: summary.summaryOnlyCount,
      total_classified_items: summary.totalClassifiedItems,
      scope_confidence_score: summary.scopeConfidenceScore,
      likely_variation_exposure_score: summary.likelyVariationExposureScore,
      scope_summary_text: summary.scopeSummaryText,
      classification_version: summary.classificationVersion,
      computed_at: summary.computedAt,
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await supabase
      .from('ci_supplier_scope_summaries')
      .select('id')
      .eq('quote_id', summary.quoteId)
      .maybeSingle();

    let error;
    if (existing?.id) {
      ({ error } = await supabase
        .from('ci_supplier_scope_summaries')
        .update(row)
        .eq('id', existing.id));
    } else {
      ({ error } = await supabase
        .from('ci_supplier_scope_summaries')
        .insert(row));
    }

    if (error) console.warn('[Orchestrator] persistScopeSummary failed:', error.message);
  } catch (err) {
    console.warn('[Orchestrator] persistScopeSummary error:', err);
  }
}

async function fetchExistingScopeSummary(
  quoteId: string,
): Promise<SupplierScopeSummary | null> {
  try {
    const { data, error } = await supabase
      .from('ci_supplier_scope_summaries')
      .select('*')
      .eq('quote_id', quoteId)
      .maybeSingle();

    if (error || !data) return null;

    return {
      projectId: data.project_id,
      quoteId: data.quote_id,
      organisationId: data.organisation_id,
      supplierName: data.supplier_name,
      submittedTotal: null,
      normalisedTotal: null,
      coreScope: {
        coveragePct: data.core_scope_coverage_pct,
        itemCount: 0,
        weightedValue: 0,
      },
      secondaryScope: {
        coveragePct: data.secondary_scope_coverage_pct,
        itemCount: 0,
      },
      excludedScopeCount: data.excluded_scope_count,
      riskScopeCount: data.risk_scope_count,
      optionalScopeCount: data.optional_scope_count,
      unknownScopeCount: data.unknown_scope_count,
      summaryOnlyCount: data.summary_only_count,
      totalClassifiedItems: data.total_classified_items,
      scopeConfidenceScore: data.scope_confidence_score,
      likelyVariationExposureScore: data.likely_variation_exposure_score,
      scopeSummaryText: data.scope_summary_text,
      classificationVersion: data.classification_version,
      computedAt: data.computed_at,
    };
  } catch {
    return null;
  }
}

export async function runCommercialIntelligence(
  payload: CommercialIntelligencePayload,
): Promise<SupplierIntelligenceView[]> {
  const { projectId, organisationId, tradeType, suppliers } = payload;

  const lowestSubmittedTotal = suppliers.reduce(
    (min, s) => (s.submittedTotal !== null && (min === null || s.submittedTotal < min) ? s.submittedTotal : min),
    null as number | null,
  );

  const results: SupplierIntelligenceView[] = [];

  for (const supplier of suppliers) {
    const { supplierName, quoteId, submittedTotal, normalisedTotal, items } = supplier;
    const isLowestPrice = lowestSubmittedTotal !== null && submittedTotal === lowestSubmittedTotal;

    let scopeSummary: SupplierScopeSummary | null = null;
    let gateResult: DecisionGateResult | null = null;
    let behaviourProfile: BehaviourProfile | null = null;

    try {
      const classifications = classifyItems(items, quoteId, projectId, organisationId, supplierName);
      scopeSummary = aggregateSupplierScope(
        classifications,
        quoteId,
        projectId,
        organisationId,
        supplierName,
        submittedTotal,
        normalisedTotal ?? null,
      );

      behaviourProfile = await fetchBehaviourProfile(organisationId, supplierName, tradeType);
      gateResult = evaluateDecisionGate(scopeSummary, behaviourProfile);

      await persistScopeSummary(scopeSummary);
      await persistGateResult(gateResult);

      const behaviourEvents: BehaviourEvent[] = deriveBehaviourEvents(scopeSummary, gateResult, organisationId, tradeType);
      await persistBehaviourEvents(behaviourEvents);

      await persistTenderSnapshot({
        organisationId,
        projectId,
        quoteId,
        supplierName,
        tradeType,
        submittedTotal,
        normalisedTotal: normalisedTotal ?? null,
        coreScopeCoveragePct: scopeSummary.coreScope.coveragePct,
        secondaryScopeCoveragePct: scopeSummary.secondaryScope.coveragePct,
        excludedScopeCount: scopeSummary.excludedScopeCount,
        riskScopeCount: scopeSummary.riskScopeCount,
        unknownScopeCount: scopeSummary.unknownScopeCount,
        scopeConfidenceScore: scopeSummary.scopeConfidenceScore,
        likelyVariationExposureScore: scopeSummary.likelyVariationExposureScore,
        decisionGateStatus: gateResult.gateStatus,
        gateReasons: gateResult.gateReasons.map((r) => r.message),
        wasRecommended: false,
        wasLowestPrice: isLowestPrice,
      });

      await upsertBehaviourProfile(organisationId, supplierName, tradeType);
      behaviourProfile = await fetchBehaviourProfile(organisationId, supplierName, tradeType);
    } catch (err) {
      console.warn(`[Orchestrator] Analysis failed for ${supplierName}:`, err);
    }

    results.push({
      supplierName,
      quoteId,
      submittedTotal,
      normalisedTotal: normalisedTotal ?? null,
      scopeSummary,
      behaviourProfile,
      gateResult,
      isLowestPrice,
      isCheapestButGated: isLowestPrice && (gateResult?.gateStatus === 'fail' || gateResult?.gateStatus === 'warn'),
    });
  }

  return results;
}

export async function fetchIntelligenceViews(
  projectId: string,
  organisationId: string,
  tradeType: string,
  quotes: Array<{ id: string; supplierName: string; submittedTotal: number | null }>,
): Promise<SupplierIntelligenceView[]> {
  const results: SupplierIntelligenceView[] = [];

  const lowestSubmittedTotal = quotes.reduce(
    (min, q) => (q.submittedTotal !== null && (min === null || q.submittedTotal < min) ? q.submittedTotal : min),
    null as number | null,
  );

  for (const quote of quotes) {
    const [scopeSummary, gateResult, behaviourProfile] = await Promise.all([
      fetchExistingScopeSummary(quote.id),
      (async () => {
        try {
          const { data } = await supabase
            .from('ci_decision_gate_results')
            .select('*')
            .eq('project_id', projectId)
            .eq('quote_id', quote.id)
            .maybeSingle();
          if (!data) return null;
          return {
            supplierName: data.supplier_name,
            quoteId: data.quote_id,
            projectId: data.project_id,
            organisationId: data.organisation_id,
            gateStatus: data.gate_status,
            gateReasons: data.gate_reasons ?? [],
            gateSummary: data.gate_summary,
            canBeRecommended: data.can_be_recommended,
            canBeBestTenderer: data.can_be_best_tenderer,
            overrideRequired: data.override_required,
            evaluatedAt: data.evaluated_at,
          } as DecisionGateResult;
        } catch { return null; }
      })(),
      fetchBehaviourProfile(organisationId, quote.supplierName, tradeType),
    ]);

    const isLowestPrice = lowestSubmittedTotal !== null && quote.submittedTotal === lowestSubmittedTotal;

    results.push({
      supplierName: quote.supplierName,
      quoteId: quote.id,
      submittedTotal: quote.submittedTotal,
      normalisedTotal: null,
      scopeSummary,
      behaviourProfile,
      gateResult,
      isLowestPrice,
      isCheapestButGated: isLowestPrice && (gateResult?.gateStatus === 'fail' || gateResult?.gateStatus === 'warn'),
    });
  }

  return results;
}
