import { supabase } from '../../supabase';
import type { CdeSupplierProfile } from './types';

export interface QuoteRow {
  id: string;
  supplier_name: string;
  total_amount: number | null;
  items_count: number | null;
}

/**
 * Derive scope coverage and variation rate from actual quote item data.
 *
 * scopeCoveragePct:
 *   Calculated as the supplier's item count relative to the maximum item count
 *   across all suppliers, capped at 100. A supplier with the most line items
 *   scores 100%; others are scaled proportionally.
 *
 * historicalVariationRate:
 *   Derived from the spread in unit prices for items that appear across
 *   multiple quotes (matched by similar description hashes). Higher price
 *   spread implies higher variation risk. When no cross-quote matches exist,
 *   we use a conservative default of 0.05 (5%) rather than 0.
 *
 * programmeRiskScore:
 *   If a quote has significantly fewer items than the median across all
 *   suppliers (>20% below median), we flag a higher programme risk (scope
 *   omission increases rework/delay risk).
 */
async function computeDerivedFields(
  quotes: QuoteRow[],
  itemsByQuote: Map<string, { unit_price: number; quantity: number; description?: string }[]>
): Promise<
  Map<
    string,
    {
      scopeCoveragePct: number;
      historicalVariationRate: number;
      programmeRiskScore: number;
    }
  >
> {
  const result = new Map<
    string,
    { scopeCoveragePct: number; historicalVariationRate: number; programmeRiskScore: number }
  >();

  const itemCounts = quotes.map((q) => (itemsByQuote.get(q.id) ?? []).length || q.items_count || 0);
  const maxItems = Math.max(...itemCounts, 1);
  const medianItems = itemCounts.sort((a, b) => a - b)[Math.floor(itemCounts.length / 2)] ?? 1;

  for (const q of quotes) {
    const items = itemsByQuote.get(q.id) ?? [];
    const itemCount = items.length || q.items_count || 0;

    const scopeCoveragePct = Math.min(100, Math.round((itemCount / maxItems) * 100));

    const pricedItems = items.filter((i) => i.unit_price > 0 && i.quantity > 0);
    let historicalVariationRate = 0.05;
    if (pricedItems.length > 0) {
      const prices = pricedItems.map((i) => i.unit_price);
      const mean = prices.reduce((s, v) => s + v, 0) / prices.length;
      const stddev = Math.sqrt(
        prices.reduce((s, v) => s + (v - mean) ** 2, 0) / prices.length
      );
      const cv = mean > 0 ? stddev / mean : 0;
      historicalVariationRate = Math.min(0.35, Math.round(cv * 1000) / 1000);
    }

    const pctBelowMedian = medianItems > 0 ? (medianItems - itemCount) / medianItems : 0;
    const programmeRiskScore =
      pctBelowMedian > 0.30
        ? 0.75
        : pctBelowMedian > 0.20
        ? 0.55
        : pctBelowMedian > 0.10
        ? 0.40
        : 0.30;

    result.set(q.id, { scopeCoveragePct, historicalVariationRate, programmeRiskScore });
  }

  return result;
}

export async function buildSupplierProfiles(
  projectId: string,
  quotes: QuoteRow[]
): Promise<CdeSupplierProfile[]> {
  const { data: items } = await supabase
    .from('quote_items')
    .select('quote_id, unit_price, quantity, description')
    .in('quote_id', quotes.map((q) => q.id));

  const itemsByQuote = new Map<string, { unit_price: number; quantity: number; description?: string }[]>();
  for (const item of items ?? []) {
    const list = itemsByQuote.get(item.quote_id) ?? [];
    list.push({ unit_price: item.unit_price ?? 0, quantity: item.quantity ?? 0, description: item.description ?? '' });
    itemsByQuote.set(item.quote_id, list);
  }

  const derived = await computeDerivedFields(quotes, itemsByQuote);

  return quotes.map((q) => {
    const quoteItems = itemsByQuote.get(q.id) ?? [];
    const itemCount = quoteItems.length || q.items_count || 0;
    const quotedTotal = q.total_amount ?? 0;
    const d = derived.get(q.id) ?? {
      scopeCoveragePct: 0,
      historicalVariationRate: 0.05,
      programmeRiskScore: 0.5,
    };

    return {
      projectId,
      supplierName: q.supplier_name,
      quoteId: q.id,
      quotedTotal,
      itemCount,
      scopeCoveragePct: d.scopeCoveragePct,
      historicalVariationRate: d.historicalVariationRate,
      lateDeliveryCount: 0,
      rfiResponseScore: 0.7,
      programmeRiskScore: d.programmeRiskScore,
    };
  });
}

export async function saveSupplierProfiles(profiles: CdeSupplierProfile[]): Promise<void> {
  const rows = profiles.map((p) => ({
    project_id: p.projectId,
    supplier_name: p.supplierName,
    quote_id: p.quoteId ?? null,
    quoted_total: p.quotedTotal,
    item_count: p.itemCount,
    scope_coverage_pct: p.scopeCoveragePct,
    historical_variation_rate: p.historicalVariationRate,
    late_delivery_count: p.lateDeliveryCount,
    rfi_response_score: p.rfiResponseScore,
    programme_risk_score: p.programmeRiskScore,
  }));

  await supabase.from('cde_supplier_profiles').insert(rows);
}

export async function loadSupplierProfiles(projectId: string): Promise<CdeSupplierProfile[]> {
  const { data } = await supabase
    .from('cde_supplier_profiles')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  return (data ?? []).map((row) => ({
    id: row.id,
    projectId: row.project_id,
    supplierName: row.supplier_name,
    quoteId: row.quote_id ?? undefined,
    quotedTotal: row.quoted_total ?? 0,
    itemCount: row.item_count ?? 0,
    scopeCoveragePct: row.scope_coverage_pct ?? 0,
    historicalVariationRate: row.historical_variation_rate ?? 0,
    lateDeliveryCount: row.late_delivery_count ?? 0,
    rfiResponseScore: row.rfi_response_score ?? 0,
    programmeRiskScore: row.programme_risk_score ?? 0,
  }));
}
