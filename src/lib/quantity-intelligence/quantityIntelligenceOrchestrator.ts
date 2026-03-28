import { supabase } from '../supabase';
import { matchLineItems, type SupplierInput, type MatchedLineGroup } from './lineMatcher';
import { deriveReferenceQuantity, type ReferenceQuantityResult } from './referenceQuantityEngine';
import { buildSupplierAdjustments } from './supplierAdjustmentEngine';
import { scoreSuppliers, buildQuantityIntelligenceResult, type ScoredSupplier, type QuantityIntelligenceResult } from './quantityScoring';

export interface RunQuantityIntelligenceOptions {
  projectId: string;
  quoteIds: string[];
  comparisonName?: string;
  moduleKey?: string;
  userId: string;
}

export interface LoadedQuote {
  quoteId: string;
  supplierName: string;
  rawTotal: number;
  items: Array<{
    id: string;
    description: string;
    quantity: number | null;
    unit: string | null;
    unit_price: number | null;
    total_price: number | null;
    is_excluded: boolean;
  }>;
}

export async function loadQuoteItems(quoteIds: string[]): Promise<LoadedQuote[]> {
  if (quoteIds.length === 0) return [];

  const { data: quotes } = await supabase
    .from('quotes')
    .select('id, supplier_name, total_amount')
    .in('id', quoteIds);

  if (!quotes || quotes.length === 0) return [];

  const result: LoadedQuote[] = [];

  for (const q of quotes) {
    const { data: items } = await supabase
      .from('quote_items')
      .select('id, description, quantity, unit, unit_price, total_price, is_excluded')
      .eq('quote_id', q.id)
      .eq('is_excluded', false);

    result.push({
      quoteId: q.id,
      supplierName: q.supplier_name ?? 'Unknown Supplier',
      rawTotal: q.total_amount ?? 0,
      items: (items ?? []).map((item) => ({
        id: item.id,
        description: item.description ?? '',
        quantity: item.quantity ?? null,
        unit: item.unit ?? null,
        unit_price: item.unit_price ?? null,
        total_price: item.total_price ?? null,
        is_excluded: item.is_excluded ?? false,
      })),
    });
  }

  return result;
}

export async function runQuantityIntelligence(
  opts: RunQuantityIntelligenceOptions,
): Promise<QuantityIntelligenceResult | null> {
  const { projectId, quoteIds, comparisonName, moduleKey = 'general', userId } = opts;

  const loaded = await loadQuoteItems(quoteIds);
  if (loaded.length < 2) return null;

  const suppliers: SupplierInput[] = loaded.map((l) => ({
    quoteId: l.quoteId,
    supplierName: l.supplierName,
    items: l.items,
  }));

  const name = comparisonName ?? `QI Run — ${new Date().toLocaleDateString()}`;

  const { data: group, error: groupErr } = await supabase
    .from('quantity_comparison_groups')
    .insert({
      project_id: projectId,
      module_key: moduleKey,
      comparison_name: name,
      created_by: userId,
    })
    .select()
    .maybeSingle();

  if (groupErr || !group) return null;

  const matchedGroups = matchLineItems(suppliers);

  const referenceResults = new Map<string, ReferenceQuantityResult>();
  for (const g of matchedGroups) {
    referenceResults.set(g.normalizedKey, deriveReferenceQuantity(g));
  }

  await persistMatches(group.id, matchedGroups, referenceResults);

  const adjustments = buildSupplierAdjustments(suppliers, matchedGroups, referenceResults);
  const scored = scoreSuppliers(adjustments, matchedGroups, referenceResults);

  await persistAdjustments(group.id, scored);

  return buildQuantityIntelligenceResult(name, scored, matchedGroups, referenceResults);
}

async function persistMatches(
  groupId: string,
  groups: MatchedLineGroup[],
  referenceResults: Map<string, ReferenceQuantityResult>,
): Promise<void> {
  for (const g of groups) {
    const { data: lineMatch } = await supabase
      .from('quantity_line_matches')
      .insert({
        comparison_group_id: groupId,
        normalized_item_key: g.normalizedKey,
        canonical_description: g.canonicalDescription,
        unit: g.unit,
        match_confidence: g.matchConfidence,
        match_method: g.matchMethod,
      })
      .select()
      .maybeSingle();

    if (!lineMatch) continue;

    const svRows = g.supplierValues.map((sv) => ({
      line_match_id: lineMatch.id,
      supplier_quote_id: sv.quoteId,
      supplier_name: sv.supplierName,
      original_line_item_id: sv.originalItemId,
      original_description: sv.originalDescription,
      quantity: sv.quantity,
      unit_rate: sv.unitRate,
      total_value: sv.totalValue,
      included_flag: sv.included,
    }));

    if (svRows.length > 0) {
      await supabase.from('quantity_line_supplier_values').insert(svRows);
    }

    const ref = referenceResults.get(g.normalizedKey);
    if (ref) {
      await supabase.from('quantity_reference_analysis').insert({
        line_match_id: lineMatch.id,
        reference_quantity: ref.referenceQuantity,
        reference_method: ref.referenceMethod,
        highest_quantity: ref.highestQuantity,
        lowest_quantity: ref.lowestQuantity,
        quantity_spread_percent: ref.quantitySpreadPercent,
        outlier_flag: ref.outlierFlag,
        outlier_severity: ref.outlierSeverity,
        notes: ref.notes,
      });
    }
  }
}

async function persistAdjustments(groupId: string, scored: ScoredSupplier[]): Promise<void> {
  for (const s of scored) {
    await supabase.from('quantity_supplier_adjustments').upsert(
      {
        comparison_group_id: groupId,
        supplier_quote_id: s.quoteId,
        supplier_name: s.supplierName,
        raw_total: s.rawTotal,
        normalized_total: s.normalizedTotal,
        quantity_gap_value: s.quantityGapValue,
        completeness_score: s.completenessScore,
        competitiveness_score_raw: s.competitivenessScoreRaw,
        competitiveness_score_normalized: s.competitivenessScoreNormalized,
        underallowance_flag: s.underallowanceFlag,
        raw_rank: s.rawRank,
        normalized_rank: s.normalizedRank,
        matched_lines_count: s.matchedLinesCount,
        underallowed_lines_count: s.underallowedLinesCount,
      },
      { onConflict: 'comparison_group_id,supplier_quote_id' },
    );
  }
}

export async function getPreviousRuns(projectId: string): Promise<Array<{
  id: string;
  comparison_name: string;
  created_at: string;
  module_key: string;
}>> {
  const { data } = await supabase
    .from('quantity_comparison_groups')
    .select('id, comparison_name, created_at, module_key')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(20);
  return data ?? [];
}

export async function loadSavedRun(groupId: string): Promise<QuantityIntelligenceResult | null> {
  const { data: adjustments } = await supabase
    .from('quantity_supplier_adjustments')
    .select('*')
    .eq('comparison_group_id', groupId);

  const { data: matches } = await supabase
    .from('quantity_line_matches')
    .select(`
      id, normalized_item_key, canonical_description, unit, match_confidence, match_method,
      quantity_line_supplier_values(id, supplier_quote_id, supplier_name, original_line_item_id, original_description, quantity, unit_rate, total_value, included_flag),
      quantity_reference_analysis(id, reference_quantity, reference_method, highest_quantity, lowest_quantity, quantity_spread_percent, outlier_flag, outlier_severity, notes)
    `)
    .eq('comparison_group_id', groupId);

  const { data: group } = await supabase
    .from('quantity_comparison_groups')
    .select('comparison_name')
    .eq('id', groupId)
    .maybeSingle();

  if (!adjustments || !matches) return null;

  const matchedGroups: MatchedLineGroup[] = matches.map((m) => ({
    normalizedKey: m.normalized_item_key,
    canonicalDescription: m.canonical_description,
    unit: m.unit,
    matchMethod: m.match_method,
    matchConfidence: m.match_confidence,
    supplierValues: (m.quantity_line_supplier_values ?? []).map((sv: Record<string, unknown>) => ({
      quoteId: sv.supplier_quote_id as string,
      supplierName: sv.supplier_name as string,
      originalItemId: sv.original_line_item_id as string,
      originalDescription: sv.original_description as string,
      quantity: sv.quantity as number | null,
      unitRate: sv.unit_rate as number | null,
      totalValue: sv.total_value as number | null,
      included: sv.included_flag as boolean,
    })),
  }));

  const referenceResults = new Map<string, ReferenceQuantityResult>();
  for (const m of matches) {
    const ref = (m.quantity_reference_analysis as unknown as Record<string, unknown>[] | null)?.[0];
    if (ref) {
      referenceResults.set(m.normalized_item_key, {
        referenceQuantity: ref.reference_quantity as number | null,
        referenceMethod: ref.reference_method as 'median_supplier_qty' | 'highest_supplier_qty' | 'inconclusive',
        highestQuantity: ref.highest_quantity as number | null,
        lowestQuantity: ref.lowest_quantity as number | null,
        quantitySpreadPercent: ref.quantity_spread_percent as number | null,
        outlierFlag: ref.outlier_flag as boolean,
        outlierSeverity: ref.outlier_severity as 'none' | 'review' | 'major',
        notes: ref.notes as string,
        supplierOutliers: [],
      });
    }
  }

  const scored: ScoredSupplier[] = (adjustments ?? []).map((a) => ({
    quoteId: a.supplier_quote_id,
    supplierName: a.supplier_name,
    rawTotal: a.raw_total,
    normalizedTotal: a.normalized_total,
    quantityGapValue: a.quantity_gap_value,
    matchedLines: [],
    unmatchedRawTotal: 0,
    underallowanceFlag: a.underallowance_flag,
    matchedLinesCount: a.matched_lines_count,
    underallowedLinesCount: a.underallowed_lines_count,
    completenessScore: a.completeness_score,
    competitivenessScoreRaw: a.competitiveness_score_raw,
    competitivenessScoreNormalized: a.competitiveness_score_normalized,
    rawRank: a.raw_rank,
    normalizedRank: a.normalized_rank,
  }));

  return buildQuantityIntelligenceResult(
    group?.comparison_name ?? 'Saved Run',
    scored,
    matchedGroups,
    referenceResults,
  );
}
