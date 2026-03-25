import type { OptimizationRun, OptimizationRanking, OptimizationBundle } from './optimizationTypes';
import { scoreBundle, deriveRecommendationLevel, deriveRiskLevel } from './scoreBundle';

interface BundleRunPair {
  bundle: OptimizationBundle;
  run: OptimizationRun;
}

export function rankBundles(pairs: BundleRunPair[]): Omit<OptimizationRanking, 'id' | 'created_at'>[] {
  const scored = pairs.map(({ bundle, run }) => {
    const { overallScore, components } = scoreBundle(run);
    return { bundle, run, overallScore, components };
  });

  scored.sort((a, b) => b.overallScore - a.overallScore);

  return scored.map(({ bundle, run, overallScore, components }, index) => ({
    module_key: 'plumbing_parser',
    bundle_id: bundle.id,
    run_id: run.id,
    rank_score: overallScore,
    rank_position: index + 1,
    recommendation_level: deriveRecommendationLevel(overallScore, run.safety_guard_triggered),
    risk_level: deriveRiskLevel(run),
    component_scores_json: components,
    promoted_to_shadow: false,
    promoted_to_release: false,
  }));
}

export function filterSafeRankings(rankings: Omit<OptimizationRanking, 'id' | 'created_at'>[]): Omit<OptimizationRanking, 'id' | 'created_at'>[] {
  return rankings.filter((r) => r.risk_level !== 'high');
}
