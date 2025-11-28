import type { SupplierQuoteItem, MatchStatus } from '../../types/tradeAnalysis.types';
import { extractAttributes } from '../normaliser/attributeExtractor';
import { supabase } from '../supabase';

interface MatchCandidate {
  item: SupplierQuoteItem;
  score: number;
}

const MATCH_THRESHOLD = 0.25;
const PATTERN_FALLBACK_THRESHOLD = 0.5;

export async function fuzzyMatchItems(
  supplier1Items: SupplierQuoteItem[],
  supplier2Items: SupplierQuoteItem[],
  supplier1Name?: string,
  supplier2Name?: string
): Promise<Map<string, { supplier2Item: SupplierQuoteItem; score: number; status: MatchStatus }>> {
  console.log('[FuzzyMatcher] Starting match process', {
    supplier1Count: supplier1Items.length,
    supplier2Count: supplier2Items.length,
  });

  if (supplier1Items.length >= 5 && supplier2Items.length >= 5) {
    console.log('[FuzzyMatcher] Using LLM matcher as primary method...');

    try {
      const llmMatches = await matchItemsWithLLM(
        supplier1Items,
        supplier2Items,
        supplier1Name,
        supplier2Name
      );

      const matchRate = llmMatches.size / supplier1Items.length;
      console.log(`[FuzzyMatcher] ✓ LLM matched ${llmMatches.size} items (${(matchRate * 100).toFixed(1)}%)`);

      if (matchRate >= PATTERN_FALLBACK_THRESHOLD || llmMatches.size > 0) {
        return llmMatches;
      }

      console.log(`[FuzzyMatcher] LLM match rate ${(matchRate * 100).toFixed(1)}% below threshold. Trying pattern matching fallback...`);
    } catch (error) {
      console.error('[FuzzyMatcher] LLM matching failed, falling back to pattern matching:', error);
    }
  } else {
    console.log(`[FuzzyMatcher] Too few items for LLM (need 5+ each), using pattern matching`);
  }

  console.log('[FuzzyMatcher] Using pattern matching...');
  const matches = new Map<string, { supplier2Item: SupplierQuoteItem; score: number; status: MatchStatus }>();
  const usedSupplier2Ids = new Set<string>();
  const debugSamples: any[] = [];

  for (const item1 of supplier1Items) {
    let bestMatch: MatchCandidate | null = null;
    const candidateScores: { item2Desc: string; score: number }[] = [];

    for (const item2 of supplier2Items) {
      if (usedSupplier2Ids.has(item2.id)) continue;

      const score = calculateMatchScore(item1, item2);
      candidateScores.push({ item2Desc: item2.description.substring(0, 50), score });

      if (score > MATCH_THRESHOLD && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { item: item2, score };
      }
    }

    if (debugSamples.length < 5) {
      debugSamples.push({
        item1Desc: item1.description.substring(0, 50),
        item1Ref: item1.reference,
        item1Section: item1.section,
        item1Service: item1.service,
        item1Size: item1.size,
        topScores: candidateScores.sort((a, b) => b.score - a.score).slice(0, 3),
        matched: bestMatch !== null,
        matchScore: bestMatch?.score,
      });
    }

    if (bestMatch && bestMatch.score > MATCH_THRESHOLD) {
      matches.set(item1.id, {
        supplier2Item: bestMatch.item,
        score: bestMatch.score,
        status: 'matched',
      });
      usedSupplier2Ids.add(bestMatch.item.id);
    }
  }

  const matchRate = matches.size / supplier1Items.length;
  console.log('[FuzzyMatcher] Pattern match results', {
    matchedCount: matches.size,
    unmatchedCount: supplier1Items.length - matches.size,
    matchRate: `${(matchRate * 100).toFixed(1)}%`,
    debugSamples,
  });

  return matches;
}

async function matchItemsWithLLM(
  supplier1Items: SupplierQuoteItem[],
  supplier2Items: SupplierQuoteItem[],
  supplier1Name?: string,
  supplier2Name?: string
): Promise<Map<string, { supplier2Item: SupplierQuoteItem; score: number; status: MatchStatus }>> {
  console.log('[LLM Matcher] Calling edge function...');

  const { data, error } = await supabase.functions.invoke('match_trade_items_llm', {
    body: {
      supplier1Items: supplier1Items.map(item => ({
        id: item.id,
        description: item.description,
        qty: item.qty,
        unit: item.unit,
        rate: item.rate,
        total: item.total,
        section: item.section,
        service: item.service,
        size: item.size,
        reference: item.reference,
      })),
      supplier2Items: supplier2Items.map(item => ({
        id: item.id,
        description: item.description,
        qty: item.qty,
        unit: item.unit,
        rate: item.rate,
        total: item.total,
        section: item.section,
        service: item.service,
        size: item.size,
        reference: item.reference,
      })),
      supplier1Name,
      supplier2Name,
    }
  });

  if (error) {
    console.error('[LLM Matcher] Error:', error);
    throw new Error(`LLM matching failed: ${error.message}`);
  }

  if (!data || !data.success) {
    throw new Error('LLM matching returned no data');
  }

  console.log(`[LLM Matcher] Success: ${data.matches.length} matches, confidence: ${data.confidence}, tokens: ${data.tokensUsed}`);
  console.log('[LLM Matcher] Stats:', data.stats);

  const matches = new Map<string, { supplier2Item: SupplierQuoteItem; score: number; status: MatchStatus }>();
  const supplier2ItemsById = new Map(supplier2Items.map(item => [item.id, item]));

  for (const match of data.matches) {
    const supplier2Item = supplier2ItemsById.get(match.supplier2Id);
    if (supplier2Item) {
      matches.set(match.supplier1Id, {
        supplier2Item,
        score: match.confidence,
        status: 'matched',
      });
      console.log(`[LLM Matcher] Matched: ${match.reason}`);
    }
  }

  return matches;
}

function extractNumbers(str: string): Set<string> {
  const matches = str.match(/\d+/g) || [];
  return new Set(matches);
}

function calculateMatchScore(item1: SupplierQuoteItem, item2: SupplierQuoteItem): number {
  let score = 0;

  const attrs1 = extractAttributes(item1.description);
  const attrs2 = extractAttributes(item2.description);

  const service1 = (attrs1.service || item1.service || '').toLowerCase().trim();
  const service2 = (attrs2.service || item2.service || '').toLowerCase().trim();

  const hasMatchingService = service1 && service2 && service1 !== 'general' && service2 !== 'general' && service1 === service2;

  if (service1 && service2 && service1 !== 'general' && service2 !== 'general' && service1 !== service2) {
    return 0;
  }

  const desc1 = normalizeDescription(item1.description);
  const desc2 = normalizeDescription(item2.description);

  const numbers1 = extractNumbers(item1.description);
  const numbers2 = extractNumbers(item2.description);
  const commonNumbers = [...numbers1].filter(n => numbers2.has(n));

  if (hasMatchingService && commonNumbers.length > 0) {
    score += 0.40;
  }

  const tokenSimilarity = calculateTokenSimilarity(desc1, desc2);
  const substringMatch = calculateSubstringMatch(desc1, desc2);
  const levenshteinSim = calculateLevenshteinSimilarity(desc1, desc2);

  const descriptionScore = Math.max(tokenSimilarity, substringMatch, levenshteinSim * 0.8);
  score += descriptionScore * 0.35;

  if (hasMatchingService) {
    score += 0.15;
  }

  if (attrs1.size && attrs2.size && normalizeSizeString(attrs1.size) === normalizeSizeString(attrs2.size)) {
    score += 0.05;
  } else if (item1.size && item2.size && normalizeSizeString(item1.size) === normalizeSizeString(item2.size)) {
    score += 0.05;
  }

  if (item1.unit && item2.unit && normalizeUnit(item1.unit) === normalizeUnit(item2.unit)) {
    score += 0.05;
  }

  return score;
}

function normalizeSizeString(size: string): string {
  return size
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/x|×/g, 'x')
    .replace(/mm/g, '');
}

function normalizeSection(section: string): string {
  return section
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeUnit(unit: string): string {
  const normalized = unit
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, '')
    .trim();

  const unitMap: Record<string, string> = {
    'no': 'no',
    'number': 'no',
    'ea': 'no',
    'each': 'no',
    'm': 'm',
    'meter': 'm',
    'metre': 'm',
    'm2': 'm2',
    'sqm': 'm2',
    'm²': 'm2',
    'squaremeter': 'm2',
    'lm': 'lm',
    'linearmeter': 'lm',
    'hr': 'hr',
    'hour': 'hr',
    'hrs': 'hr',
    'hours': 'hr',
  };

  return unitMap[normalized] || normalized;
}

function normalizeDescription(desc: string): string {
  return desc
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function calculateTokenSimilarity(str1: string, str2: string): number {
  const tokens1 = str1.split(' ').filter(t => t.length > 2);
  const tokens2 = str2.split(' ').filter(t => t.length > 2);

  if (tokens1.length === 0 || tokens2.length === 0) return 0;

  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);

  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  if (union.size === 0) return 0;

  return intersection.size / union.size;
}

function calculateSubstringMatch(str1: string, str2: string): number {
  const shorter = str1.length < str2.length ? str1 : str2;
  const longer = str1.length < str2.length ? str2 : str1;

  if (shorter.length === 0) return 0;
  if (longer.includes(shorter)) return 0.9;

  const words1 = str1.split(' ').filter(w => w.length > 3);
  const words2 = str2.split(' ').filter(w => w.length > 3);

  let matchCount = 0;
  for (const word of words1) {
    if (words2.some(w => w.includes(word) || word.includes(w))) {
      matchCount++;
    }
  }

  if (words1.length === 0) return 0;
  return matchCount / words1.length;
}

function calculateLevenshteinSimilarity(str1: string, str2: string): number {
  if (str1.length === 0 && str2.length === 0) return 1;
  if (str1.length === 0 || str2.length === 0) return 0;

  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen > 200) {
    return calculateTokenSimilarity(str1, str2);
  }

  const distance = levenshteinDistance(str1, str2);
  return 1 - distance / maxLen;
}

function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;

  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[][] = Array(m + 1)
    .fill(0)
    .map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[m][n];
}

function extractItemNumber(text: string): number | null {
  const patterns = [
    /(?:type|section|item|penetration)\s+(\d+)/i,
    /(?:PF|PFP)[-_]?[A-Z]?(\d+)/i,
    /\b(\d{1,3})\b(?!\s*(?:mm|m²|meter|each|square))/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const num = parseInt(match[1], 10);
      if (num > 0 && num < 1000) {
        return num;
      }
    }
  }

  return null;
}

export function extractKeywords(description: string): string[] {
  const normalized = normalizeDescription(description);
  const words = normalized.split(' ').filter(w => w.length > 2);
  return [...new Set(words)];
}
