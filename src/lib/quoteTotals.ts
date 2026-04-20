export type TotalsSource = 'labelled' | 'row_sum' | 'fallback';

export interface TotalsResolution {
  total: number;
  source: TotalsSource;
  verified: boolean;
  label: 'Totals Verified' | 'Needs Review';
  tone: 'green' | 'amber';
}

interface QuoteLike {
  total_amount?: number | null;
  quoted_total?: number | null;
  document_total?: number | null;
  resolved_total?: number | null;
  resolution_confidence?: string | null;
  main_scope_total?: number | null;
}

const OPTIONAL_KEYWORDS = [
  'optional',
  'variation',
  'extra over',
  'extra-over',
  'alternate',
  'alternative',
  'provisional sum',
  'p.s.',
  ' ps ',
  'exclusion',
  'excluded',
  'add on',
  'add-on',
  'if required',
];

interface ItemLike {
  description?: string | null;
  raw_description?: string | null;
  scope_category?: string | null;
  is_excluded?: boolean | null;
  quantity?: number | null;
  unit_price?: number | null;
  total_price?: number | null;
}

export function isOptionalRow(item: ItemLike): boolean {
  if ((item.scope_category || '').toLowerCase() === 'optional') return true;
  if (item.is_excluded) return true;
  const text = `${item.raw_description ?? ''} ${item.description ?? ''}`.toLowerCase();
  if (!text.trim()) return false;
  return OPTIONAL_KEYWORDS.some((kw) => text.includes(kw));
}

export function isSuspiciousQtyRate(item: ItemLike): boolean {
  const qty = Number(item.quantity ?? 0);
  const rate = Number(item.unit_price ?? 0);
  const total = Number(item.total_price ?? 0);
  if (qty !== 1) return false;
  if (rate <= 0 || total <= 0) return false;
  return Math.abs(rate - total) < 0.01 && total >= 1000;
}

export function resolveDisplayTotal(
  quote: QuoteLike,
  lineItemsTotal?: number,
): TotalsResolution {
  const labelled = toNum(quote.resolved_total) ?? toNum(quote.quoted_total) ?? toNum(quote.document_total);
  const rowSum = toNum(lineItemsTotal) ?? toNum(quote.main_scope_total) ?? toNum(quote.total_amount) ?? 0;
  const confidence = (quote.resolution_confidence || '').toUpperCase();

  if (labelled && labelled > 0) {
    const verified = confidence === 'HIGH' || confidence === 'MEDIUM' || confidence === '';
    const rowsMatchLabel = rowSum > 0 ? Math.abs(labelled - rowSum) / labelled < 0.02 : true;
    const isVerified = verified && rowsMatchLabel && confidence !== 'LOW';
    return {
      total: labelled,
      source: 'labelled',
      verified: isVerified,
      label: isVerified ? 'Totals Verified' : 'Needs Review',
      tone: isVerified ? 'green' : 'amber',
    };
  }

  if (rowSum > 0) {
    return {
      total: rowSum,
      source: 'row_sum',
      verified: false,
      label: 'Needs Review',
      tone: 'amber',
    };
  }

  return {
    total: 0,
    source: 'fallback',
    verified: false,
    label: 'Needs Review',
    tone: 'amber',
  };
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return n;
}
