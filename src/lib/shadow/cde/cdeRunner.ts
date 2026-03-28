import { supabase } from '../../supabase';
import { buildSupplierProfiles, saveSupplierProfiles } from './profileBuilder';
import { classifyBehaviours, saveBehaviourAnalysis } from './behaviourClassifier';
import { calculateVariationExposures, saveVariationExposures } from './variationExposure';
import { projectCosts, saveCostProjections } from './costProjection';
import { rankSuppliers, evaluateGating } from './rankingEngine';
import { buildJustification } from './explanationBuilder';
import { buildDecisionState, saveDecisionSnapshot } from './decisionState';
import type { CdeDecisionState, CdeWeights, GatingThresholds } from './types';
import { DEFAULT_GATING_THRESHOLDS } from './types';

function generateRunId(projectId: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `cde_${projectId.slice(0, 8)}_${ts}_${rand}`;
}

export interface CdeRunOptions {
  weights?: CdeWeights;
  gatingThresholds?: GatingThresholds;
  saveResults?: boolean;
}

export async function runCde(
  projectId: string,
  options: CdeRunOptions = {}
): Promise<CdeDecisionState> {
  const { weights, gatingThresholds = DEFAULT_GATING_THRESHOLDS, saveResults = true } = options;
  const runId = generateRunId(projectId);

  const { data: quotes, error } = await supabase
    .from('quotes')
    .select('id, supplier_name, total_amount, items_count')
    .eq('project_id', projectId)
    .eq('is_latest', true)
    .neq('status', 'rejected');

  if (error || !quotes || quotes.length === 0) {
    throw new Error('No quotes found for this project. Import supplier quotes before running CDE.');
  }

  const profiles = await buildSupplierProfiles(projectId, quotes);
  const behaviours = classifyBehaviours(profiles);
  const exposures = calculateVariationExposures(profiles);
  const projections = projectCosts(profiles, exposures);
  const ranked = rankSuppliers(profiles, behaviours, exposures, projections, weights);

  const topConfidence = ranked[0]
    ? Math.min(1, ranked[0].compositeScore * (ranked.length >= 3 ? 1.0 : 0.85))
    : 0;

  const gating = evaluateGating(ranked, topConfidence, gatingThresholds);
  const justification = buildJustification(ranked, behaviours, exposures, gating);
  const state = buildDecisionState(projectId, runId, ranked, justification, gating);

  if (saveResults) {
    await Promise.all([
      saveSupplierProfiles(profiles),
      saveBehaviourAnalysis(behaviours),
      saveVariationExposures(exposures),
      saveCostProjections(projections),
      saveDecisionSnapshot(state),
    ]);
  }

  return state;
}
