import type { OptimizationCandidate, CandidateSource, RuleChange } from './optimizationTypes';

interface LearningSuggestion {
  patternKey: string;
  description: string;
  suggestedRule: string;
  confidence: number;
}

interface ReviewFeedback {
  id: string;
  correctionType: string;
  patternKey?: string;
  description: string;
  confidence: number;
}

interface PredictiveFeedback {
  type: 'false_positive' | 'false_negative';
  patternKey: string;
  description: string;
  frequency: number;
}

export function generateCandidateFromLearningSuggestion(suggestion: LearningSuggestion): Omit<OptimizationCandidate, 'id' | 'created_at'> {
  const change: RuleChange = {
    ruleKey: suggestion.suggestedRule,
    changeType: 'pattern_add',
    proposedValue: suggestion.patternKey,
    description: `Add pattern '${suggestion.patternKey}' to rule '${suggestion.suggestedRule}'`,
    rationale: `Learning engine identified recurring pattern with ${suggestion.confidence * 10}% confidence`,
    affectedFields: ['description', 'classification'],
  };

  return {
    module_key: 'plumbing_parser',
    source: 'learning',
    description: suggestion.description,
    rule_changes_json: {
      changes: [change],
      metadata: { suggestedRule: suggestion.suggestedRule, patternKey: suggestion.patternKey },
    },
    originating_pattern_keys: [suggestion.patternKey],
    confidence_score: Math.min(10, Math.round(suggestion.confidence * 10) / 10),
    status: 'pending',
  };
}

export function generateCandidateFromReviewFeedback(feedback: ReviewFeedback): Omit<OptimizationCandidate, 'id' | 'created_at'> {
  const changeTypeMap: Record<string, RuleChange['changeType']> = {
    needs_rule_change: 'modify',
    needs_manual_correction_pattern: 'pattern_add',
    false_positive_alert: 'threshold_adjust',
    false_negative_alert: 'threshold_adjust',
  };

  const change: RuleChange = {
    ruleKey: feedback.patternKey ?? 'unknown_rule',
    changeType: changeTypeMap[feedback.correctionType] ?? 'modify',
    description: feedback.description,
    rationale: `Reviewer decision '${feedback.correctionType}' on case ${feedback.id}`,
    affectedFields: ['classification', 'total_detection'],
  };

  return {
    module_key: 'plumbing_parser',
    source: 'review',
    description: `Review correction: ${feedback.description}`,
    rule_changes_json: {
      changes: [change],
      metadata: { reviewCaseId: feedback.id, correctionType: feedback.correctionType },
    },
    originating_pattern_keys: feedback.patternKey ? [feedback.patternKey] : [],
    confidence_score: Math.min(10, Math.round(feedback.confidence * 10) / 10),
    status: 'pending',
  };
}

export function generateCandidateFromPredictiveFeedback(feedback: PredictiveFeedback): Omit<OptimizationCandidate, 'id' | 'created_at'> {
  const isFP = feedback.type === 'false_positive';
  const change: RuleChange = {
    ruleKey: feedback.patternKey,
    changeType: 'threshold_adjust',
    description: isFP
      ? `Raise sensitivity threshold for '${feedback.patternKey}' to reduce false positives`
      : `Lower sensitivity threshold for '${feedback.patternKey}' to catch missed risks`,
    rationale: `Predictive engine flagged ${feedback.frequency} ${isFP ? 'false positive' : 'false negative'} occurrences`,
    proposedValue: isFP ? 'raise_threshold' : 'lower_threshold',
    affectedFields: ['risk_score', 'confidence_threshold'],
  };

  const confidence = Math.min(10, feedback.frequency * 0.5);

  return {
    module_key: 'plumbing_parser',
    source: 'predictive',
    description: `${isFP ? 'Reduce false positives' : 'Capture missed risks'} for pattern '${feedback.patternKey}'`,
    rule_changes_json: {
      changes: [change],
      metadata: { feedbackType: feedback.type, patternKey: feedback.patternKey, frequency: feedback.frequency },
    },
    originating_pattern_keys: [feedback.patternKey],
    confidence_score: confidence,
    status: 'pending',
  };
}

export function generateManualCandidate(params: {
  description: string;
  ruleKey: string;
  changeType: RuleChange['changeType'];
  proposedValue?: unknown;
  rationale: string;
  patternKeys?: string[];
  confidence?: number;
}): Omit<OptimizationCandidate, 'id' | 'created_at'> {
  const change: RuleChange = {
    ruleKey: params.ruleKey,
    changeType: params.changeType,
    proposedValue: params.proposedValue,
    description: params.description,
    rationale: params.rationale,
  };

  return {
    module_key: 'plumbing_parser',
    source: 'manual',
    description: params.description,
    rule_changes_json: {
      changes: [change],
      metadata: { manual: true },
    },
    originating_pattern_keys: params.patternKeys ?? [],
    confidence_score: params.confidence ?? 7.0,
    status: 'pending',
  };
}

export function deduplicateCandidates(
  candidates: Omit<OptimizationCandidate, 'id' | 'created_at'>[]
): Omit<OptimizationCandidate, 'id' | 'created_at'>[] {
  const seen = new Set<string>();
  return candidates.filter((c) => {
    const key = c.originating_pattern_keys.sort().join(',') + '|' + c.source;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
