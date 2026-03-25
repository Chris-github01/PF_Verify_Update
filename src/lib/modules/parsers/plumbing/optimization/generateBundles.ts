import type { OptimizationCandidate, OptimizationBundle, BundleSize, RuleChange } from './optimizationTypes';
import { mergeRuleChanges, detectConflicts } from './mergeRules';

function candidateScore(c: OptimizationCandidate): number {
  return c.confidence_score;
}

function groupByRuleKey(candidates: OptimizationCandidate[]): Map<string, OptimizationCandidate[]> {
  const map = new Map<string, OptimizationCandidate[]>();
  for (const c of candidates) {
    for (const change of c.rule_changes_json.changes) {
      const key = change.ruleKey;
      const existing = map.get(key) ?? [];
      existing.push(c);
      map.set(key, existing);
    }
  }
  return map;
}

function makeBundleName(candidates: OptimizationCandidate[], size: BundleSize): string {
  const sources = [...new Set(candidates.map((c) => c.source))].join('+');
  const patterns = candidates.flatMap((c) => c.originating_pattern_keys).slice(0, 2).join(',');
  return `[${size.toUpperCase()}] ${sources} — ${patterns || 'multi-rule'}`;
}

export function generateSmallBundles(candidates: OptimizationCandidate[]): Omit<OptimizationBundle, 'id' | 'created_at'>[] {
  const pending = candidates.filter((c) => c.status === 'pending').sort((a, b) => candidateScore(b) - candidateScore(a));
  const bundles: Omit<OptimizationBundle, 'id' | 'created_at'>[] = [];

  for (let i = 0; i < pending.length; i += 2) {
    const group = pending.slice(i, i + 2);
    const allChanges: RuleChange[] = group.flatMap((c) => c.rule_changes_json.changes);
    const conflicts = detectConflicts(allChanges);
    const merged = mergeRuleChanges(allChanges);

    bundles.push({
      module_key: 'plumbing_parser',
      bundle_name: makeBundleName(group, 'small'),
      bundle_size: 'small',
      candidate_ids: group.map((c) => c.id),
      combined_rule_changes_json: { changes: merged, candidateCount: group.length, mergedAt: new Date().toISOString() },
      conflict_detected: conflicts.length > 0,
      conflict_notes: conflicts.length > 0 ? conflicts.join('; ') : undefined,
      status: 'pending',
    });
  }

  return bundles;
}

export function generateMediumBundles(candidates: OptimizationCandidate[]): Omit<OptimizationBundle, 'id' | 'created_at'>[] {
  const pending = candidates.filter((c) => c.status === 'pending').sort((a, b) => candidateScore(b) - candidateScore(a));
  if (pending.length < 3) return [];

  const bundles: Omit<OptimizationBundle, 'id' | 'created_at'>[] = [];
  for (let i = 0; i < pending.length; i += 5) {
    const group = pending.slice(i, i + 5);
    if (group.length < 3) continue;
    const allChanges: RuleChange[] = group.flatMap((c) => c.rule_changes_json.changes);
    const conflicts = detectConflicts(allChanges);
    const merged = mergeRuleChanges(allChanges);

    bundles.push({
      module_key: 'plumbing_parser',
      bundle_name: makeBundleName(group, 'medium'),
      bundle_size: 'medium',
      candidate_ids: group.map((c) => c.id),
      combined_rule_changes_json: { changes: merged, candidateCount: group.length, mergedAt: new Date().toISOString() },
      conflict_detected: conflicts.length > 0,
      conflict_notes: conflicts.length > 0 ? conflicts.join('; ') : undefined,
      status: 'pending',
    });
  }

  return bundles;
}

export function generateStrategicBundle(candidates: OptimizationCandidate[]): Omit<OptimizationBundle, 'id' | 'created_at'> | null {
  const highConfidence = candidates.filter((c) => c.status === 'pending' && c.confidence_score >= 7);
  if (highConfidence.length === 0) return null;

  const byPattern = groupByRuleKey(highConfidence);
  const topPatterns = [...byPattern.entries()].sort(([, a], [, b]) => b.length - a.length).slice(0, 3);
  const selected = [...new Set(topPatterns.flatMap(([, cs]) => cs))];

  const allChanges: RuleChange[] = selected.flatMap((c) => c.rule_changes_json.changes);
  const conflicts = detectConflicts(allChanges);
  const merged = mergeRuleChanges(allChanges);

  return {
    module_key: 'plumbing_parser',
    bundle_name: makeBundleName(selected, 'strategic'),
    bundle_size: 'strategic',
    candidate_ids: selected.map((c) => c.id),
    combined_rule_changes_json: { changes: merged, candidateCount: selected.length, mergedAt: new Date().toISOString() },
    conflict_detected: conflicts.length > 0,
    conflict_notes: conflicts.length > 0 ? conflicts.join('; ') : undefined,
    status: 'pending',
  };
}

export function generateAllBundles(candidates: OptimizationCandidate[]): Omit<OptimizationBundle, 'id' | 'created_at'>[] {
  const small = generateSmallBundles(candidates);
  const medium = generateMediumBundles(candidates);
  const strategic = generateStrategicBundle(candidates);
  return [...small, ...medium, ...(strategic ? [strategic] : [])].filter((b) => !b.conflict_detected || b.bundle_size === 'strategic');
}
