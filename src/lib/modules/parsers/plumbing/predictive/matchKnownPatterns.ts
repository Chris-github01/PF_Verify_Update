import type { PatternClusterRecord } from '../learning/learningTypes';
import type { QuoteSignature } from './riskTypes';

export interface PatternMatchResult {
  clusterId: string;
  patternKey: string;
  patternLabel: string;
  matchScore: number;
  matchedSignals: string[];
  occurrenceCount: number;
  failureCount: number;
  riskBoost: number;
}

function signatureMatchScore(sig: QuoteSignature, cluster: PatternClusterRecord): { score: number; signals: string[] } {
  const clusterSig = cluster.pattern_signature_json;
  const matchedSignals: string[] = [];
  let score = 0;

  if (clusterSig.amountOnly && sig.amountOnlyRatio > 0.10) {
    score += 25;
    matchedSignals.push('amount_only_rows');
  }

  if (clusterSig.missingQty && sig.missingQtyRatio > 0.15) {
    score += 15;
    matchedSignals.push('missing_qty');
  }

  if (clusterSig.highValue && sig.highValueOutlierCount > 0) {
    score += 20;
    matchedSignals.push('high_value_outliers');
  }

  if ((clusterSig.position === 'last_row' || clusterSig.position === 'near_end') && sig.endOfDocumentSummaryRatio > 0.1) {
    score += 20;
    matchedSignals.push('end_of_document_summary');
  }

  if (clusterSig.keywords && clusterSig.keywords.length > 0) {
    const sigText = (sig.rawTextSample ?? '').toLowerCase();
    const matchedKw = clusterSig.keywords.filter((kw) => sigText.includes(kw));
    if (matchedKw.length > 0) {
      score += Math.min(20, matchedKw.length * 7);
      matchedSignals.push(`keywords: ${matchedKw.slice(0, 3).join(', ')}`);
    }
  }

  if (sig.totalPhraseCount > 0 && clusterSig.keywords?.some((k) => ['total', 'grand', 'sum'].includes(k))) {
    score += 10;
    matchedSignals.push('total_phrases_present');
  }

  if (clusterSig.shortDescription && sig.keywordComplexityScore < 30) {
    score += 5;
    matchedSignals.push('short_description_pattern');
  }

  return { score, signals: matchedSignals };
}

const MATCH_THRESHOLD = 40;

export function matchKnownPatterns(
  sig: QuoteSignature,
  clusters: PatternClusterRecord[],
  minOccurrences = 3
): PatternMatchResult[] {
  const results: PatternMatchResult[] = [];

  const relevantClusters = clusters.filter(
    (c) => c.occurrence_count >= minOccurrences && c.failure_count > 0
  );

  for (const cluster of relevantClusters) {
    const { score, signals } = signatureMatchScore(sig, cluster);
    if (score < MATCH_THRESHOLD) continue;

    const normalizedScore = Math.min(100, score);
    const riskBoost = Math.min(20, (cluster.failure_count / cluster.occurrence_count) * 25 + normalizedScore * 0.15);

    results.push({
      clusterId: cluster.id,
      patternKey: cluster.pattern_key,
      patternLabel: cluster.pattern_label,
      matchScore: normalizedScore,
      matchedSignals: signals,
      occurrenceCount: cluster.occurrence_count,
      failureCount: cluster.failure_count,
      riskBoost: Math.round(riskBoost * 10) / 10,
    });
  }

  return results.sort((a, b) => b.matchScore - a.matchScore);
}

export function extractMatchedPatternKeys(matches: PatternMatchResult[]): string[] {
  return matches.map((m) => m.patternKey);
}
