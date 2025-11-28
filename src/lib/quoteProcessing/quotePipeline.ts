import { supabase } from '../supabase';
import { normaliseUnit, normaliseNumber, deriveRate, deriveTotal } from '../normaliser/unitNormaliser';
import { extractAttributes } from '../normaliser/attributeExtractor';
import { calculateConfidence } from '../normaliser/confidenceScorer';
import { matchLineToSystem } from '../mapping/systemMatcher';

interface QuoteItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  raw_description?: string;
  raw_unit?: string;
}

export async function runQuotePipeline({ quoteId }: { quoteId: string }): Promise<void> {
  try {
    await supabase
      .from('quotes')
      .update({
        status: 'processing',
        processing_started_at: new Date().toISOString(),
        processing_error: null,
      })
      .eq('id', quoteId);

    const { data: items, error: itemsError } = await supabase
      .from('line_items')
      .select('*')
      .eq('quote_id', quoteId)
      .eq('is_excluded', false);

    if (itemsError) throw itemsError;
    if (!items || items.length === 0) {
      throw new Error('No items found for this quote');
    }

    for (const item of items) {
      await processItem(item);
    }

    await supabase
      .from('quotes')
      .update({
        status: 'ready',
        processing_completed_at: new Date().toISOString(),
      })
      .eq('id', quoteId);

  } catch (error: any) {
    console.error('Quote pipeline error:', error);

    await supabase
      .from('quotes')
      .update({
        status: 'error',
        processing_error: error.message || 'Unknown error',
        processing_completed_at: new Date().toISOString(),
      })
      .eq('id', quoteId);

    throw error;
  }
}

async function processItem(item: QuoteItem): Promise<void> {
  const rawDescription = item.raw_description || item.description;
  const rawUnit = item.raw_unit || item.unit;

  const normalizedUnit = normaliseUnit(rawUnit);
  const normalizedQty = normaliseNumber(item.quantity);

  const attributes = extractAttributes(rawDescription);

  const confidence = calculateConfidence({
    description: rawDescription,
    unit: normalizedUnit,
    quantity: normalizedQty,
    attributes,
  });

  const systemMatch = matchLineToSystem({
    description: rawDescription,
    unit: normalizedUnit,
    attributes,
  });

  await supabase
    .from('line_items')
    .update({
      normalized_description: rawDescription.trim(),
      normalized_unit: normalizedUnit,
      canonical_unit: normalizedUnit,
      size: attributes.size,
      frr: attributes.frr,
      service: attributes.service,
      subclass: attributes.subclass,
      material: attributes.material,
      confidence: confidence.score,
      system_id: systemMatch.system_id,
      system_label: systemMatch.system_label,
      system_confidence: systemMatch.confidence,
      system_needs_review: systemMatch.needs_review,
      mapped_service_type: systemMatch.service_type,
      mapped_system: systemMatch.system,
      mapped_penetration: systemMatch.penetration,
      mapping_confidence: systemMatch.confidence,
      matched_factors: systemMatch.matched_factors,
      missed_factors: systemMatch.missed_factors,
    })
    .eq('id', item.id);
}

export async function runQuotePipelineForMany({
  quoteIds,
  projectId
}: {
  quoteIds?: string[];
  projectId: string;
}): Promise<void> {
  let targetIds: string[] = [];

  if (quoteIds && quoteIds.length > 0) {
    targetIds = quoteIds;
  } else {
    const { data: quotes } = await supabase
      .from('quotes')
      .select('id')
      .eq('project_id', projectId)
      .in('status', ['imported', 'pending', 'error']);

    targetIds = quotes?.map(q => q.id) || [];
  }

  if (targetIds.length === 0) {
    return;
  }

  for (const quoteId of targetIds) {
    try {
      await runQuotePipeline({ quoteId });
    } catch (error) {
      console.error(`Failed to process quote ${quoteId}:`, error);
    }
  }
}

export type QuoteStatus = 'imported' | 'processing' | 'ready' | 'error' | 'pending' | 'reviewed' | 'accepted' | 'rejected';

export function getStatusColor(status: QuoteStatus): string {
  switch (status) {
    case 'imported':
    case 'pending':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'processing':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'ready':
    case 'reviewed':
    case 'accepted':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'error':
    case 'rejected':
      return 'bg-red-100 text-red-800 border-red-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
}

export function getStatusLabel(status: QuoteStatus): string {
  switch (status) {
    case 'imported':
      return 'Imported';
    case 'processing':
      return 'Processing';
    case 'ready':
      return 'Ready';
    case 'error':
      return 'Error';
    case 'pending':
      return 'Pending';
    case 'reviewed':
      return 'Reviewed';
    case 'accepted':
      return 'Accepted';
    case 'rejected':
      return 'Rejected';
    default:
      return status;
  }
}
