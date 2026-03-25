import type { RuleVersionRecord } from './learningTypes';

export interface RuleImpactComparisonResult {
  baselineVersion: string;
  candidateVersion: string;
  regressionPassRateDelta: number;
  estimatedAnomalyReduction: number;
  estimatedFalsePositiveDelta: number;
  accuracyImprovementPct: number;
  changedFields: RuleFieldDelta[];
  verdict: 'improvement' | 'regression' | 'neutral' | 'unknown';
  summary: string;
}

export interface RuleFieldDelta {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  impact: 'positive' | 'negative' | 'neutral' | 'unknown';
  note?: string;
}

const FIELD_IMPACT_HEURISTICS: Record<string, (oldVal: unknown, newVal: unknown) => RuleFieldDelta['impact']> = {
  summaryPhrases: (oldVal, newVal) => {
    const oldLen = (oldVal as string[])?.length ?? 0;
    const newLen = (newVal as string[])?.length ?? 0;
    return newLen > oldLen ? 'positive' : newLen < oldLen ? 'negative' : 'neutral';
  },
  classifyConfidenceThresholdHigh: (oldVal, newVal) => {
    const delta = (newVal as number) - (oldVal as number);
    return delta < 0 ? 'positive' : delta > 0 ? 'negative' : 'neutral';
  },
  classifyConfidenceThresholdMedium: (oldVal, newVal) => {
    const delta = (newVal as number) - (oldVal as number);
    return delta < 0 ? 'positive' : delta > 0 ? 'negative' : 'neutral';
  },
  amountOnlyWeighting: (oldVal, newVal) => {
    const delta = (newVal as number) - (oldVal as number);
    return delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral';
  },
  phraseMatchWeighting: (oldVal, newVal) => {
    const delta = (newVal as number) - (oldVal as number);
    return delta > 0 ? 'positive' : 'neutral';
  },
};

export function compareRuleVersions(
  baseline: RuleVersionRecord,
  candidate: RuleVersionRecord
): RuleImpactComparisonResult {
  const baseRules = baseline.rules_json;
  const candRules = candidate.rules_json;

  const changedFields: RuleFieldDelta[] = [];
  const allKeys = new Set([...Object.keys(baseRules), ...Object.keys(candRules)]);

  for (const key of allKeys) {
    const oldVal = baseRules[key];
    const newVal = candRules[key];
    const changed = JSON.stringify(oldVal) !== JSON.stringify(newVal);
    if (!changed) continue;

    const heuristic = FIELD_IMPACT_HEURISTICS[key];
    const impact: RuleFieldDelta['impact'] = heuristic ? heuristic(oldVal, newVal) : 'unknown';
    const note = buildFieldNote(key, oldVal, newVal);

    changedFields.push({ field: key, oldValue: oldVal, newValue: newVal, impact, note });
  }

  const basePassRate = baseline.regression_pass_rate ?? null;
  const candPassRate = candidate.regression_pass_rate ?? null;
  const regressionPassRateDelta = (basePassRate != null && candPassRate != null)
    ? candPassRate - basePassRate
    : 0;

  const positiveChanges = changedFields.filter((f) => f.impact === 'positive').length;
  const negativeChanges = changedFields.filter((f) => f.impact === 'negative').length;

  const estimatedAnomalyReduction = positiveChanges > 0 ? Math.min(0.35 * positiveChanges, 0.70) : 0;
  const estimatedFalsePositiveDelta = negativeChanges > 0 ? negativeChanges * 0.05 : 0;
  const accuracyImprovementPct = regressionPassRateDelta > 0
    ? regressionPassRateDelta * 100
    : Math.max(0, positiveChanges * 5 - negativeChanges * 8);

  let verdict: RuleImpactComparisonResult['verdict'];
  if (changedFields.length === 0) verdict = 'neutral';
  else if (regressionPassRateDelta > 0 || (positiveChanges > negativeChanges && regressionPassRateDelta >= 0)) verdict = 'improvement';
  else if (regressionPassRateDelta < -0.05 || negativeChanges > positiveChanges) verdict = 'regression';
  else if (basePassRate == null && candPassRate == null) verdict = 'unknown';
  else verdict = 'neutral';

  const summary = buildSummary(verdict, changedFields, regressionPassRateDelta, accuracyImprovementPct);

  return {
    baselineVersion: baseline.version,
    candidateVersion: candidate.version,
    regressionPassRateDelta,
    estimatedAnomalyReduction,
    estimatedFalsePositiveDelta,
    accuracyImprovementPct,
    changedFields,
    verdict,
    summary,
  };
}

function buildFieldNote(key: string, oldVal: unknown, newVal: unknown): string {
  if (key === 'summaryPhrases') {
    const oldSet = new Set(oldVal as string[]);
    const newSet = new Set(newVal as string[]);
    const added = [...newSet].filter((p) => !oldSet.has(p));
    const removed = [...oldSet].filter((p) => !newSet.has(p));
    const parts: string[] = [];
    if (added.length > 0) parts.push(`Added: [${added.slice(0, 3).join(', ')}${added.length > 3 ? '...' : ''}]`);
    if (removed.length > 0) parts.push(`Removed: [${removed.slice(0, 2).join(', ')}]`);
    return parts.join(' | ');
  }
  if (typeof oldVal === 'number' && typeof newVal === 'number') {
    const delta = newVal - oldVal;
    return `${delta > 0 ? '+' : ''}${delta.toFixed(3)} (${oldVal} → ${newVal})`;
  }
  return `${oldVal} → ${newVal}`;
}

function buildSummary(
  verdict: RuleImpactComparisonResult['verdict'],
  changedFields: RuleFieldDelta[],
  passRateDelta: number,
  accuracyPct: number
): string {
  if (changedFields.length === 0) return 'No rule differences detected between versions.';

  const changeList = changedFields.slice(0, 3).map((f) => f.field).join(', ');

  if (verdict === 'improvement') {
    return `This version improves parser accuracy by an estimated ${accuracyPct.toFixed(1)}%. ${changedFields.length} rule field(s) changed: ${changeList}.${passRateDelta > 0 ? ` Regression pass rate improved by ${(passRateDelta * 100).toFixed(1)}%.` : ''}`;
  }
  if (verdict === 'regression') {
    return `This version may reduce parser accuracy. ${changedFields.length} rule change(s): ${changeList}. Review carefully before testing.`;
  }
  if (verdict === 'unknown') {
    return `${changedFields.length} rule change(s) detected: ${changeList}. Run regression suite to measure impact.`;
  }
  return `${changedFields.length} neutral rule change(s): ${changeList}.`;
}

export function applyProposedRuleToConfig(
  baseRules: Record<string, unknown>,
  proposedRule: {
    type: string;
    addPhrases?: string[];
    removePhrases?: string[];
    adjustField?: string;
    newValue?: unknown;
  }
): Record<string, unknown> {
  const updated = { ...baseRules };

  if (proposedRule.type === 'add_summary_phrase' && proposedRule.addPhrases) {
    const existing = (updated.summaryPhrases as string[]) ?? [];
    updated.summaryPhrases = [...new Set([...existing, ...proposedRule.addPhrases])];
  }

  if (proposedRule.type === 'remove_summary_phrase' && proposedRule.removePhrases) {
    const existing = (updated.summaryPhrases as string[]) ?? [];
    const removeSet = new Set(proposedRule.removePhrases);
    updated.summaryPhrases = existing.filter((p) => !removeSet.has(p));
  }

  if (
    (proposedRule.type === 'adjust_threshold' || proposedRule.type === 'adjust_weighting') &&
    proposedRule.adjustField &&
    proposedRule.newValue !== undefined
  ) {
    updated[proposedRule.adjustField] = proposedRule.newValue;
  }

  return updated;
}
