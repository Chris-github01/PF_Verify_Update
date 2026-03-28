import { supabase } from '../../supabase';
import type { CdeDecisionState, CdeRankedSupplier, DecisionBasis } from './types';

export function buildDecisionState(
  projectId: string,
  runId: string,
  ranked: CdeRankedSupplier[],
  justification: string,
  basis: DecisionBasis = 'weighted_score'
): CdeDecisionState {
  const top = ranked[0] ?? null;
  const runnerUp = ranked[1] ?? null;

  const overallConfidence = top
    ? Math.min(1, top.compositeScore * (ranked.length >= 3 ? 1.0 : 0.85))
    : 0;

  return {
    projectId,
    runId,
    suppliers: ranked,
    recommendedSupplier: top?.supplierName ?? null,
    runnerUpSupplier: runnerUp?.supplierName ?? null,
    decisionBasis: basis,
    overallConfidence: Math.round(overallConfidence * 100) / 100,
    justification,
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

  return data.decision_state as CdeDecisionState;
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

  return (data ?? []).map((row) => row.decision_state as CdeDecisionState);
}
