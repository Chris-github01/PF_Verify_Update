import { supabase } from '../supabase';
import type { DashboardMode } from '../../App';
import type {
  QuoteIntelligenceAnalysis,
  RedFlag,
  CoverageGap,
  SystemDetected,
  SupplierInsight,
  NormalizedItem
} from '../../types/quoteIntelligence.types';

interface QuoteData {
  id: string;
  supplier_name: string;
  total_amount: number;
  items_count: number;
  quote_reference: string;
  status: string;
  quoted_total: number | null;
  contingency_amount: number | null;
  revision_number: number | null;
}

interface QuoteItemData {
  id: string;
  quote_id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  scope_category: string;
  is_excluded: boolean;
  system_id: string | null;
  system_label: string | null;
  confidence: number | null;
}

export async function analyzeQuoteIntelligenceHybrid(
  projectId: string,
  dashboardMode: DashboardMode = 'original',
  originalQuoteIdsForComparison?: string[]
): Promise<QuoteIntelligenceAnalysis> {
  console.log('🔍 [QuoteIntelligence] Starting analysis:', { projectId, dashboardMode, originalQuoteIdsForComparison });

  let quotesData: QuoteData[] = [];

  // When in revisions mode with original quotes selected for comparison
  if (dashboardMode === 'revisions' && originalQuoteIdsForComparison && originalQuoteIdsForComparison.length > 0) {
    // Fetch BOTH revision quotes AND selected original quotes
    const [revisionsResult, originalsResult] = await Promise.all([
      supabase
        .from('quotes')
        .select('*')
        .eq('project_id', projectId)
        .eq('is_selected', true)
        .gt('revision_number', 1),
      supabase
        .from('quotes')
        .select('*')
        .in('id', originalQuoteIdsForComparison)
    ]);

    if (revisionsResult.error) {
      throw new Error(`Failed to fetch revision quotes: ${revisionsResult.error.message}`);
    }
    if (originalsResult.error) {
      throw new Error(`Failed to fetch original quotes: ${originalsResult.error.message}`);
    }

    quotesData = [
      ...(revisionsResult.data as QuoteData[] || []),
      ...(originalsResult.data as QuoteData[] || [])
    ];

    console.log('📊 [QuoteIntelligence] Fetched revision quotes:', revisionsResult.data?.length);
    console.log('📊 [QuoteIntelligence] Fetched original quotes:', originalsResult.data?.length);
  } else {
    // Standard mode: just filter by dashboard mode and selected quotes
    let query = supabase
      .from('quotes')
      .select('*')
      .eq('project_id', projectId)
      .eq('is_latest', true)
      .eq('is_selected', true);

    if (dashboardMode === 'original') {
      query = query.eq('revision_number', 1);
    } else {
      query = query.gt('revision_number', 1);
    }

    console.log('🔍 [QuoteIntelligence] Query params:', {
      projectId,
      is_latest: true,
      is_selected: true,
      revision_number: dashboardMode === 'original' ? '= 1' : '> 1'
    });

    const { data: quotes, error: quotesError } = await query;

    if (quotesError) {
      console.error('❌ [QuoteIntelligence] Query error:', quotesError);
      throw new Error(`Failed to fetch quotes: ${quotesError.message}`);
    }

    quotesData = quotes as QuoteData[] || [];
    console.log('📊 [QuoteIntelligence] Fetched quotes:', quotes?.length);
    console.log('📋 [QuoteIntelligence] Quote details:', quotes?.map(q => ({
      id: q.id,
      supplier: q.supplier_name,
      revision: q.revision_number,
      is_latest: q.is_latest,
      items: q.items_count
    })));
  }

  if (quotesData.length === 0) {
    return createEmptyAnalysis(projectId, originalQuoteIdsForComparison);
  }

  const quoteIdList = quotesData.map(q => q.id);

  const { data: items, error: itemsError } = await supabase
    .from('quote_items')
    .select('*')
    .in('quote_id', quoteIdList)
    .eq('is_excluded', false);

  if (itemsError) {
    throw new Error(`Failed to fetch quote items: ${itemsError.message}`);
  }

  const itemsData = (items || []) as QuoteItemData[];

  const normalizedItems: NormalizedItem[] = quotesData.map(q => ({
    quoteId: q.id,
    supplierName: q.supplier_name,
    revisionNumber: q.revision_number ?? 1,
    quoteReference: q.quote_reference
  }));

  const redFlags = detectRedFlags(quotesData, itemsData);
  const coverageGaps = detectCoverageGaps(quotesData, itemsData);
  const systemsDetected = detectSystems(quotesData, itemsData);
  const supplierInsights = generateSupplierInsights(quotesData, itemsData);

  const coverageScore = calculateCoverageScore(quotesData, itemsData);
  const averageQualityScore = calculateQualityScore(itemsData);
  const bestValueSupplier = findBestValueSupplier(quotesData);
  const mostCompleteSupplier = findMostCompleteSupplier(quotesData, itemsData);

  return {
    projectId,
    quoteIds: originalQuoteIdsForComparison,
    quotesAnalyzed: quotesData.length,
    analyzedAt: new Date().toISOString(),
    summary: {
      totalRedFlags: redFlags.length,
      criticalIssues: redFlags.filter(f => f.severity === 'critical').length,
      coverageScore,
      averageQualityScore,
      bestValueSupplier,
      mostCompleteSupplier
    },
    redFlags,
    coverageGaps,
    systemsDetected,
    supplierInsights,
    normalizedItems
  };
}

function createEmptyAnalysis(projectId: string, quoteIds?: string[]): QuoteIntelligenceAnalysis {
  return {
    projectId,
    quoteIds,
    quotesAnalyzed: 0,
    analyzedAt: new Date().toISOString(),
    summary: {
      totalRedFlags: 0,
      criticalIssues: 0,
      coverageScore: 0,
      averageQualityScore: 0,
      bestValueSupplier: 'N/A',
      mostCompleteSupplier: 'N/A'
    },
    redFlags: [],
    coverageGaps: [],
    systemsDetected: [],
    supplierInsights: [],
    normalizedItems: []
  };
}

function detectRedFlags(quotes: QuoteData[], items: QuoteItemData[]): RedFlag[] {
  const flags: RedFlag[] = [];

  for (const quote of quotes) {
    const quoteItems = items.filter(i => i.quote_id === quote.id);

    const totalFromItems = quoteItems.reduce((sum, item) => sum + (item.total_price || 0), 0);
    const quotedTotal = quote.quoted_total || quote.total_amount || 0;
    const discrepancy = Math.abs(totalFromItems - quotedTotal);
    const discrepancyPercent = quotedTotal > 0 ? (discrepancy / quotedTotal) * 100 : 0;

    if (discrepancyPercent > 10) {
      flags.push({
        id: `price-discrepancy-${quote.id}`,
        quoteId: quote.id,
        severity: discrepancyPercent > 20 ? 'critical' : 'high',
        category: 'Pricing',
        title: 'Significant Price Discrepancy',
        description: `Quote total ($${quotedTotal.toLocaleString()}) differs from line items sum ($${totalFromItems.toLocaleString()}) by ${discrepancyPercent.toFixed(1)}%`,
        recommendation: 'Verify quoted total matches line items. Check for missing items or calculation errors.'
      });
    }

    if (quoteItems.length === 0) {
      flags.push({
        id: `no-items-${quote.id}`,
        quoteId: quote.id,
        severity: 'critical',
        category: 'Completeness',
        title: 'No Line Items',
        description: 'Quote contains no line items',
        recommendation: 'Ensure quote has been properly imported with all line items.'
      });
    }

    const itemsWithoutPrice = quoteItems.filter(i => !i.unit_price || i.unit_price === 0);
    if (itemsWithoutPrice.length > 0) {
      flags.push({
        id: `missing-prices-${quote.id}`,
        quoteId: quote.id,
        severity: itemsWithoutPrice.length > quoteItems.length * 0.1 ? 'high' : 'medium',
        category: 'Pricing',
        title: 'Items Missing Unit Prices',
        description: `${itemsWithoutPrice.length} items have no unit price specified`,
        recommendation: 'Request unit prices for all items to enable accurate comparison.'
      });
    }

    const lowConfidenceItems = quoteItems.filter(i => i.confidence !== null && i.confidence < 0.7);
    if (lowConfidenceItems.length > quoteItems.length * 0.2) {
      flags.push({
        id: `low-confidence-${quote.id}`,
        quoteId: quote.id,
        severity: 'medium',
        category: 'Data Quality',
        title: 'Poor Data Normalization Quality',
        description: `${Math.round((lowConfidenceItems.length / quoteItems.length) * 100)}% of items have low confidence scores`,
        recommendation: 'Review and manually correct items with low confidence scores for better comparison accuracy.'
      });
    }

    if (!quote.contingency_amount || quote.contingency_amount === 0) {
      flags.push({
        id: `no-contingency-${quote.id}`,
        quoteId: quote.id,
        severity: 'low',
        category: 'Commercial',
        title: 'No Contingency Specified',
        description: 'Quote does not include a contingency amount',
        recommendation: 'Confirm if contingency is included in pricing or needs to be added separately.'
      });
    }
  }

  return flags;
}

function detectCoverageGaps(quotes: QuoteData[], items: QuoteItemData[]): CoverageGap[] {
  const gaps: CoverageGap[] = [];

  if (quotes.length < 2) return gaps;

  const itemsByCategory = new Map<string, Map<string, Set<string>>>();

  for (const item of items) {
    const category = item.scope_category || 'Uncategorized';
    if (!itemsByCategory.has(category)) {
      itemsByCategory.set(category, new Map());
    }

    const categoryMap = itemsByCategory.get(category)!;
    if (!categoryMap.has(item.quote_id)) {
      categoryMap.set(item.quote_id, new Set());
    }
    categoryMap.get(item.quote_id)!.add(item.description.toLowerCase().trim());
  }

  for (const [category, quoteMap] of itemsByCategory) {
    const quoteIds = Array.from(quoteMap.keys());

    if (quoteIds.length < quotes.length) {
      const missingQuotes = quotes.filter(q => !quoteIds.includes(q.id));
      gaps.push({
        id: `missing-category-${category}`,
        gapType: 'Missing Category',
        title: `Category "${category}" not quoted by all suppliers`,
        description: `${missingQuotes.length} supplier(s) did not quote this category`,
        missingIn: missingQuotes.map(q => q.supplier_name),
        presentIn: quotes.filter(q => quoteIds.includes(q.id)).map(q => q.supplier_name),
        estimatedImpact: 0,
        recommendation: 'Request quotes for this category from suppliers who did not include it.'
      });
    }
  }

  return gaps;
}

function detectSystems(quotes: QuoteData[], items: QuoteItemData[]): SystemDetected[] {
  const systems: SystemDetected[] = [];
  const systemMap = new Map<string, { quoteId: string; items: QuoteItemData[] }>();

  for (const item of items) {
    if (item.system_label && item.system_id) {
      const key = `${item.quote_id}-${item.system_id}`;
      if (!systemMap.has(key)) {
        systemMap.set(key, { quoteId: item.quote_id, items: [] });
      }
      systemMap.get(key)!.items.push(item);
    }
  }

  for (const [key, { quoteId, items: systemItems }] of systemMap) {
    const totalValue = systemItems.reduce((sum, item) => sum + (item.total_price || 0), 0);
    const avgConfidence = systemItems.reduce((sum, item) => sum + (item.confidence || 0), 0) / systemItems.length;

    systems.push({
      id: key,
      quoteId,
      systemName: systemItems[0].system_label!,
      systemType: systemItems[0].system_id!.split('-')[0] || 'Unknown',
      itemCount: systemItems.length,
      totalValue,
      confidence: avgConfidence
    });
  }

  return systems.sort((a, b) => b.totalValue - a.totalValue);
}

function generateSupplierInsights(quotes: QuoteData[], items: QuoteItemData[]): SupplierInsight[] {
  const insights: SupplierInsight[] = [];

  for (const quote of quotes) {
    const quoteItems = items.filter(i => i.quote_id === quote.id);

    if (quoteItems.length === 0) continue;

    const avgUnitPrice = quoteItems.reduce((sum, i) => sum + (i.unit_price || 0), 0) / quoteItems.length;
    const completeness = (quoteItems.filter(i => i.unit_price > 0).length / quoteItems.length) * 100;

    if (completeness === 100) {
      insights.push({
        id: `complete-${quote.id}`,
        supplierName: quote.supplier_name,
        insightType: 'Positive',
        title: 'Complete Pricing',
        description: 'All items have unit prices specified, enabling full comparison.',
        recommendation: 'This supplier has provided comprehensive pricing information.'
      });
    }

    const categoriesCount = new Set(quoteItems.map(i => i.scope_category)).size;
    if (categoriesCount > 5) {
      insights.push({
        id: `comprehensive-${quote.id}`,
        supplierName: quote.supplier_name,
        insightType: 'Positive',
        title: 'Comprehensive Quote',
        description: `Quote covers ${categoriesCount} different scope categories.`,
        recommendation: 'This supplier has provided broad coverage across multiple work areas.'
      });
    }

    const systemsCovered = new Set(quoteItems.filter(i => i.system_id).map(i => i.system_id)).size;
    if (systemsCovered > 3) {
      insights.push({
        id: `systems-${quote.id}`,
        supplierName: quote.supplier_name,
        insightType: 'Positive',
        title: 'Multiple Systems Identified',
        description: `${systemsCovered} fire protection systems detected in quote.`,
        recommendation: 'Items have been successfully mapped to fire protection systems.'
      });
    }
  }

  return insights;
}

function calculateCoverageScore(quotes: QuoteData[], items: QuoteItemData[]): number {
  if (quotes.length === 0) return 0;

  const allCategories = new Set(items.map(i => i.scope_category || 'Uncategorized'));
  let totalCoverage = 0;

  for (const quote of quotes) {
    const quoteItems = items.filter(i => i.quote_id === quote.id);
    const quoteCategories = new Set(quoteItems.map(i => i.scope_category || 'Uncategorized'));
    const coverage = (quoteCategories.size / allCategories.size) * 100;
    totalCoverage += coverage;
  }

  return Math.round(totalCoverage / quotes.length);
}

function calculateQualityScore(items: QuoteItemData[]): number {
  if (items.length === 0) return 0;

  const itemsWithPrice = items.filter(i => i.unit_price > 0).length;
  const itemsWithSystem = items.filter(i => i.system_id).length;
  const avgConfidence = items.reduce((sum, i) => sum + (i.confidence || 0), 0) / items.length;

  const priceScore = (itemsWithPrice / items.length) * 40;
  const systemScore = (itemsWithSystem / items.length) * 30;
  const confidenceScore = avgConfidence * 30;

  return Math.round(priceScore + systemScore + confidenceScore);
}

function findBestValueSupplier(quotes: QuoteData[]): string {
  if (quotes.length === 0) return 'N/A';

  const lowestQuote = quotes.reduce((min, q) =>
    (q.total_amount < min.total_amount) ? q : min
  );

  return lowestQuote.supplier_name;
}

function findMostCompleteSupplier(quotes: QuoteData[], items: QuoteItemData[]): string {
  if (quotes.length === 0) return 'N/A';

  let bestQuote = quotes[0];
  let maxScore = 0;

  for (const quote of quotes) {
    const quoteItems = items.filter(i => i.quote_id === quote.id);
    const score = quoteItems.length +
                  quoteItems.filter(i => i.unit_price > 0).length * 2 +
                  quoteItems.filter(i => i.system_id).length;

    if (score > maxScore) {
      maxScore = score;
      bestQuote = quote;
    }
  }

  return bestQuote.supplier_name;
}
