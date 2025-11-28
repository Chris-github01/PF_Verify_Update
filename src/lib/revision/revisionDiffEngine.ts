/**
 * Revision Diff Engine
 *
 * Compares two quote versions and generates detailed change reports
 */

import type { QuoteRevisionDiff, RevisionDiffItem } from '../../types/revision.types';

interface LineItem {
  id?: string;
  description: string;
  quantity?: number;
  unit?: string;
  rate?: number;
  total?: number;
  specifications?: string;
  system?: string;
  [key: string]: any;
}

interface QuoteData {
  id: string;
  supplier_name: string;
  revision_number: number;
  total_price: number;
  line_items: LineItem[];
}

/**
 * Calculate percentage change
 */
function calculatePercentChange(oldValue: number, newValue: number): number {
  if (oldValue === 0) return newValue === 0 ? 0 : 100;
  return ((newValue - oldValue) / oldValue) * 100;
}

/**
 * Normalize description for matching
 */
function normalizeDescription(desc: string): string {
  return desc
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '');
}

/**
 * Calculate similarity score between two descriptions
 */
function calculateSimilarity(desc1: string, desc2: string): number {
  const norm1 = normalizeDescription(desc1);
  const norm2 = normalizeDescription(desc2);

  if (norm1 === norm2) return 1.0;

  // Simple word overlap similarity
  const words1 = new Set(norm1.split(' '));
  const words2 = new Set(norm2.split(' '));

  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * Find best matching item from new items
 */
function findBestMatch(
  originalItem: LineItem,
  newItems: LineItem[],
  threshold: number = 0.7
): { item: LineItem; score: number } | null {
  let bestMatch: LineItem | null = null;
  let bestScore = 0;

  for (const newItem of newItems) {
    const score = calculateSimilarity(originalItem.description, newItem.description);
    if (score > bestScore && score >= threshold) {
      bestScore = score;
      bestMatch = newItem;
    }
  }

  return bestMatch ? { item: bestMatch, score: bestScore } : null;
}

/**
 * Check if two items have meaningful differences
 */
function hasSignificantChanges(originalItem: LineItem, newItem: LineItem): boolean {
  const quantityChanged = Math.abs((originalItem.quantity || 0) - (newItem.quantity || 0)) > 0.01;
  const rateChanged = Math.abs((originalItem.rate || 0) - (newItem.rate || 0)) > 0.01;
  const totalChanged = Math.abs((originalItem.total || 0) - (newItem.total || 0)) > 0.01;
  const specChanged = originalItem.specifications !== newItem.specifications;

  return quantityChanged || rateChanged || totalChanged || specChanged;
}

/**
 * Generate diff between original and new quote
 */
export async function generateQuoteDiff(
  originalQuote: QuoteData,
  newQuote: QuoteData,
  projectId: string
): Promise<QuoteRevisionDiff> {
  const diffItems: RevisionDiffItem[] = [];
  const matchedNewItems = new Set<string>();

  // Process original items to find modifications and removals
  for (const originalItem of originalQuote.line_items) {
    const match = findBestMatch(originalItem, newQuote.line_items);

    if (match && match.score >= 0.7) {
      // Item exists in both versions - check for modifications
      const newItem = match.item;
      matchedNewItems.add(newItem.id || newItem.description);

      if (hasSignificantChanges(originalItem, newItem)) {
        // Item was modified
        const quantityChange = (newItem.quantity || 0) - (originalItem.quantity || 0);
        const rateChange = (newItem.rate || 0) - (originalItem.rate || 0);
        const totalChange = (newItem.total || 0) - (originalItem.total || 0);

        diffItems.push({
          item_id: newItem.id,
          description: newItem.description,
          change_type: 'modified',

          original_quantity: originalItem.quantity,
          original_unit: originalItem.unit,
          original_rate: originalItem.rate,
          original_total: originalItem.total,
          original_specifications: originalItem.specifications,

          new_quantity: newItem.quantity,
          new_unit: newItem.unit,
          new_rate: newItem.rate,
          new_total: newItem.total,
          new_specifications: newItem.specifications,

          quantity_change: quantityChange,
          quantity_change_percent: calculatePercentChange(originalItem.quantity || 0, newItem.quantity || 0),
          rate_change: rateChange,
          rate_change_percent: calculatePercentChange(originalItem.rate || 0, newItem.rate || 0),
          total_change: totalChange,
          total_change_percent: calculatePercentChange(originalItem.total || 0, newItem.total || 0)
        });
      } else {
        // Item unchanged
        diffItems.push({
          item_id: newItem.id,
          description: newItem.description,
          change_type: 'unchanged',
          original_quantity: originalItem.quantity,
          original_unit: originalItem.unit,
          original_rate: originalItem.rate,
          original_total: originalItem.total,
          new_quantity: newItem.quantity,
          new_unit: newItem.unit,
          new_rate: newItem.rate,
          new_total: newItem.total
        });
      }
    } else {
      // Item was removed
      diffItems.push({
        item_id: originalItem.id,
        description: originalItem.description,
        change_type: 'removed',
        original_quantity: originalItem.quantity,
        original_unit: originalItem.unit,
        original_rate: originalItem.rate,
        original_total: originalItem.total,
        original_specifications: originalItem.specifications
      });
    }
  }

  // Find added items (items in new quote that weren't matched)
  for (const newItem of newQuote.line_items) {
    const itemKey = newItem.id || newItem.description;
    if (!matchedNewItems.has(itemKey)) {
      diffItems.push({
        item_id: newItem.id,
        description: newItem.description,
        change_type: 'added',
        new_quantity: newItem.quantity,
        new_unit: newItem.unit,
        new_rate: newItem.rate,
        new_total: newItem.total,
        new_specifications: newItem.specifications
      });
    }
  }

  // Calculate summary statistics
  const addedCount = diffItems.filter(item => item.change_type === 'added').length;
  const removedCount = diffItems.filter(item => item.change_type === 'removed').length;
  const modifiedCount = diffItems.filter(item => item.change_type === 'modified').length;
  const unchangedCount = diffItems.filter(item => item.change_type === 'unchanged').length;

  const totalPriceChange = newQuote.total_price - originalQuote.total_price;
  const totalPriceChangePercent = calculatePercentChange(originalQuote.total_price, newQuote.total_price);

  return {
    id: crypto.randomUUID(),
    project_id: projectId,
    supplier_name: originalQuote.supplier_name,
    original_quote_id: originalQuote.id,
    new_quote_id: newQuote.id,
    original_revision_number: originalQuote.revision_number,
    new_revision_number: newQuote.revision_number,

    total_price_change: totalPriceChange,
    total_price_change_percent: totalPriceChangePercent,
    items_added_count: addedCount,
    items_removed_count: removedCount,
    items_modified_count: modifiedCount,
    items_unchanged_count: unchangedCount,

    diff_items: diffItems,

    created_at: new Date().toISOString()
  };
}

/**
 * Compute diff and save to database
 */
export async function computeAndSaveDiff(
  originalQuoteId: string,
  newQuoteId: string,
  supabase: any
): Promise<QuoteRevisionDiff> {
  // Fetch both quotes with their line items
  const { data: originalQuote, error: origError } = await supabase
    .from('quotes')
    .select(`
      id,
      supplier_name,
      revision_number,
      total_price,
      project_id,
      line_items (*)
    `)
    .eq('id', originalQuoteId)
    .single();

  if (origError) throw new Error(`Failed to fetch original quote: ${origError.message}`);

  const { data: newQuote, error: newError } = await supabase
    .from('quotes')
    .select(`
      id,
      supplier_name,
      revision_number,
      total_price,
      project_id,
      line_items (*)
    `)
    .eq('id', newQuoteId)
    .single();

  if (newError) throw new Error(`Failed to fetch new quote: ${newError.message}`);

  // Generate diff
  const diff = await generateQuoteDiff(
    {
      ...originalQuote,
      line_items: originalQuote.line_items || []
    },
    {
      ...newQuote,
      line_items: newQuote.line_items || []
    },
    originalQuote.project_id
  );

  // Save diff to database
  const { error: saveError } = await supabase
    .from('quote_revisions_diff')
    .insert({
      project_id: diff.project_id,
      supplier_name: diff.supplier_name,
      original_quote_id: diff.original_quote_id,
      new_quote_id: diff.new_quote_id,
      diff_data: { diff_items: diff.diff_items },
      total_price_change: diff.total_price_change,
      total_price_change_percent: diff.total_price_change_percent,
      items_added_count: diff.items_added_count,
      items_removed_count: diff.items_removed_count,
      items_modified_count: diff.items_modified_count,
      created_by: (await supabase.auth.getUser()).data.user?.id
    });

  if (saveError) {
    console.error('Failed to save diff:', saveError);
  }

  return diff;
}
