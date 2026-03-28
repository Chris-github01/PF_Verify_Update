import { normaliseUnit, areUnitsEquivalent } from '../normaliser/unitNormaliser';

export interface RawLineItem {
  id: string;
  description: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total_price: number | null;
  is_excluded?: boolean;
}

export interface SupplierInput {
  quoteId: string;
  supplierName: string;
  items: RawLineItem[];
}

export interface MatchedLineGroup {
  normalizedKey: string;
  canonicalDescription: string;
  unit: string;
  matchMethod: string;
  matchConfidence: number;
  supplierValues: SupplierLineValue[];
}

export interface SupplierLineValue {
  quoteId: string;
  supplierName: string;
  originalItemId: string;
  originalDescription: string;
  quantity: number | null;
  unitRate: number | null;
  totalValue: number | null;
  included: boolean;
}

const STOP_WORDS = new Set([
  'to', 'and', 'for', 'the', 'of', 'in', 'with', 'at', 'by',
  'from', 'as', 'a', 'an', 'all', 'per', 'inc', 'incl', 'including',
  'supply', 'install', 'provide', 'complete', 'supply and install',
]);

const SYNONYMS: Record<string, string> = {
  'fire stopping': 'fire stop',
  'fire seal': 'fire stop',
  'fr seal': 'fire stop',
  'intumescent seal': 'fire stop',
  'intumescent': 'fire stop',
  'penetration seal': 'fire stop',
  'penetration': 'penetration',
  'pipe penetration': 'pipe penetration',
  'cable penetration': 'cable penetration',
  'duct penetration': 'duct penetration',
  'conduit penetration': 'conduit penetration',
  'bulkhead': 'bulkhead',
  'joint': 'linear joint',
  'movement joint': 'linear joint',
  'linear joint': 'linear joint',
  'collar': 'collar',
  'intumescent collar': 'collar',
  'pipe collar': 'collar',
  'wrap': 'wrap',
  'pipe wrap': 'wrap',
  'band': 'wrap',
  'board': 'board',
  'blanket': 'blanket',
  'pillow': 'pillow',
  'mortar': 'mortar',
  'ablative': 'mortar',
  'caulk': 'sealant',
  'sealant': 'sealant',
  'mastic': 'sealant',
  'putty': 'sealant',
  'inspection': 'inspection',
  'testing': 'testing',
  'commissioning': 'commissioning',
  'allowance': 'allowance',
  'provisional': 'provisional',
  'frr': 'frr',
  'frl': 'frr',
};

const SIZE_PATTERN = /(\d+)\s*(?:mm|mm dia|dia|dn|nb|nps)/i;
const FRR_PATTERN = /[-/]?\s*(\d{1,3}[/\-]\d{1,3}[/\-]\d{1,3})/;

function normaliseDesc(desc: string): string {
  let s = desc.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  for (const [from, to] of Object.entries(SYNONYMS)) {
    s = s.replace(new RegExp(`\\b${from}\\b`, 'gi'), to);
  }

  const words = s.split(' ').filter((w) => w.length > 1 && !STOP_WORDS.has(w));
  return words.join(' ');
}

function extractSize(desc: string): string | null {
  const m = desc.match(SIZE_PATTERN);
  return m ? m[1] : null;
}

function extractFRR(desc: string): string | null {
  const m = desc.match(FRR_PATTERN);
  return m ? m[1] : null;
}

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(a.split(' ').filter((w) => w.length > 2));
  const tb = new Set(b.split(' ').filter((w) => w.length > 2));
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return (2 * shared) / (ta.size + tb.size);
}

function buildItemKey(desc: string, unit: string | null): string {
  const norm = normaliseDesc(desc);
  const size = extractSize(desc);
  const frr = extractFRR(desc);
  const normUnit = normaliseUnit(unit).normalized;
  const parts = [norm];
  if (size) parts.push(`sz:${size}`);
  if (frr) parts.push(`frr:${frr.replace(/[-\/]/g, '')}`);
  parts.push(`u:${normUnit}`);
  return parts.join('|');
}

function computeMatchConfidence(
  descA: string,
  descB: string,
  unitA: string | null,
  unitB: string | null,
): number {
  const overlap = tokenOverlap(normaliseDesc(descA), normaliseDesc(descB));
  const sizeA = extractSize(descA);
  const sizeB = extractSize(descB);
  const sizePenalty = sizeA && sizeB && sizeA !== sizeB ? 0.4 : 0;
  const unitBonus = areUnitsEquivalent(unitA, unitB) ? 0.1 : -0.1;
  return Math.max(0, Math.min(1, overlap + unitBonus - sizePenalty));
}

const CONFIDENCE_THRESHOLD = 0.55;

export function matchLineItems(suppliers: SupplierInput[]): MatchedLineGroup[] {
  if (suppliers.length < 2) return [];

  const allItems: Array<{
    sup: SupplierInput;
    item: RawLineItem;
    key: string;
    normDesc: string;
  }> = [];

  for (const sup of suppliers) {
    for (const item of sup.items) {
      if (item.is_excluded) continue;
      allItems.push({
        sup,
        item,
        key: buildItemKey(item.description, item.unit),
        normDesc: normaliseDesc(item.description),
      });
    }
  }

  const anchor = suppliers[0];
  const anchorItems = allItems.filter((x) => x.sup.quoteId === anchor.quoteId);
  const groups: MatchedLineGroup[] = [];

  for (const anchorEntry of anchorItems) {
    const supplierValues: SupplierLineValue[] = [
      {
        quoteId: anchorEntry.sup.quoteId,
        supplierName: anchorEntry.sup.supplierName,
        originalItemId: anchorEntry.item.id,
        originalDescription: anchorEntry.item.description,
        quantity: anchorEntry.item.quantity,
        unitRate: anchorEntry.item.unit_price,
        totalValue: anchorEntry.item.total_price,
        included: true,
      },
    ];

    let groupConfidence = 1.0;
    let matchMethod = 'anchor';

    for (const sup of suppliers.slice(1)) {
      const candidates = allItems.filter(
        (x) => x.sup.quoteId === sup.quoteId,
      );

      let bestMatch: (typeof allItems)[0] | null = null;
      let bestConf = 0;

      for (const cand of candidates) {
        if (cand.key === anchorEntry.key) {
          bestMatch = cand;
          bestConf = 1.0;
          break;
        }

        const conf = computeMatchConfidence(
          anchorEntry.item.description,
          cand.item.description,
          anchorEntry.item.unit,
          cand.item.unit,
        );
        if (conf > bestConf && conf >= CONFIDENCE_THRESHOLD) {
          bestConf = conf;
          bestMatch = cand;
        }
      }

      if (bestMatch) {
        supplierValues.push({
          quoteId: sup.quoteId,
          supplierName: sup.supplierName,
          originalItemId: bestMatch.item.id,
          originalDescription: bestMatch.item.description,
          quantity: bestMatch.item.quantity,
          unitRate: bestMatch.item.unit_price,
          totalValue: bestMatch.item.total_price,
          included: true,
        });
        groupConfidence = Math.min(groupConfidence, bestConf);
        if (bestConf < 1.0) matchMethod = 'description_fuzzy';
      }
    }

    if (supplierValues.length < 2) continue;

    groups.push({
      normalizedKey: anchorEntry.key,
      canonicalDescription: anchorEntry.item.description,
      unit: normaliseUnit(anchorEntry.item.unit).normalized,
      matchMethod,
      matchConfidence: parseFloat(groupConfidence.toFixed(3)),
      supplierValues,
    });
  }

  return groups;
}
