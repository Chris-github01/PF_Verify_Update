import { supabase } from '../supabase';
import type {
  BoqNormalisationResult,
  BoqNormalisationConfig,
  NormalizedPenetrationLine,
  DuplicationFlag,
  NormalizationAuditSummary,
  PenetrationSignature,
} from '../../types/boqNormalisation.types';
import {
  normalizeService,
  normalizeSize,
  normalizeFRL,
  normalizeSubstrate,
  classifyLineIntent,
  extractOrientationFromDescription,
  extractLocationClass,
  detectInsulationState,
  buildSignatureKey,
} from './normalisationRules';
import { groupBySignature, resolveGroup, buildRawInputFromQuoteItem } from './deduplicationEngine';
import { buildDuplicationFlags, buildAuditSummary } from './commercialFlags';
import { DEFAULT_BOQ_NORMALISATION_CONFIG } from '../../types/boqNormalisation.types';

export interface QuoteItemRow {
  id: string;
  quote_id: string;
  description: string;
  scope_category?: string | null;
  quantity: number;
  unit_price: number;
  total_price?: number | null;
  item_number?: number | null;
  service?: string | null;
  size?: string | null;
  material?: string | null;
  frr?: string | null;
  system_label?: string | null;
  subclass?: string | null;
  mapped_service_type?: string | null;
  mapped_system?: string | null;
}

export interface QuoteRow {
  id: string;
  supplier_name: string;
  trade?: string | null;
}

async function fetchQuoteItems(projectId: string, trade: string): Promise<{
  quotes: QuoteRow[];
  itemsByQuote: Map<string, QuoteItemRow[]>;
}> {
  const { data: quotes, error: quotesError } = await supabase
    .from('quotes')
    .select('id, supplier_name, trade')
    .eq('project_id', projectId)
    .eq('is_latest', true);

  if (quotesError) throw new Error(quotesError.message || 'Failed to fetch quotes');

  const filteredQuotes: QuoteRow[] = (quotes || []).filter(q =>
    !trade || !q.trade || q.trade.toLowerCase().replace(/[\s_]/g, '_').includes(trade.toLowerCase().replace(/[\s_]/g, '_'))
  );

  const itemsByQuote = new Map<string, QuoteItemRow[]>();

  for (const quote of filteredQuotes) {
    const { data: items, error: itemsError } = await supabase
      .from('quote_items')
      .select('id, quote_id, description, scope_category, quantity, unit_price, total_price, item_number, service, size, material, frr, system_label, subclass, mapped_service_type, mapped_system')
      .eq('quote_id', quote.id);

    if (itemsError) throw new Error(itemsError.message || 'Failed to fetch quote items');
    itemsByQuote.set(quote.id, items || []);
  }

  return { quotes: filteredQuotes, itemsByQuote };
}

function buildSignatureFromItem(item: QuoteItemRow, trade: string): PenetrationSignature {
  const desc = item.description || '';
  const serviceRaw = item.service || item.mapped_service_type || extractServiceFromDescription(desc);
  const service = normalizeService(serviceRaw);
  const size = normalizeSize(item.size || extractSizeFromDescription(desc));
  const frl = normalizeFRL(item.frr || extractFRLFromDescription(desc));
  const substrate = normalizeSubstrate(item.material || extractSubstrateFromDescription(desc));
  const orientation = extractOrientationFromDescription(desc);
  const locationClass = extractLocationClass(desc);
  const insulationState = detectInsulationState(desc);
  const intent = classifyLineIntent(desc, {
    item_type: item.subclass ?? undefined,
  });

  const sig: PenetrationSignature = {
    trade,
    service,
    serviceType: item.subclass || item.mapped_service_type || '',
    sizeNormalized: size,
    substrateNormalized: substrate,
    frlNormalized: frl,
    orientationNormalized: orientation,
    locationClass,
    insulationState,
    unitEntryFlag: intent === 'unit_entry_subset',
    optionalFlag: intent === 'optional_scope',
    extraOverFlag: desc.toLowerCase().includes('extra over') || desc.toLowerCase().includes('not shown'),
    provisionalFlag: intent === 'provisional_extra',
  };

  return sig;
}

function extractServiceFromDescription(desc: string): string {
  const patterns = [
    /fire alarm cable/i, /cable conduit/i, /conduit/i,
    /pex pipe/i, /pex/i, /copper pipe/i, /copper/i,
    /sprinkler pipe/i, /sprinkler/i, /fire main/i,
    /ductwork/i, /duct/i, /cable tray/i, /trunking/i,
    /mdpe/i,
  ];
  for (const p of patterns) {
    const match = desc.match(p);
    if (match) return match[0];
  }
  const words = desc.split(/\s+/).slice(0, 3).join(' ');
  return words;
}

function extractSizeFromDescription(desc: string): string {
  const match = desc.match(/\d+(?:\s*x\s*\d+)*\s*mm/i);
  return match ? match[0] : '';
}

function extractFRLFromDescription(desc: string): string {
  const match = desc.match(/(-|\d+)\/(-|\d+)\/(-|\d+)/);
  if (match) return match[0];
  if (/smoke wall/i.test(desc)) return 'Smoke Wall';
  if (/fire rated/i.test(desc)) return 'Fire Rated';
  return '';
}

function extractSubstrateFromDescription(desc: string): string {
  const patterns = [
    /concrete\s+(wall|floor|slab)/i,
    /gib\s+fyreline\s+wall\s+\d+\s*x\s*\d+mm/i,
    /gib\s+fyreline\s+(wall|ceiling)/i,
    /villaboard\s+\d+\s*x\s*\d+mm/i,
    /villaboard/i,
    /james\s+hardie/i,
    /masonry\s+(wall|floor)/i,
    /brick\s+wall/i,
    /timber\s+(floor|wall)/i,
    /steel\s+(floor|deck)/i,
    /plasterboard\s*(wall|ceiling)?/i,
  ];
  for (const p of patterns) {
    const match = desc.match(p);
    if (match) return match[0];
  }
  return '';
}

export async function runBoqNormalisation(
  projectId: string,
  trade: string,
  config: BoqNormalisationConfig = DEFAULT_BOQ_NORMALISATION_CONFIG
): Promise<BoqNormalisationResult> {
  if (!config.enableBoqNormalization) {
    throw new Error('BOQ Normalisation is disabled in config.');
  }

  const runId = `boq-norm-${Date.now()}`;
  const runAt = new Date().toISOString();

  const { quotes, itemsByQuote } = await fetchQuoteItems(projectId, trade);

  const normalizedBoqBySupplier: Record<string, NormalizedPenetrationLine[]> = {};
  const duplicationFlagsBySupplier: Record<string, DuplicationFlag[]> = {};
  const normalizationAuditSummaryBySupplier: Record<string, NormalizationAuditSummary> = {};
  const allNormalizedLines: NormalizedPenetrationLine[] = [];
  const allFlags: DuplicationFlag[] = [];
  const allSummaries: NormalizationAuditSummary[] = [];

  for (const quote of quotes) {
    const items = itemsByQuote.get(quote.id) || [];
    const supplierId = quote.id;
    const supplierName = quote.supplier_name;

    const rawInputs = items.map(item => {
      const sig = buildSignatureFromItem(item, trade);
      const intent = classifyLineIntent(item.description || '', {
        item_type: item.subclass ?? undefined,
      });
      sig.unitEntryFlag = intent === 'unit_entry_subset';
      sig.optionalFlag = intent === 'optional_scope';
      sig.provisionalFlag = intent === 'provisional_extra';

      return buildRawInputFromQuoteItem(
        {
          id: item.id,
          quote_id: item.quote_id,
          supplier_id: supplierId,
          description: item.description,
          section: item.scope_category ?? undefined,
          quantity: item.quantity,
          unit_rate: item.unit_price,
          total_amount: item.total_price ?? undefined,
          line_number: item.item_number ?? undefined,
          trade,
          service: item.service ?? item.mapped_service_type ?? undefined,
          size: item.size ?? undefined,
          substrate: item.material ?? undefined,
          frl: item.frr ?? undefined,
          system_name: item.system_label ?? item.mapped_system ?? undefined,
          item_type: item.subclass ?? undefined,
        },
        intent,
        sig,
        supplierId
      );
    });

    const groups = groupBySignature(rawInputs);
    const supplierLines: NormalizedPenetrationLine[] = [];

    for (const group of groups.values()) {
      const resolved = resolveGroup(group, supplierId, trade, config);
      supplierLines.push(resolved);
    }

    const flags = buildDuplicationFlags(supplierLines, supplierId);
    const summary = buildAuditSummary(supplierId, supplierName, trade, items.length, supplierLines, flags);

    normalizedBoqBySupplier[supplierId] = supplierLines;
    duplicationFlagsBySupplier[supplierId] = flags;
    normalizationAuditSummaryBySupplier[supplierId] = summary;

    allNormalizedLines.push(...supplierLines);
    allFlags.push(...flags);
    allSummaries.push(summary);
  }

  return {
    projectId,
    trade,
    runId,
    runAt,
    config,
    normalizedLines: allNormalizedLines,
    duplicationFlags: allFlags,
    auditSummaries: allSummaries,
    normalizedBoqBySupplier,
    normalizationAuditSummaryBySupplier,
    duplicationFlagsBySupplier,
  };
}

export function getIntegrationOutputs(result: BoqNormalisationResult) {
  return {
    normalizedBoqBySupplier: result.normalizedBoqBySupplier,
    normalizationAuditSummaryBySupplier: result.normalizationAuditSummaryBySupplier,
    duplicationFlagsBySupplier: result.duplicationFlagsBySupplier,
  };
}
