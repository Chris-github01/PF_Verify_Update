import type { RuleChange } from './optimizationTypes';

export function detectConflicts(changes: RuleChange[]): string[] {
  const conflicts: string[] = [];
  const byRuleKey = new Map<string, RuleChange[]>();

  for (const change of changes) {
    const existing = byRuleKey.get(change.ruleKey) ?? [];
    existing.push(change);
    byRuleKey.set(change.ruleKey, existing);
  }

  for (const [ruleKey, ruleChanges] of byRuleKey) {
    if (ruleChanges.length <= 1) continue;

    const types = ruleChanges.map((c) => c.changeType);
    if (types.includes('remove') && types.some((t) => t !== 'remove')) {
      conflicts.push(`Conflict on '${ruleKey}': cannot modify and remove in same bundle`);
    }
    if (types.filter((t) => t === 'threshold_adjust').length > 1) {
      conflicts.push(`Conflict on '${ruleKey}': multiple threshold adjustments — only one can apply`);
    }
    if (types.filter((t) => t === 'modify').length > 1) {
      conflicts.push(`Conflict on '${ruleKey}': multiple modify operations — last one wins, review carefully`);
    }
  }

  return conflicts;
}

export function mergeRuleChanges(changes: RuleChange[]): RuleChange[] {
  const byRuleKey = new Map<string, RuleChange[]>();

  for (const change of changes) {
    const existing = byRuleKey.get(change.ruleKey) ?? [];
    existing.push(change);
    byRuleKey.set(change.ruleKey, existing);
  }

  const merged: RuleChange[] = [];

  for (const [, ruleChanges] of byRuleKey) {
    if (ruleChanges.length === 1) {
      merged.push(ruleChanges[0]);
      continue;
    }

    // pattern_add changes can coexist — keep all
    const patternAdds = ruleChanges.filter((c) => c.changeType === 'pattern_add');
    const others = ruleChanges.filter((c) => c.changeType !== 'pattern_add');

    merged.push(...patternAdds);

    // For conflicting types, keep the highest-priority one
    if (others.length > 0) {
      const priority: Record<string, number> = { remove: 4, modify: 3, threshold_adjust: 2, add: 1 };
      const sorted = others.sort((a, b) => (priority[b.changeType] ?? 0) - (priority[a.changeType] ?? 0));
      merged.push({
        ...sorted[0],
        rationale: `[Merged from ${others.length} candidates] ${sorted.map((c) => c.rationale).join(' | ')}`,
      });
    }
  }

  return merged;
}

export function validateMergedChanges(changes: RuleChange[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const change of changes) {
    if (!change.ruleKey || change.ruleKey.trim() === '') {
      errors.push('Rule change missing ruleKey');
    }
    if (!change.changeType) {
      errors.push(`Rule '${change.ruleKey}' missing changeType`);
    }
    if (!change.description || change.description.trim() === '') {
      errors.push(`Rule '${change.ruleKey}' missing description`);
    }
    if (change.changeType === 'modify' && change.proposedValue == null) {
      errors.push(`Rule '${change.ruleKey}' is a modify change but has no proposedValue`);
    }
  }

  const conflicts = detectConflicts(changes);
  if (conflicts.some((c) => c.includes('cannot'))) {
    errors.push(...conflicts.filter((c) => c.includes('cannot')));
  }

  return { valid: errors.length === 0, errors };
}

export function cloneRuleChanges(changes: RuleChange[]): RuleChange[] {
  return JSON.parse(JSON.stringify(changes));
}
