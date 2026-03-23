export type ClassificationTag =
  | 'main_scope'
  | 'summary_only'
  | 'optional_scope'
  | 'review_required';

export type ClassificationConfidence = 'high' | 'medium' | 'low';

export interface SummaryPhrase {
  phrase: string;
  matchType: 'contains' | 'exact';
  /**
   * When true, this phrase excludes a row as summary_only even if the row has
   * a valid pricing structure (qty > 0, rate > 0, total > 0).  Use this for
   * known rollup/duplicate lines that carry their own prices but still
   * double-count items already priced individually elsewhere in the document.
   */
  excludeEvenWhenPriced?: boolean;
}

export interface OptionalFamily {
  familyName: string;
  matchKeywords: string[];
}

export interface ClassificationOptions {
  summaryPhrases?: SummaryPhrase[];
  optionalFamilies?: OptionalFamily[];
}

export const DEFAULT_SUMMARY_PHRASES: SummaryPhrase[] = [
  {
    phrase: 'extra over for fire stopping required not shown on layout',
    matchType: 'contains',
    excludeEvenWhenPriced: true,
  },
  { phrase: 'required to achieve compliance', matchType: 'contains' },
  { phrase: 'required to achieve insulation rating', matchType: 'contains' },
  { phrase: 'can be removed if insulation rating is not required', matchType: 'contains' },
];

export const DEFAULT_OPTIONAL_FAMILIES: OptionalFamily[] = [
  {
    familyName: 'Door Perimeter Seal',
    matchKeywords: ['door perimeter seal'],
  },
  {
    familyName: 'Lift Door Seal',
    matchKeywords: ['lift door seal'],
  },
  {
    familyName: 'Flush Box Intumescent Pad',
    matchKeywords: ['flush box intumescent pad', 'flushbox intumescent pad', 'intumescent flushbox pad'],
  },
];

const FRR_PATTERN = /-\/\d+\/\d+|-\/-\/-|\d+\/\d+\/\d+|\(\d+\)\/\d+/i;

const SUBSTRATE_KEYWORDS = [
  'gib wall',
  'concrete wall',
  'concrete floor',
  'smoke wall',
  'masonry wall',
  'hebel wall',
  'timber wall',
  'steel deck',
  'metal deck',
];

const MEASURABLE_ELEMENT_PATTERNS = [
  /\d+mm/i,
  /\d+x\d+/i,
  /cable bundle/i,
  /cable tray/i,
  /conduit/i,
  /pvc pipe/i,
  /copper pipe/i,
  /steel pipe/i,
  /duct/i,
];

export function matchesSummaryPhrase(
  description: string,
  phrases: SummaryPhrase[] = DEFAULT_SUMMARY_PHRASES
): { matched: boolean; phrase: string | null; excludeEvenWhenPriced: boolean } {
  const lower = description.toLowerCase();
  for (const entry of phrases) {
    if (entry.matchType === 'contains' && lower.includes(entry.phrase.toLowerCase())) {
      return { matched: true, phrase: entry.phrase, excludeEvenWhenPriced: entry.excludeEvenWhenPriced ?? false };
    }
    if (entry.matchType === 'exact' && lower === entry.phrase.toLowerCase()) {
      return { matched: true, phrase: entry.phrase, excludeEvenWhenPriced: entry.excludeEvenWhenPriced ?? false };
    }
  }
  return { matched: false, phrase: null, excludeEvenWhenPriced: false };
}

export function matchesOptionalFamily(
  description: string,
  families: OptionalFamily[] = DEFAULT_OPTIONAL_FAMILIES
): { matched: boolean; familyName: string | null } {
  const lower = description.toLowerCase();
  for (const family of families) {
    for (const keyword of family.matchKeywords) {
      if (lower.includes(keyword.toLowerCase())) {
        return { matched: true, familyName: family.familyName };
      }
    }
  }
  return { matched: false, familyName: null };
}

const SERVICE_TYPE_KEYWORDS = [
  'electrical',
  'hydraulic',
  'mechanical',
  'fire protection',
  'insulation wrap',
  'batt patch',
  'penetration',
];

export function matchesDetailSignals(description: string, qty: number, rate: number, total: number): {
  hasFRR: boolean;
  hasSubstrate: boolean;
  hasMeasurableElement: boolean;
  hasPricingStructure: boolean;
  hasServiceType: boolean;
} {
  const lower = description.toLowerCase();

  const hasFRR = FRR_PATTERN.test(description);
  const hasSubstrate = SUBSTRATE_KEYWORDS.some(kw => lower.includes(kw));
  const hasMeasurableElement = MEASURABLE_ELEMENT_PATTERNS.some(p => p.test(description));
  const hasPricingStructure = qty > 0 && rate > 0 && total > 0;
  const hasServiceType = SERVICE_TYPE_KEYWORDS.some(kw => lower.includes(kw));

  return { hasFRR, hasSubstrate, hasMeasurableElement, hasPricingStructure, hasServiceType };
}
