export type ConsensusSource =
  | 'parser_consensus'
  | 'labelled_total'
  | 'row_sum'
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

function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isOptionalItem(item: ItemShape): boolean {
  const scope = (item.scope_category || '').toLowerCase();
  if (scope === OPTIONAL_SCOPE) return true;
  if (item.is_excluded) return true;
  return false;
}

function normaliseConfidence(raw: string | null | undefined): ConsensusConfidence {
  const v = (raw || '').toUpperCase();
  if (v === 'HIGH') return 'HIGH';
  if (v === 'MEDIUM') return 'MEDIUM';
  if (v === 'LOW') return 'LOW';
  return 'MEDIUM';
}

/**
 * Build a consensus totals object from a quote row and (optionally) its items.
 *
 * Priority:
 *  1. Parser consensus (resolved_total + resolution_confidence set by edge function).
 *  2. Labelled total (document_grand_total / document_total / quoted_total).
 *  3. Row sum from items (MAIN scope only).
 *  4. Needs review fallback.
 *
 * This function is READ-ONLY. It never writes back to the database.
 */
export function buildConsensusTotals(
  quote: QuoteShape,
  items: ItemShape[] = [],
): ConsensusTotals {
  const mainItems = items.filter((i) => !isOptionalItem(i));
  const optionalItems = items.filter((i) => isOptionalItem(i));

  const rowMain = mainItems.reduce((s, i) => s + num(i.total_price), 0);
  const rowOptional = optionalItems.reduce((s, i) => s + num(i.total_price), 0);

  const resolved = num(quote.resolved_total);
  const labelled =
    num(quote.document_grand_total) ||
    num(quote.document_total) ||
    num(quote.quoted_total);
  const optionalScope = num(quote.optional_scope_total);
  const mainScope = num(quote.main_scope_total);

  if (resolved > 0) {
    const confidence = normaliseConfidence(quote.resolution_confidence);
    return {
      main_total: mainScope > 0 ? mainScope : resolved - optionalScope,
      optional_total: optionalScope || rowOptional,
      grand_total: resolved,
      source: 'parser_consensus',
      confidence,
      requires_review: confidence === 'LOW' || Boolean(quote.requires_review),
    };
  }

  if (labelled > 0) {
    return {
      main_total: mainScope > 0 ? mainScope : labelled - optionalScope,
      optional_total: optionalScope || rowOptional,
      grand_total: labelled,
      source: 'labelled_total',
      confidence: 'MEDIUM',
      requires_review: true,
      notes: 'Using labelled total; parser did not produce a consensus.',
    };
  }

  if (rowMain > 0) {
    return {
      main_total: rowMain,
      optional_total: rowOptional,
      grand_total: rowMain,
      source: 'row_sum',
      confidence: 'LOW',
      requires_review: true,
      notes: 'Total derived from line-item sum. Review before awarding.',
    };
  }

  return {
    main_total: 0,
    optional_total: 0,
    grand_total: 0,
    source: 'needs_review',
    confidence: 'LOW',
    requires_review: true,
    notes: 'No total available. Manual review required.',
  };
}

export function isLumpSumItem(item: ItemShape): boolean {
  const unit = String(item.unit || '').toUpperCase().trim();
  return LS_UNITS.has(unit);
}

/**
 * Non-destructive display filter. Does NOT delete rows.
 * Returns the subset of items that should be displayed in the Review table
 * while preserving the original array for audit.
 */
export function filterItemsForDisplay(items: ItemShape[]): ItemShape[] {
  const itemised = items.filter((i) => !isLumpSumItem(i));
  if (itemised.length > 0) return itemised;
  return items;
}
