import { supabase } from '../../supabase';
import type { CdeSupplierProfile } from './types';

export interface QuoteRow {
  id: string;
  supplier_name: string;
  total_amount: number | null;
  items_count: number | null;
}

export async function buildSupplierProfiles(
  projectId: string,
  quotes: QuoteRow[]
): Promise<CdeSupplierProfile[]> {
  const { data: items } = await supabase
    .from('quote_items')
    .select('quote_id, unit_price, quantity')
    .in('quote_id', quotes.map((q) => q.id));

  const itemsByQuote = new Map<string, { unit_price: number; quantity: number }[]>();
  for (const item of items ?? []) {
    const list = itemsByQuote.get(item.quote_id) ?? [];
    list.push(item);
    itemsByQuote.set(item.quote_id, list);
  }

  return quotes.map((q) => {
    const quoteItems = itemsByQuote.get(q.id) ?? [];
    const itemCount = quoteItems.length || q.items_count || 0;
    const quotedTotal = q.total_amount ?? 0;

    return {
      projectId,
      supplierName: q.supplier_name,
      quoteId: q.id,
      quotedTotal,
      itemCount,
      scopeCoveragePct: 0,
      historicalVariationRate: 0,
      lateDeliveryCount: 0,
      rfiResponseScore: 0.5,
      programmeRiskScore: 0.5,
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
