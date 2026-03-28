import { supabase } from '../../supabase';
import type {
  CdeDecisionState,
  CdeRankedSupplier,
  DecisionBasis,
  GatingResult,
  RecommendationStatus,
} from './types';

export function buildDecisionState(
  projectId: string,
  runId: string,
  ranked: CdeRankedSupplier[],
  justification: string,
  gating: GatingResult,
  basis: DecisionBasis = 'weighted_score'
): CdeDecisionState {
  const top = ranked[0] ?? null;
  const runnerUp = ranked[1] ?? null;

  const overallConfidence = top
    ? Math.min(1, top.compositeScore * (ranked.length >= 3 ? 1.0 : 0.85))
    : 0;

  let recommendationStatus: RecommendationStatus;
  let recommendedSupplier: string | null = null;
  let runnerUpSupplier: string | null = runnerUp?.supplierName ?? null;

  if (!top || ranked.length === 0) {
    recommendationStatus = 'no_recommendation';
  } else if (!gating.passed) {
    recommendationStatus = 'provisional';
    recommendedSupplier = top.supplierName;
  } else if (gating.isNarrowMargin) {
    recommendationStatus = 'narrow_margin';
    recommendedSupplier = top.supplierName;
  } else {
    recommendationStatus = 'recommended';
    recommendedSupplier = top.supplierName;
  }

  return {
    projectId,
    runId,
    suppliers: ranked,
    recommendedSupplier,
    runnerUpSupplier,
    recommendationStatus,
    decisionBasis: basis,
    overallConfidence: Math.round(overallConfidence * 100) / 100,
    justification,
    gating,
    generatedAt: new Date().toISOString(),
  };
}

export async function saveDecisionSnapshot(state: CdeDecisionState): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  const userId = session?.session?.user?.id ?? null;

  await supabase.from('cde_decision_snapshots').insert({
    project_id: state.projectId,
    run_id: state.runId,
    recommended_supplier: state.recommendedSupplier,
    runner_up_supplier: state.runnerUpSupplier,
    decision_basis: state.decisionBasis,
    overall_confidence: state.overallConfidence,
    ranked_suppliers: state.suppliers,
    decision_state: state,
    justification: state.justification,
    created_by: userId,
  });
}

export async function loadLatestDecisionSnapshot(
  projectId: string
): Promise<CdeDecisionState | null> {
  const { data } = await supabase
    .from('cde_decision_snapshots')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  const state = data.decision_state as CdeDecisionState;
  if (!state.recommendationStatus) {
    state.recommendationStatus = 'provisional';
  }
  if (!state.gating) {
    state.gating = {
      passed: false,
      failedGates: ['Legacy snapshot — gating data unavailable'],
      scopeCoverageScore: 0,
      variationResistanceScore: 0,
      confidence: state.overallConfidence ?? 0,
      isNarrowMargin: false,
    };
  }
  return state;
}

export async function loadDecisionHistory(
  projectId: string,
  limit = 10
): Promise<CdeDecisionState[]> {
  const { data } = await supabase
    .from('cde_decision_snapshots')
    .select('decision_state, created_at, run_id')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => {
    const state = row.decision_state as CdeDecisionState;
    if (!state.recommendationStatus) state.recommendationStatus = 'provisional';
    if (!state.gating) {
      state.gating = {
        passed: false,
        failedGates: ['Legacy snapshot'],
        scopeCoverageScore: 0,
        variationResistanceScore: 0,
        confidence: state.overallConfidence ?? 0,
        isNarrowMargin: false,
      };
    }
    return state;
  });
}
