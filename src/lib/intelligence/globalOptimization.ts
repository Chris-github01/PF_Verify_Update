import { supabase } from '../supabase';
import { emitEvent } from './eventBus';
import { getModulesWithCapability } from '../modules/tradeRegistry';

export interface CrossModuleOptimizationCandidate {
  id?: string;
  source_module: string;
  applicable_modules: string[];
  description: string;
  rule_pattern_key: string;
  rule_changes_json: Record<string, unknown>;
  rationale: string;
  confidence_score: number;
  created_at?: string;
}

export function buildCrossModuleCandidates(
  sourceModuleKey: string,
  patternKey: string,
  description: string,
  ruleChangesJson: Record<string, unknown>,
  confidence: number
): CrossModuleOptimizationCandidate[] {
  const intelligenceModules = getModulesWithCapability('optimization').map((m) => m.module_key);
  const targets = intelligenceModules.filter((k) => k !== sourceModuleKey && k !== 'passive_fire_parser');

  if (targets.length === 0) return [];

  return [{
    source_module: sourceModuleKey,
    applicable_modules: targets,
    description: `[Cross-module] ${description}`,
    rule_pattern_key: patternKey,
    rule_changes_json: ruleChangesJson,
    rationale: `Pattern '${patternKey}' identified in '${sourceModuleKey}' — may apply to: ${targets.join(', ')}`,
    confidence_score: confidence * 0.8,
  }];
}

export async function emitOptimizationRunEvent(
  moduleKey: string,
  bundleId: string,
  overallScore: number,
  regressionDelta: number
): Promise<void> {
  await emitEvent({
    source_module: moduleKey,
    event_type: 'optimization_run',
    severity: overallScore < 40 ? 'warning' : 'info',
    payload_json: { bundleId, overallScore, regressionDelta },
    related_module_keys: [moduleKey],
  });
}

export async function getGlobalOptimizationStats(): Promise<{
  totalCandidates: number;
  totalBundles: number;
  totalRuns: number;
  avgScore: number;
  strongRecommendations: number;
}> {
  const [candidatesRes, bundlesRes, runsRes, rankingsRes] = await Promise.all([
    supabase.from('parser_optimization_candidates').select('id', { count: 'exact', head: true }),
    supabase.from('parser_optimization_bundles').select('id', { count: 'exact', head: true }),
    supabase.from('parser_optimization_runs').select('overall_score'),
    supabase.from('parser_optimization_rankings').select('recommendation_level').eq('recommendation_level', 'strong'),
  ]);

  const runs = (runsRes.data ?? []) as Array<{ overall_score: number }>;
  const avgScore = runs.length > 0 ? Math.round(runs.reduce((s, r) => s + r.overall_score, 0) / runs.length) : 0;

  return {
    totalCandidates: candidatesRes.count ?? 0,
    totalBundles: bundlesRes.count ?? 0,
    totalRuns: runs.length,
    avgScore,
    strongRecommendations: (rankingsRes.data ?? []).length,
  };
}
