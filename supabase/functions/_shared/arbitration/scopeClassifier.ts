/**
 * Universal Scope Classification Engine
 *
 * Detects section headings and classifies each into:
 *   - main        (default)
 *   - optional    (Optional Scope, Add Alternate, Alternate Price, PC Sum, Add On, Variation Option)
 *   - excluded    (Excluded, By Others, Client Supply, Provisional)
 *
 * Company-agnostic. No vendor-specific regex.
 * Heading inheritance: rows inherit scope of nearest preceding heading.
 */

export type ScopeCategory = "main" | "optional" | "excluded";

export interface DetectedHeading {
  heading: string;
  scope: ScopeCategory;
  line_number: number;
  confidence: number;
  matched_keyword: string;
}

export interface ScopeClassificationResult {
  headings: DetectedHeading[];
  scope_confidence: number;
  warnings: string[];
}

interface KeywordRule {
  scope: ScopeCategory;
  patterns: RegExp[];
  confidence: number;
}

const RULES: KeywordRule[] = [
  {
    scope: "optional",
    confidence: 0.92,
    patterns: [
      /\bOptional\s+Scope\b/i,
      /\bOptional\s+Items?\b/i,
      /\bAdd\s+Alternate\b/i,
      /\bAlternate\s+Price\b/i,
      /\bAlternate\s+Options?\b/i,
      /\bPC\s+Sum\b/i,
      /\bProvisional\s+Cost\s+Sum\b/i,
      /\bAdd[-\s]*On\b/i,
      /\bVariation\s+Options?\b/i,
      /\bOptions?\s+Pricing\b/i,
      /\bAdditional\s+Options?\b/i,
    ],
  },
  {
    scope: "excluded",
    confidence: 0.94,
    patterns: [
      /\bExclusions?\b/i,
      /\bExcluded\s+(?:Items?|Scope|Works?)\b/i,
      /\bNot\s+Included\b/i,
      /\bBy\s+Others\b/i,
      /\bBy\s+Client\b/i,
      /\bClient\s+Supply\b/i,
      /\bClient\s+Supplied\b/i,
      /\bClient\s+to\s+Provide\b/i,
      /\bProvisional\s+Sums?\b/i,
      /\bProvisional\s+Items?\b/i,
      /\bPS\s+Items?\b/i,
    ],
  },
];

const isLikelyHeading = (line: string): boolean => {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.length > 120) return false;
  if (/\$[\d,]+\.?\d*/.test(trimmed)) return false;
  const hasLetters = /[A-Za-z]/.test(trimmed);
  if (!hasLetters) return false;
  const alphaCount = (trimmed.match(/[A-Za-z]/g) || []).length;
  const digitCount = (trimmed.match(/\d/g) || []).length;
  return alphaCount > digitCount;
};

export function detectHeadings(text: string): DetectedHeading[] {
  const headings: DetectedHeading[] = [];
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!isLikelyHeading(line)) continue;

    for (const rule of RULES) {
      for (const pattern of rule.patterns) {
        const m = line.match(pattern);
        if (m) {
          headings.push({
            heading: line.trim(),
            scope: rule.scope,
            line_number: i + 1,
            confidence: rule.confidence,
            matched_keyword: m[0],
          });
          break;
        }
      }
    }
  }

  return headings;
}

/**
 * Classify a row's scope based on its line number and detected headings.
 * Uses inheritance: nearest preceding heading wins.
 */
export function classifyRowScope(
  rowLineNumber: number,
  headings: DetectedHeading[],
): { scope: ScopeCategory; confidence: number; source_heading: string | null } {
  let nearest: DetectedHeading | null = null;
  for (const h of headings) {
    if (h.line_number <= rowLineNumber) {
      if (!nearest || h.line_number > nearest.line_number) nearest = h;
    }
  }
  if (!nearest) {
    return { scope: "main", confidence: 0.70, source_heading: null };
  }
  return { scope: nearest.scope, confidence: nearest.confidence, source_heading: nearest.heading };
}

export function classifyScopes(text: string): ScopeClassificationResult {
  const headings = detectHeadings(text);
  const warnings: string[] = [];

  let scope_confidence: number;
  if (headings.length === 0) {
    scope_confidence = 0.70;
    warnings.push("No scope headings detected; all rows classified as main");
  } else {
    const avgConfidence = headings.reduce((s, h) => s + h.confidence, 0) / headings.length;
    scope_confidence = avgConfidence;
  }

  return { headings, scope_confidence, warnings };
}
