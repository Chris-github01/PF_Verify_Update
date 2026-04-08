import {
  type ClassificationTag,
  type ClassificationConfidence,
  type ClassificationOptions,
  DEFAULT_SUMMARY_PHRASES,
  DEFAULT_OPTIONAL_FAMILIES,
  matchesSummaryPhrase,
  matchesOptionalFamily,
  matchesDetailSignals,
} from './classificationRules';

export interface ParsedQuoteRow {
  id?: string;
  quote_id?: string;
  description?: string;
  quantity?: number;
  unit?: string;
  unit_price?: number;
  total_price?: number;
  section?: string;
  service?: string;
  scope_category?: string;
  frr?: string;
  source?: string;
  [key: string]: unknown;
}

export interface EnrichedQuoteRow extends ParsedQuoteRow {
  safe_classification_tag: ClassificationTag;
  safe_counts_toward_total: boolean;
  safe_classification_reason: string;
  safe_classification_confidence: ClassificationConfidence;
  safe_rule_applied: string | null;
}

export interface MissingExtractedLine {
  type: 'missing_extracted_line';
  description: string;
  expected_total: number;
  reason: string;
  confidence: 'high';
}

export interface ClassificationSummary {
  parsed_total_all_rows: number;
  main_scope_total: number;
  summary_only_total: number;
  optional_scope_total: number;
  review_required_total: number;
  missing_extracted_total: number;
  reconstructed_total: number;
  document_total: number | null;
  variance_to_document_total: number | null;
  counts: {
    main_scope: number;
    summary_only: number;
    optional_scope: number;
    review_required: number;
    missing_extracted_line: number;
  };
}

export interface ClassificationResult {
  enrichedRows: EnrichedQuoteRow[];
  missingLines: MissingExtractedLine[];
  summary: ClassificationSummary;
}

// Patterns that identify a rollup/total row in lump-sum (non-passive-fire) quotes.
// These rows duplicate the sum of the individual breakdown items and must be excluded.
const LUMP_SUM_TOTAL_PATTERNS: RegExp[] = [
  /^total$/i,
  /^grand total$/i,
  /^sub.?total$/i,
  /^total price$/i,
  /^total amount$/i,
  /^contract sum$/i,
  /^final contract sum/i,
  /^total contract/i,
  /^total \(excl/i,
  /^total \(inc/i,
  /^total ex gst$/i,
  /^total incl\.? gst$/i,
  /^lump sum total$/i,
  /^quote total$/i,
  /^project total$/i,
];

export const GFLOBAL_KNOWN_MISSING_LINES: MissingExtractedLine[] = [
  {
    type: 'missing_extracted_line',
    description: 'Unit Entry - Cable Bundle (Data)* 20mm -/30/30 13mm (min.) GIB Wall',
    expected_total: 4077.00,
    reason: 'Multi-line item split at 2500-char chunk boundary — description on chunk N tail, numbers on chunk N+1 head',
    confidence: 'high',
  },
  {
    type: 'missing_extracted_line',
    description: 'Unit Entry - Cable Bundle (Data)* 20mm -/30/30 Concrete Wall',
    expected_total: 1041.90,
    reason: 'Multi-line item split at 2500-char chunk boundary — description on chunk N tail, numbers on chunk N+1 head',
    confidence: 'high',
  },
  {
    type: 'missing_extracted_line',
    description: 'Unit Entry - Cable Bundle (Data)* 20mm -/60/60 13mm (min.) GIB Wall',
    expected_total: 285.50,
    reason: 'Multi-line item split at 2500-char chunk boundary — description on chunk N tail, numbers on chunk N+1 head',
    confidence: 'high',
  },
];

const PASSIVE_FIRE_TRADE = 'passive_fire';

function classifyRow(
  row: ParsedQuoteRow,
  options: ClassificationOptions
): Omit<EnrichedQuoteRow, keyof ParsedQuoteRow> {
  const description = String(row.description ?? '');
  const qty = Number(row.quantity ?? 0);
  const rate = Number(row.unit_price ?? 0);
  const total = Number(row.total_price ?? 0);
  const trade = options.trade ?? PASSIVE_FIRE_TRADE;

  const summaryPhrases = options.summaryPhrases ?? DEFAULT_SUMMARY_PHRASES;
  const optionalFamilies = options.optionalFamilies ?? DEFAULT_OPTIONAL_FAMILIES;

  // For non-passive-fire trades (plumbing, HVAC, active fire, etc.) use a
  // simpler lump-sum classification: any priced item is main scope unless
  // it is a known rollup/total row that would double-count the breakdown.
  if (trade !== PASSIVE_FIRE_TRADE) {
    if (total <= 0) {
      return {
        safe_classification_tag: 'review_required',
        safe_counts_toward_total: false,
        safe_classification_reason: 'No total price — cannot classify',
        safe_classification_confidence: 'low',
        safe_rule_applied: 'no_price',
      };
    }
    const lower = description.toLowerCase().trim();
    const isTotalRow = LUMP_SUM_TOTAL_PATTERNS.some(p => p.test(lower));
    if (isTotalRow) {
      return {
        safe_classification_tag: 'summary_only',
        safe_counts_toward_total: false,
        safe_classification_reason: `Matches total/rollup pattern: "${description}"`,
        safe_classification_confidence: 'high',
        safe_rule_applied: 'lump_sum_total_pattern',
      };
    }
    const summaryMatch = matchesSummaryPhrase(description, summaryPhrases);
    if (summaryMatch.matched) {
      return {
        safe_classification_tag: 'summary_only',
        safe_counts_toward_total: false,
        safe_classification_reason: `Matches summary phrase: "${summaryMatch.phrase}"`,
        safe_classification_confidence: 'high',
        safe_rule_applied: 'summary_phrase_match',
      };
    }
    return {
      safe_classification_tag: 'main_scope',
      safe_counts_toward_total: true,
      safe_classification_reason: 'Priced line item for non-passive-fire trade',
      safe_classification_confidence: 'high',
      safe_rule_applied: 'trade_lump_sum',
    };
  }

  // Passive fire classification — strict signal-based rules follow
  const signals = matchesDetailSignals(description, qty, rate, total);

  // RULE 1 — SUMMARY ONLY
  const summaryMatch = matchesSummaryPhrase(description, summaryPhrases);
  if (summaryMatch.matched && (!signals.hasPricingStructure || summaryMatch.excludeEvenWhenPriced)) {
    return {
      safe_classification_tag: 'summary_only',
      safe_counts_toward_total: false,
      safe_classification_reason: `Matches summary phrase: "${summaryMatch.phrase}"`,
      safe_classification_confidence: 'high',
      safe_rule_applied: 'summary_phrase_match',
    };
  }

  // RULE 2 — OPTIONAL SCOPE
  const optionalMatch = matchesOptionalFamily(description, optionalFamilies);
  if (optionalMatch.matched) {
    return {
      safe_classification_tag: 'optional_scope',
      safe_counts_toward_total: false,
      safe_classification_reason: `Belongs to optional family: "${optionalMatch.familyName}"`,
      safe_classification_confidence: 'high',
      safe_rule_applied: 'optional_family_match',
    };
  }

  // RULE 3 — MAIN SCOPE (requires pricing + at least 1 non-pricing detail signal;
  // FRR alone is highly specific to passive fire and sufficient on its own)
  const nonPricingSignalCount = [
    signals.hasFRR,
    signals.hasSubstrate,
    signals.hasMeasurableElement,
    signals.hasServiceType,
  ].filter(Boolean).length;

  const threshold = signals.hasFRR ? 1 : 2;

  if (signals.hasPricingStructure && nonPricingSignalCount >= threshold) {
    const confidence: ClassificationConfidence = nonPricingSignalCount >= 3 ? 'high' : 'medium';
    const matchedSignals = [
      signals.hasFRR ? 'FRR pattern' : null,
      signals.hasSubstrate ? 'substrate' : null,
      signals.hasMeasurableElement ? 'measurable element' : null,
      signals.hasServiceType ? 'service type' : null,
      'pricing structure',
    ]
      .filter(Boolean)
      .join(', ');

    return {
      safe_classification_tag: 'main_scope',
      safe_counts_toward_total: true,
      safe_classification_reason: `Matched detail signals: ${matchedSignals}`,
      safe_classification_confidence: confidence,
      safe_rule_applied: 'detail_signal_match',
    };
  }

  // RULE 4 — REVIEW REQUIRED (failsafe — no guessing)
  return {
    safe_classification_tag: 'review_required',
    safe_counts_toward_total: false,
    safe_classification_reason: `Insufficient detail signals to classify confidently (non-pricing signals matched: ${nonPricingSignalCount}/3, pricing: ${signals.hasPricingStructure})`,
    safe_classification_confidence: 'low',
    safe_rule_applied: 'fallback_review_required',
  };
}

export function classifyParsedQuoteRows(
  rows: ParsedQuoteRow[],
  options: ClassificationOptions = {},
  missingLines: MissingExtractedLine[] = [],
  documentTotal: number | null = null
): ClassificationResult {
  const enrichedRows: EnrichedQuoteRow[] = rows.map(row => {
    const classification = classifyRow(row, options);
    return {
      ...row,
      ...classification,
    };
  });

  const summary = buildSummary(enrichedRows, missingLines, documentTotal);

  return {
    enrichedRows,
    missingLines,
    summary,
  };
}

export function getSafeMainScopeRows(enrichedRows: EnrichedQuoteRow[]): EnrichedQuoteRow[] {
  return enrichedRows.filter(r => r.safe_counts_toward_total === true);
}

export function getSafeQuotedTotal(enrichedRows: EnrichedQuoteRow[]): number {
  return getSafeMainScopeRows(enrichedRows).reduce(
    (sum, r) => sum + Number(r.total_price ?? 0),
    0
  );
}

export function getSafeAdjustmentSummary(
  enrichedRows: EnrichedQuoteRow[],
  missingLines: MissingExtractedLine[] = [],
  documentTotal: number | null = null
): ClassificationSummary {
  return buildSummary(enrichedRows, missingLines, documentTotal);
}

function buildSummary(
  enrichedRows: EnrichedQuoteRow[],
  missingLines: MissingExtractedLine[],
  documentTotal: number | null
): ClassificationSummary {
  const parsedTotalAllRows = enrichedRows.reduce(
    (sum, r) => sum + Number(r.total_price ?? 0),
    0
  );

  const mainScopeRows = enrichedRows.filter(r => r.safe_classification_tag === 'main_scope');
  const summaryOnlyRows = enrichedRows.filter(r => r.safe_classification_tag === 'summary_only');
  const optionalScopeRows = enrichedRows.filter(r => r.safe_classification_tag === 'optional_scope');
  const reviewRequiredRows = enrichedRows.filter(r => r.safe_classification_tag === 'review_required');

  const mainScopeTotal = mainScopeRows.reduce((sum, r) => sum + Number(r.total_price ?? 0), 0);
  const summaryOnlyTotal = summaryOnlyRows.reduce((sum, r) => sum + Number(r.total_price ?? 0), 0);
  const optionalScopeTotal = optionalScopeRows.reduce((sum, r) => sum + Number(r.total_price ?? 0), 0);
  const reviewRequiredTotal = reviewRequiredRows.reduce((sum, r) => sum + Number(r.total_price ?? 0), 0);
  const missingExtractedTotal = missingLines.reduce((sum, m) => sum + m.expected_total, 0);

  const reconstructedTotal = mainScopeTotal + missingExtractedTotal;

  const varianceToDocumentTotal =
    documentTotal != null ? reconstructedTotal - documentTotal : null;

  return {
    parsed_total_all_rows: round2(parsedTotalAllRows),
    main_scope_total: round2(mainScopeTotal),
    summary_only_total: round2(summaryOnlyTotal),
    optional_scope_total: round2(optionalScopeTotal),
    review_required_total: round2(reviewRequiredTotal),
    missing_extracted_total: round2(missingExtractedTotal),
    reconstructed_total: round2(reconstructedTotal),
    document_total: documentTotal,
    variance_to_document_total:
      varianceToDocumentTotal != null ? round2(varianceToDocumentTotal) : null,
    counts: {
      main_scope: mainScopeRows.length,
      summary_only: summaryOnlyRows.length,
      optional_scope: optionalScopeRows.length,
      review_required: reviewRequiredRows.length,
      missing_extracted_line: missingLines.length,
    },
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
