export type ConsensusSource =
  | 'labelled_main'
  | 'grand_minus_optional'
  | 'labelled_grand_only'
  | 'classified_row_sum'
  | 'raw_row_sum'
  | 'needs_review';

export type ConsensusConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface ConsensusTotals {
  main_total: number;
  optional_total: number;
  grand_total: number;
  source: ConsensusSource;
  confidence: ConsensusConfidence;
  requires_review: boolean;
  notes?: string;
}

interface QuoteShape {
  total_amount?: number | null;
  quoted_total?: number | null;
  document_total?: number | null;
  document_grand_total?: number | null;
  document_sub_total?: number | null;
  labelled_main_total?: number | null;
  resolved_total?: number | null;
  resolution_source?: string | null;
  resolution_confidence?: string | null;
  main_scope_total?: number | null;
  optional_scope_total?: number | null;
  original_line_items_total?: number | null;
  requires_review?: boolean | null;
}

interface ItemShape {
  description?: string | null;
  raw_description?: string | null;
  scope_category?: string | null;
  is_excluded?: boolean | null;
  total_price?: number | null;
  unit?: string | null;
}

const OPTIONAL_SCOPE = 'optional';
const LS_UNITS = new Set(['LS', 'LUMP SUM', 'L.S.', 'SUM', 'LUMPSUM']);

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
function pos(v: unknown): number {
  const n = num(v);
  return n !== null && n > 0 ? n : 0;
}

function isOptionalItem(item: ItemShape): boolean {
  const scope = (item.scope_category || '').toLowerCase();
  if (scope === OPTIONAL_SCOPE) return true;
  if (item.is_excluded) return true;
  return false;
}
function isClassified(item: ItemShape): boolean {
  return Boolean(item.scope_category);
}

/**
 * Build a consensus totals object using the strict documented precedence:
 *
 *   1. Explicit labelled totals in quote
 *        - quote.labelled_main_total, or
 *        - quote.main_scope_total when it came from a labelled source, or
 *        - quote.document_sub_total
 *      -> main_total = labelled main; grand = main + optional (labelled or summed)
 *
 *   2. Grand total minus optionals
 *      - quote.document_grand_total (or document_total / quoted_total) is present,
 *        and a labelled optional total exists (optional_scope_total)
 *      -> main_total = grand - optional
 *
 *   3. Classified row sums
 *      - items carry scope_category ("Main" | "Optional" | "Excluded")
 *      -> main = sum(main rows); optional = sum(optional rows); grand = main + optional
 *
 *   4. Raw row_sum fallback
 *      - no classification, no labels -> main = sum(all total_price); optional = 0
 *
 *   Fallback: needs_review with zeros.
 *
 * This function is READ-ONLY. It never writes back.
 */
export function buildConsensusTotals(
  quote: QuoteShape,
  items: ItemShape[] = [],
): ConsensusTotals {
  const classifiedItems = items.filter(isClassified);
  const mainRows = classifiedItems.filter((i) => !isOptionalItem(i));
  const optionalRows = classifiedItems.filter(isOptionalItem);
  const summedMain = mainRows.reduce((s, i) => s + pos(i.total_price), 0);
  const summedOptional = optionalRows.reduce((s, i) => s + pos(i.total_price), 0);
  const rawSum = items.reduce((s, i) => s + pos(i.total_price), 0);

  const labelledMain =
    pos(quote.labelled_main_total) ||
    (quote.resolution_source === 'consensus[labelled-main]' ? pos(quote.main_scope_total) : 0) ||
    pos(quote.document_sub_total);

  const labelledGrand =
    pos(quote.document_grand_total) ||
    pos(quote.document_total) ||
    pos(quote.quoted_total);

  const labelledOptional = pos(quote.optional_scope_total);

  // ---------------------------------------------------------------
  // Priority 1: Explicit labelled main total
  // ---------------------------------------------------------------
  if (labelledMain > 0) {
    const optional = labelledOptional || summedOptional;
    const grand = labelledGrand > 0 ? labelledGrand : labelledMain + optional;
    return {
      main_total: round2(labelledMain),
      optional_total: round2(optional),
      grand_total: round2(grand),
      source: 'labelled_main',
      confidence: 'HIGH',
      requires_review: false,
      notes: 'Priority 1: labelled main total used directly.',
    };
  }

  // ---------------------------------------------------------------
  // Priority 2: Grand total minus labelled optionals
  // ---------------------------------------------------------------
  if (labelledGrand > 0 && labelledOptional > 0) {
    const main = Math.max(0, labelledGrand - labelledOptional);
    return {
      main_total: round2(main),
      optional_total: round2(labelledOptional),
      grand_total: round2(labelledGrand),
      source: 'grand_minus_optional',
      confidence: 'HIGH',
      requires_review: false,
      notes: 'Priority 2: main = labelled grand − labelled optional.',
    };
  }

  // Sub-case of priority 2: labelled grand present but no labelled optional.
  // We still prefer the labelled grand over row sums, but confidence is MEDIUM
  // and main is inferred from summed optional (which may be 0).
  if (labelledGrand > 0) {
    const optional = summedOptional;
    const main = Math.max(0, labelledGrand - optional);
    return {
      main_total: round2(main),
      optional_total: round2(optional),
      grand_total: round2(labelledGrand),
      source: 'labelled_grand_only',
      confidence: 'MEDIUM',
      requires_review: false,
      notes: 'Priority 2 (partial): labelled grand − summed optional.',
    };
  }

  // ---------------------------------------------------------------
  // Priority 3: Classified row sums
  // ---------------------------------------------------------------
  if (classifiedItems.length > 0 && (summedMain > 0 || summedOptional > 0)) {
    const grand = summedMain + summedOptional;
    return {
      main_total: round2(summedMain),
      optional_total: round2(summedOptional),
      grand_total: round2(grand),
      source: 'classified_row_sum',
      confidence: summedMain > 0 ? 'MEDIUM' : 'LOW',
      requires_review: true,
      notes: 'Priority 3: summed classified Main/Optional rows.',
    };
  }

  // ---------------------------------------------------------------
  // Priority 4: Raw row_sum fallback
  // ---------------------------------------------------------------
  if (rawSum > 0) {
    return {
      main_total: round2(rawSum),
      optional_total: 0,
      grand_total: round2(rawSum),
      source: 'raw_row_sum',
      confidence: 'LOW',
      requires_review: true,
      notes: 'Priority 4: raw sum of all row totals — no classification/labels.',
    };
  }

  return {
    main_total: 0,
    optional_total: 0,
    grand_total: 0,
    source: 'needs_review',
    confidence: 'LOW',
    requires_review: true,
    notes: 'No usable totals. Manual review required.',
  };
}

export function isLumpSumItem(item: ItemShape): boolean {
  const unit = String(item.unit || '').toUpperCase().trim();
  return LS_UNITS.has(unit);
}

/**
 * Non-destructive display filter. Does NOT delete rows.
 */
export function filterItemsForDisplay(items: ItemShape[]): ItemShape[] {
  const itemised = items.filter((i) => !isLumpSumItem(i));
  if (itemised.length > 0) return itemised;
  return items;
}

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}
