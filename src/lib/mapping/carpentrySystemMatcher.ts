import { CARPENTRY_SYSTEM_TEMPLATES, type CarpentrySystemTemplate } from './carpentrySystemTemplates';

export interface CarpentryMatchResult {
  systemId: string | null;
  systemLabel: string | null;
  category: string | null;
  confidence: number;
  needsReview: boolean;
  matchedFactors: string[];
  missedFactors: string[];
}

export interface CarpentryLineItem {
  description: string;
  canonical_unit?: string;
  subclass?: string;
  material?: string;
}

/**
 * Score a single carpentry template against a line item.
 * Returns a score 0–100 based on keyword matches and unit type.
 */
function scoreTemplate(item: CarpentryLineItem, template: CarpentrySystemTemplate): {
  score: number;
  matchedKeywords: string[];
} {
  const lower = (item.description || '').toLowerCase();
  const matchedKeywords: string[] = [];
  let score = 0;

  for (const keyword of template.keywords) {
    if (lower.includes(keyword.toLowerCase())) {
      matchedKeywords.push(keyword);
      score += 20;
    }
  }

  if (score === 0) return { score: 0, matchedKeywords: [] };

  // Cap keyword contribution at 80 so unit bonus can push over
  score = Math.min(score, 80);

  // Unit type bonus (up to 20 points)
  if (item.canonical_unit && template.unitTypes?.length) {
    const unitLower = item.canonical_unit.toLowerCase();
    if (template.unitTypes.some(u => u.toLowerCase() === unitLower)) {
      score += 20;
      matchedKeywords.push(`Unit: ${item.canonical_unit}`);
    }
  }

  return { score, matchedKeywords };
}

/**
 * Map a single carpentry line item to the best matching system template.
 * Completely independent from the passive fire matcher.
 */
export function matchCarpentryLineToSystem(item: CarpentryLineItem): CarpentryMatchResult {
  if (!item || !item.description) {
    return {
      systemId: null,
      systemLabel: null,
      category: null,
      confidence: 0,
      needsReview: true,
      matchedFactors: [],
      missedFactors: ['No description provided'],
    };
  }

  let bestTemplate: CarpentrySystemTemplate | null = null;
  let bestScore = 0;
  let bestMatchedKeywords: string[] = [];

  for (const template of CARPENTRY_SYSTEM_TEMPLATES) {
    const { score, matchedKeywords } = scoreTemplate(item, template);
    if (score > bestScore) {
      bestScore = score;
      bestTemplate = template;
      bestMatchedKeywords = matchedKeywords;
    }
  }

  // Minimum threshold: at least one keyword must match
  const MIN_SCORE = 20;
  if (!bestTemplate || bestScore < MIN_SCORE) {
    return {
      systemId: null,
      systemLabel: null,
      category: null,
      confidence: 0,
      needsReview: true,
      matchedFactors: [],
      missedFactors: ['No matching carpentry system found'],
    };
  }

  // Confidence: 100 points max (80 keyword + 20 unit)
  const confidence = Math.min(bestScore / 100, 1.0);
  const needsReview = confidence < 0.4;

  return {
    systemId: bestTemplate.id,
    systemLabel: bestTemplate.label,
    category: bestTemplate.category,
    confidence,
    needsReview,
    matchedFactors: bestMatchedKeywords,
    missedFactors: [],
  };
}
