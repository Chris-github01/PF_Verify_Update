import { supabase } from '../supabase';
import type {
  OptimizationCandidate,
  OptimizationBundle,
  OptimizationRun,
  OptimizationRanking,
  BundleWithRun,
} from '../modules/parsers/plumbing/optimization/optimizationTypes';
import { runOptimizationSimulation } from '../modules/parsers/plumbing/optimization/runOptimization';
import { scoreBundle, deriveRecommendationLevel, deriveRiskLevel } from '../modules/parsers/plumbing/optimization/scoreBundle';
import { generateAllBundles } from '../modules/parsers/plumbing/optimization/generateBundles';
import { rankBundles } from '../modules/parsers/plumbing/optimization/rankBundles';

const MODULE = 'plumbing_parser';

// ─── Candidates ───────────────────────────────────────────────────────────────

export async function dbCreateCandidate(
  candidate: Omit<OptimizationCandidate, 'id' | 'created_at'>
): Promise<OptimizationCandidate> {
  const { data, error } = await supabase
    .from('parser_optimization_candidates')
    .insert(candidate)
    .select()
    .single();
  if (error) throw error;
  return data as OptimizationCandidate;
}

export async function dbGetCandidates(opts: { status?: string; source?: string; limit?: number } = {}): Promise<OptimizationCandidate[]> {
  let q = supabase
    .from('parser_optimization_candidates')
    .select('*')
    .eq('module_key', MODULE)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 200);

  if (opts.status) q = q.eq('status', opts.status);
  if (opts.source) q = q.eq('source', opts.source);

  const { data } = await q;
  return (data ?? []) as OptimizationCandidate[];
}

export async function dbUpdateCandidateStatus(id: string, status: OptimizationCandidate['status'], reason?: string): Promise<void> {
  await supabase
    .from('parser_optimization_candidates')
    .update({ status, ...(reason ? { rejection_reason: reason } : {}) })
    .eq('id', id);
}

// ─── Bundles ──────────────────────────────────────────────────────────────────

export async function dbCreateBundle(
  bundle: Omit<OptimizationBundle, 'id' | 'created_at'>
): Promise<OptimizationBundle> {
  const { data, error } = await supabase
    .from('parser_optimization_bundles')
    .insert(bundle)
    .select()
    .single();
  if (error) throw error;
  return data as OptimizationBundle;
}

export async function dbGetBundles(opts: { status?: string; limit?: number } = {}): Promise<OptimizationBundle[]> {
  let q = supabase
    .from('parser_optimization_bundles')
    .select('*')
    .eq('module_key', MODULE)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 100);

  if (opts.status) q = q.eq('status', opts.status);
  const { data } = await q;
  return (data ?? []) as OptimizationBundle[];
}

export async function dbUpdateBundleStatus(id: string, status: OptimizationBundle['status']): Promise<void> {
  await supabase
    .from('parser_optimization_bundles')
    .update({ status })
    .eq('id', id);
}

// ─── Runs ─────────────────────────────────────────────────────────────────────

export async function dbCreateRun(
  run: Omit<OptimizationRun, 'id' | 'created_at'>
): Promise<OptimizationRun> {
  const { data, error } = await supabase
    .from('parser_optimization_runs')
    .insert(run)
    .select()
    .single();
  if (error) throw error;
  return data as OptimizationRun;
}

export async function dbGetRuns(opts: { bundleId?: string; limit?: number } = {}): Promise<OptimizationRun[]> {
  let q = supabase
    .from('parser_optimization_runs')
    .select('*')
    .eq('module_key', MODULE)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 100);

  if (opts.bundleId) q = q.eq('bundle_id', opts.bundleId);
  const { data } = await q;
  return (data ?? []) as OptimizationRun[];
}

export async function dbGetRunForBundle(bundleId: string): Promise<OptimizationRun | null> {
  const { data } = await supabase
    .from('parser_optimization_runs')
    .select('*')
    .eq('bundle_id', bundleId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as OptimizationRun | null;
}

// ─── Rankings ─────────────────────────────────────────────────────────────────

export async function dbCreateRanking(
  ranking: Omit<OptimizationRanking, 'id' | 'created_at'>
): Promise<OptimizationRanking> {
  const { data, error } = await supabase
    .from('parser_optimization_rankings')
    .insert(ranking)
    .select()
    .single();
  if (error) throw error;
  return data as OptimizationRanking;
}

export async function dbGetRankings(opts: { limit?: number } = {}): Promise<OptimizationRanking[]> {
  const { data } = await supabase
    .from('parser_optimization_rankings')
    .select('*')
    .eq('module_key', MODULE)
    .order('rank_position', { ascending: true })
    .limit(opts.limit ?? 50);
  return (data ?? []) as OptimizationRanking[];
}

export async function dbGetRankingForBundle(bundleId: string): Promise<OptimizationRanking | null> {
  const { data } = await supabase
    .from('parser_optimization_rankings')
    .select('*')
    .eq('bundle_id', bundleId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as OptimizationRanking | null;
}

export async function dbUpdateRankingPromotion(
  id: string,
  field: 'promoted_to_shadow' | 'promoted_to_release'
): Promise<void> {
  await supabase.from('parser_optimization_rankings').update({ [field]: true }).eq('id', id);
}

// ─── Orchestrated operations ──────────────────────────────────────────────────

export async function dbGenerateAndSaveBundles(candidates: OptimizationCandidate[]): Promise<OptimizationBundle[]> {
  const bundlePayloads = generateAllBundles(candidates);
  const saved: OptimizationBundle[] = [];
  for (const payload of bundlePayloads) {
    const bundle = await dbCreateBundle(payload);
    saved.push(bundle);
    for (const cid of bundle.candidate_ids) {
      await dbUpdateCandidateStatus(cid, 'bundled');
    }
  }
  return saved;
}

export async function dbRunAndScoreBundle(
  bundle: OptimizationBundle,
  baseline: { regressionPassRate: number; anomalyRate: number; predictiveAccuracy: number }
): Promise<{ run: OptimizationRun; ranking: OptimizationRanking }> {
  await dbUpdateBundleStatus(bundle.id, 'testing');

  const runPayload = runOptimizationSimulation(bundle, baseline);
  const { overallScore, components } = scoreBundle({ ...runPayload, id: '', created_at: '' } as OptimizationRun);

  const runWithScore: Omit<OptimizationRun, 'id' | 'created_at'> = { ...runPayload, overall_score: overallScore };
  const run = await dbCreateRun(runWithScore);

  const passed = !run.safety_guard_triggered && run.failures_introduced <= 5;
  await dbUpdateBundleStatus(bundle.id, passed ? 'passed' : 'failed');

  const ranking = await dbCreateRanking({
    module_key: MODULE,
    bundle_id: bundle.id,
    run_id: run.id,
    rank_score: overallScore,
    rank_position: 999,
    recommendation_level: deriveRecommendationLevel(overallScore, run.safety_guard_triggered),
    risk_level: deriveRiskLevel(run),
    component_scores_json: components,
    promoted_to_shadow: false,
    promoted_to_release: false,
  });

  return { run, ranking };
}

export async function dbRunFullRankingPass(
  baseline: { regressionPassRate: number; anomalyRate: number; predictiveAccuracy: number }
): Promise<OptimizationRanking[]> {
  const bundles = await dbGetBundles({ status: 'passed' });
  if (bundles.length === 0) return [];

  const pairs = [];
  for (const bundle of bundles) {
    const run = await dbGetRunForBundle(bundle.id);
    if (run) pairs.push({ bundle, run });
  }

  const rawRankings = rankBundles(pairs);
  const saved: OptimizationRanking[] = [];

  for (const r of rawRankings) {
    const existing = await dbGetRankingForBundle(r.bundle_id);
    if (existing) {
      await supabase.from('parser_optimization_rankings')
        .update({ rank_score: r.rank_score, rank_position: r.rank_position, recommendation_level: r.recommendation_level, risk_level: r.risk_level })
        .eq('id', existing.id);
      saved.push({ ...existing, ...r });
    } else {
      const created = await dbCreateRanking(r);
      saved.push(created);
    }
  }

  return saved;
}

export async function dbGetBundleWithDetails(bundleId: string): Promise<BundleWithRun | null> {
  const [bundleRes, run, ranking, candidatesAll] = await Promise.all([
    supabase.from('parser_optimization_bundles').select('*').eq('id', bundleId).maybeSingle(),
    dbGetRunForBundle(bundleId),
    dbGetRankingForBundle(bundleId),
    dbGetCandidates({ limit: 500 }),
  ]);

  const bundle = bundleRes.data as OptimizationBundle | null;
  if (!bundle) return null;

  const candidates = candidatesAll.filter((c) => bundle.candidate_ids.includes(c.id));

  return { bundle, run: run ?? undefined, ranking: ranking ?? undefined, candidates };
}

export async function dbGetAllBundlesWithDetails(): Promise<BundleWithRun[]> {
  const [bundles, runs, rankings, candidates] = await Promise.all([
    dbGetBundles({ limit: 100 }),
    dbGetRuns({ limit: 200 }),
    dbGetRankings({ limit: 200 }),
    dbGetCandidates({ limit: 500 }),
  ]);

  const runMap = new Map(runs.map((r) => [r.bundle_id, r]));
  const rankMap = new Map(rankings.map((r) => [r.bundle_id, r]));

  return bundles.map((b) => ({
    bundle: b,
    run: runMap.get(b.id),
    ranking: rankMap.get(b.id),
    candidates: candidates.filter((c) => b.candidate_ids.includes(c.id)),
  }));
}

export function exportBundleAsJSON(bundle: OptimizationBundle): string {
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    module: bundle.module_key,
    bundleName: bundle.bundle_name,
    bundleSize: bundle.bundle_size,
    candidateCount: bundle.candidate_ids.length,
    ruleChanges: bundle.combined_rule_changes_json.changes,
    safeToApply: !bundle.conflict_detected && bundle.status === 'passed',
    warning: 'This bundle is a suggestion only. Never apply directly to live parser without full regression and shadow testing.',
  }, null, 2);
}
