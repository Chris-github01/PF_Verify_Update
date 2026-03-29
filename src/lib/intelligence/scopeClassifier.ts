import type { RawQuoteItem, ScopeItemClassification } from './types';
import type { ScopeBucket } from './scopeIntelligenceConfig';
import {
  CLASSIFIER_VERSION,
  SCOPE_WEIGHTS,
  CORE_SCOPE_ANCHOR_PHRASES,
  RISK_SCOPE_ANCHOR_PHRASES,
  EXCLUDED_SCOPE_ANCHOR_PHRASES,
  OPTIONAL_SCOPE_ANCHOR_PHRASES,
  SUMMARY_ONLY_ANCHOR_PHRASES,
  SECONDARY_SCOPE_ANCHOR_PHRASES,
} from './scopeIntelligenceConfig';

interface ClassificationCandidate {
  bucket: ScopeBucket;
  score: number;
  matchedPhrases: string[];
}

function normaliseText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s&]/g, ' ').trim();
}

function scoreAgainstPhrases(
  normText: string,
  phrases: string[],
): { score: number; matched: string[] } {
  const matched: string[] = [];
  for (const phrase of phrases) {
    if (normText.includes(phrase.toLowerCase())) {
      matched.push(phrase);
    }
  }
  const score = Math.min(matched.length * 25, 100);
  return { score, matched };
}

function resolveText(item: RawQuoteItem): string {
  return (
    item.raw_text ||
    item.raw_description ||
    item.description ||
    ''
  ).trim();
}

function detectSummaryOnly(normText: string): boolean {
  for (const phrase of SUMMARY_ONLY_ANCHOR_PHRASES) {
    if (normText.startsWith(phrase.toLowerCase())) return true;
    if (normText === phrase.toLowerCase()) return true;
  }
  const summaryScore = scoreAgainstPhrases(normText, SUMMARY_ONLY_ANCHOR_PHRASES);
  return summaryScore.score >= 50 && normText.length < 40;
}

function buildCandidates(
  normText: string,
  item: RawQuoteItem,
): ClassificationCandidate[] {
  const candidates: ClassificationCandidate[] = [];

  if (item.is_excluded === true) {
    candidates.push({ bucket: 'excluded_scope', score: 95, matchedPhrases: ['is_excluded=true'] });
  }

  const exclusionResult = scoreAgainstPhrases(normText, EXCLUDED_SCOPE_ANCHOR_PHRASES);
  if (exclusionResult.score > 0) {
    candidates.push({
      bucket: 'excluded_scope',
      score: exclusionResult.score,
      matchedPhrases: exclusionResult.matched,
    });
  }

  const riskResult = scoreAgainstPhrases(normText, RISK_SCOPE_ANCHOR_PHRASES);
  if (riskResult.score > 0) {
    candidates.push({
      bucket: 'risk_scope',
      score: riskResult.score,
      matchedPhrases: riskResult.matched,
    });
  }

  const optionalResult = scoreAgainstPhrases(normText, OPTIONAL_SCOPE_ANCHOR_PHRASES);
  if (optionalResult.score > 0) {
    candidates.push({
      bucket: 'optional_scope',
      score: optionalResult.score,
      matchedPhrases: optionalResult.matched,
    });
  }

  const coreResult = scoreAgainstPhrases(normText, CORE_SCOPE_ANCHOR_PHRASES);
  if (coreResult.score > 0) {
    candidates.push({
      bucket: 'core_scope',
      score: coreResult.score,
      matchedPhrases: coreResult.matched,
    });
  }

  const secondaryResult = scoreAgainstPhrases(normText, SECONDARY_SCOPE_ANCHOR_PHRASES);
  if (secondaryResult.score > 0) {
    candidates.push({
      bucket: 'secondary_scope',
      score: secondaryResult.score,
      matchedPhrases: secondaryResult.matched,
    });
  }

  if (item.scope_category) {
    const mapped = mapExistingScopeCategory(item.scope_category);
    if (mapped) {
      candidates.push({ bucket: mapped, score: 60, matchedPhrases: [`scope_category:${item.scope_category}`] });
    }
  }

  return candidates;
}

function mapExistingScopeCategory(cat: string): ScopeBucket | null {
  const c = cat.toLowerCase();
  if (c.includes('exclu')) return 'excluded_scope';
  if (c.includes('option')) return 'optional_scope';
  if (c.includes('risk') || c.includes('provisional') || c.includes('pc')) return 'risk_scope';
  if (c.includes('summary') || c.includes('total')) return 'summary_only';
  if (c.includes('core') || c.includes('main') || c.includes('primary')) return 'core_scope';
  if (c.includes('secondary') || c.includes('support')) return 'secondary_scope';
  return null;
}

function buildReasoning(
  bucket: ScopeBucket,
  matched: string[],
  confidence: number,
  item: RawQuoteItem,
): string {
  const text = resolveText(item).slice(0, 80);
  const matchStr = matched.length > 0 ? ` Matched: "${matched.slice(0, 3).join('", "')}"` : '';
  return `Classified as ${bucket} (confidence: ${confidence}%) — "${text}".${matchStr}`;
}

function prioritiseBucket(candidates: ClassificationCandidate[]): ClassificationCandidate | null {
  if (candidates.length === 0) return null;

  const PRIORITY_ORDER: ScopeBucket[] = [
    'excluded_scope',
    'optional_scope',
    'risk_scope',
    'summary_only',
    'core_scope',
    'secondary_scope',
    'unknown_scope',
  ];

  const sorted = [...candidates].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return PRIORITY_ORDER.indexOf(a.bucket) - PRIORITY_ORDER.indexOf(b.bucket);
  });

  return sorted[0];
}

export function classifyItem(
  item: RawQuoteItem,
  quoteId: string,
  projectId: string,
  organisationId: string,
  supplierName: string,
): ScopeItemClassification {
  const rawText = resolveText(item);
  const normText = normaliseText(rawText);

  if (!normText || normText.length < 3) {
    return {
      quoteItemId: item.id,
      quoteId,
      projectId,
      organisationId,
      supplierName,
      scopeBucket: 'unknown_scope',
      confidence: 20,
      reasoning: 'Item has no classifiable text.',
      anchorPhrasesMatched: [],
      commercialWeight: SCOPE_WEIGHTS['unknown_scope'],
      rawTextSnapshot: rawText.slice(0, 500),
    };
  }

  if (detectSummaryOnly(normText)) {
    return {
      quoteItemId: item.id,
      quoteId,
      projectId,
      organisationId,
      supplierName,
      scopeBucket: 'summary_only',
      confidence: 85,
      reasoning: `Detected as summary/total row: "${rawText.slice(0, 60)}"`,
      anchorPhrasesMatched: [],
      commercialWeight: SCOPE_WEIGHTS['summary_only'],
      rawTextSnapshot: rawText.slice(0, 500),
    };
  }

  const candidates = buildCandidates(normText, item);
  const best = prioritiseBucket(candidates);

  if (!best || best.score < 15) {
    return {
      quoteItemId: item.id,
      quoteId,
      projectId,
      organisationId,
      supplierName,
      scopeBucket: 'unknown_scope',
      confidence: 30,
      reasoning: `Insufficient signal to classify: "${rawText.slice(0, 60)}"`,
      anchorPhrasesMatched: [],
      commercialWeight: SCOPE_WEIGHTS['unknown_scope'],
      rawTextSnapshot: rawText.slice(0, 500),
    };
  }

  const confidence = Math.min(best.score, 95);
  const bucket = best.bucket;

  return {
    quoteItemId: item.id,
    quoteId,
    projectId,
    organisationId,
    supplierName,
    scopeBucket: bucket,
    confidence,
    reasoning: buildReasoning(bucket, best.matchedPhrases, confidence, item),
    anchorPhrasesMatched: best.matchedPhrases,
    commercialWeight: SCOPE_WEIGHTS[bucket],
    rawTextSnapshot: rawText.slice(0, 500),
    sectionContext: item.section_context ?? undefined,
  };
}

export function classifyItems(
  items: RawQuoteItem[],
  quoteId: string,
  projectId: string,
  organisationId: string,
  supplierName: string,
): ScopeItemClassification[] {
  return items.map((item) =>
    classifyItem(item, quoteId, projectId, organisationId, supplierName),
  );
}

export { CLASSIFIER_VERSION };
