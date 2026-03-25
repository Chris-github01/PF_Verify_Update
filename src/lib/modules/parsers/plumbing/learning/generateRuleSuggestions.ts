import { PLUMBING_RULE_CONFIG } from '../ruleConfig';
import type { PatternClusterRecord, RuleSuggestionRecord, ProposedRule, ExpectedImpact, SuggestionType } from './learningTypes';

const OCCURRENCE_THRESHOLD = 3;
const HIGH_CONFIDENCE_THRESHOLD = 0.75;
const MIN_FAILURE_COUNT = 2;

export interface SuggestionCandidate {
  suggestionType: SuggestionType;
  patternKey: string;
  clusterId?: string;
  description: string;
  proposedRule: ProposedRule;
  expectedImpact: ExpectedImpact;
  confidenceScore: number;
}

function phraseAlreadyExists(phrase: string): boolean {
  return PLUMBING_RULE_CONFIG.summaryPhrases.includes(phrase as typeof PLUMBING_RULE_CONFIG.summaryPhrases[number]);
}

function extractMissingPhrases(keywords: string[]): string[] {
  const candidates: string[] = [];
  const kwSet = new Set(keywords);

  const totalVariants = ['total', 'totals', 'sub total', 'net total', 'grand total'];
  const taxVariants = ['gst', 'tax', 'incl gst', 'excl gst'];
  const sumVariants = ['sum', 'amount due', 'balance due', 'invoice total'];
  const carryVariants = ['carried forward', 'carry forward', 'c/f', 'b/f'];

  for (const group of [totalVariants, taxVariants, sumVariants, carryVariants]) {
    for (const phrase of group) {
      if (kwSet.has(phrase) && !phraseAlreadyExists(phrase)) {
        candidates.push(phrase);
      }
    }
  }

  const twoWordCombos = buildKeywordCombinations(keywords, 2);
  for (const combo of twoWordCombos) {
    if (!phraseAlreadyExists(combo) && isPlausibleSummaryPhrase(combo)) {
      candidates.push(combo);
    }
  }

  return [...new Set(candidates)].slice(0, 3);
}

function buildKeywordCombinations(keywords: string[], n: number): string[] {
  if (keywords.length < n) return [];
  const combos: string[] = [];
  for (let i = 0; i < keywords.length - n + 1; i++) {
    combos.push(keywords.slice(i, i + n).join(' '));
  }
  return combos;
}

function isPlausibleSummaryPhrase(phrase: string): boolean {
  const summaryIndicators = ['total', 'sum', 'gst', 'tax', 'invoice', 'balance', 'amount', 'due', 'carry', 'forward', 'net', 'grand', 'project', 'contract'];
  return summaryIndicators.some((ind) => phrase.includes(ind));
}

function computeConfidence(cluster: PatternClusterRecord): number {
  let score = 0;
  const freq = Math.min(cluster.occurrence_count / 20, 1.0) * 0.40;
  score += freq;

  const sevDist = cluster.severity_distribution_json;
  const totalSev = sevDist.critical + sevDist.warning + sevDist.info;
  if (totalSev > 0) {
    const critRatio = sevDist.critical / totalSev;
    score += critRatio * 0.25;
    score += (sevDist.warning / totalSev) * 0.10;
  }

  if (cluster.failure_count > 0) {
    const failRatio = Math.min(cluster.failure_count / cluster.occurrence_count, 1.0);
    score += failRatio * 0.25;
  }

  score += 0.10;

  return Math.min(1.0, score);
}

export function generateSuggestionsForCluster(
  cluster: PatternClusterRecord
): SuggestionCandidate[] {
  const candidates: SuggestionCandidate[] = [];

  if (cluster.occurrence_count < OCCURRENCE_THRESHOLD && cluster.failure_count < MIN_FAILURE_COUNT) {
    return candidates;
  }

  const sig = cluster.pattern_signature_json;
  const keywords = sig.keywords ?? [];
  const confidence = computeConfidence(cluster);

  if (confidence < 0.20) return candidates;

  const missingPhrases = extractMissingPhrases(keywords);
  if (missingPhrases.length > 0 && sig.amountOnly) {
    const proposedRule: ProposedRule = {
      type: 'add_summary_phrase',
      addPhrases: missingPhrases,
      reason: `Pattern "${cluster.pattern_label}" has occurred ${cluster.occurrence_count} times with keywords [${keywords.slice(0, 4).join(', ')}] but matching phrases are not in the summary phrase list.`,
    };
    const impact: ExpectedImpact = {
      fixesPatternCount: cluster.occurrence_count,
      affectsRegressionCases: cluster.failure_count,
      estimatedFailureReduction: Math.min(0.9, cluster.failure_count / Math.max(cluster.occurrence_count, 1)),
      estimatedFalsePositiveRisk: 0.05,
      description: `Adding phrases [${missingPhrases.join(', ')}] to summary phrase list would likely resolve ${cluster.occurrence_count} occurrences of this pattern.`,
    };
    candidates.push({
      suggestionType: 'add_summary_phrase',
      patternKey: cluster.pattern_key,
      clusterId: cluster.id,
      description: `Add summary phrase(s): ${missingPhrases.map((p) => `"${p}"`).join(', ')} — detected in ${cluster.occurrence_count} events`,
      proposedRule,
      expectedImpact: impact,
      confidenceScore: Math.min(confidence + 0.05, 1.0),
    });
  }

  if (sig.amountOnly && sig.position === 'last_row' && cluster.occurrence_count >= 5) {
    const currentThreshold = PLUMBING_RULE_CONFIG.classifyConfidenceThresholdMedium;
    const newThreshold = Math.max(0.25, currentThreshold - 0.05);
    if (newThreshold !== currentThreshold) {
      const proposedRule: ProposedRule = {
        type: 'adjust_threshold',
        adjustField: 'classifyConfidenceThresholdMedium',
        oldValue: currentThreshold,
        newValue: newThreshold,
        reason: `Amount-only end-of-document rows are slipping through medium confidence threshold. Reducing from ${currentThreshold} to ${newThreshold} to catch more.`,
      };
      const impact: ExpectedImpact = {
        fixesPatternCount: cluster.occurrence_count,
        affectsRegressionCases: cluster.failure_count,
        estimatedFailureReduction: 0.60,
        estimatedFalsePositiveRisk: 0.08,
        description: `Lowering medium confidence threshold from ${currentThreshold} to ${newThreshold} to better capture amount-only end-of-document patterns.`,
      };
      candidates.push({
        suggestionType: 'adjust_threshold',
        patternKey: cluster.pattern_key,
        clusterId: cluster.id,
        description: `Lower classifyConfidenceThresholdMedium from ${currentThreshold} to ${newThreshold} — applies to amount-only end-position rows`,
        proposedRule,
        expectedImpact: impact,
        confidenceScore: confidence * 0.85,
      });
    }
  }

  if (sig.amountOnly && confidence >= HIGH_CONFIDENCE_THRESHOLD) {
    const currentWeighting = PLUMBING_RULE_CONFIG.amountOnlyWeighting;
    const newWeighting = Math.min(0.50, currentWeighting + 0.05);
    if (newWeighting !== currentWeighting) {
      const proposedRule: ProposedRule = {
        type: 'adjust_weighting',
        adjustField: 'amountOnlyWeighting',
        oldValue: currentWeighting,
        newValue: newWeighting,
        reason: `High-frequency amount-only pattern suggests amountOnly weighting should be increased to better catch these rows.`,
      };
      const impact: ExpectedImpact = {
        fixesPatternCount: Math.floor(cluster.occurrence_count * 0.7),
        affectsRegressionCases: cluster.failure_count,
        estimatedFailureReduction: 0.55,
        estimatedFalsePositiveRisk: 0.06,
        description: `Increasing amountOnlyWeighting from ${currentWeighting} to ${newWeighting} improves detection of amount-only total rows.`,
      };
      candidates.push({
        suggestionType: 'adjust_weighting',
        patternKey: cluster.pattern_key,
        clusterId: cluster.id,
        description: `Increase amountOnlyWeighting from ${currentWeighting} to ${newWeighting} — based on ${cluster.occurrence_count} confirmed amount-only failure events`,
        proposedRule,
        expectedImpact: impact,
        confidenceScore: confidence * 0.80,
      });
    }
  }

  return candidates;
}

export function generateAllSuggestions(
  clusters: PatternClusterRecord[],
  existingSuggestions: RuleSuggestionRecord[]
): SuggestionCandidate[] {
  const existingPatternKeys = new Set(existingSuggestions.map((s) => `${s.pattern_key}__${s.suggestion_type}`));
  const allCandidates: SuggestionCandidate[] = [];

  const sortedClusters = [...clusters].sort((a, b) => {
    const aScore = a.occurrence_count * 1.5 + a.severity_distribution_json.critical * 3;
    const bScore = b.occurrence_count * 1.5 + b.severity_distribution_json.critical * 3;
    return bScore - aScore;
  });

  for (const cluster of sortedClusters.slice(0, 20)) {
    const candidates = generateSuggestionsForCluster(cluster);
    for (const c of candidates) {
      const dedupKey = `${c.patternKey}__${c.suggestionType}`;
      if (!existingPatternKeys.has(dedupKey)) {
        allCandidates.push(c);
        existingPatternKeys.add(dedupKey);
      }
    }
  }

  return allCandidates.sort((a, b) => b.confidenceScore - a.confidenceScore);
}
