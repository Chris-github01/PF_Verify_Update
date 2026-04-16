// =============================================================================
// IDENTITY + AGGREGATION ENGINE
// Sits AFTER raw parsing and BEFORE totals are calculated or saved.
//
// Purpose: transform noisy LLM-extracted rows into stable, section-scoped,
// aggregated scope items — without blindly deduplicating legitimate items.
// =============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RawParsedItem {
  description?: string | null;
  qty?: number | string | null;
  quantity?: number | string | null;
  rate?: number | string | null;
  unit_price?: number | string | null;
  total?: number | string | null;
  total_price?: number | string | null;
  unit?: string | null;
  section_id?: string | null;
  section?: string | null;
  system_id?: string | null;
  block_id?: string | null;
  source?: string | null;
  frr?: string | null;
  [key: string]: unknown;
}

export type ScopeType = 'base' | 'optional';
export type SystemType =
  | 'electrical'
  | 'hydraulics'
  | 'mechanical'
  | 'fire_protection'
  | 'structural'
  | 'optional'
  | 'unknown';

export interface IdentifiedItem {
  block_id: string;
  system_type: SystemType;
  scope_type: ScopeType;
  description: string;
  normalized_signature: string;
  unit: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  identity_key: string;
  source?: string;
  frr?: string | null;
}

export interface IdentityEngineResult {
  base: {
    items: IdentifiedItem[];
    total: number;
  };
  optional: {
    items: IdentifiedItem[];
    total: number;
  };
  document_total: number | null;
  validation: {
    matches_document: boolean;
    variance: number;
    risk: 'OK' | 'HIGH';
    message?: string;
  };
}

// ---------------------------------------------------------------------------
// Step 1 — Extract Block ID
// ---------------------------------------------------------------------------

const BLOCK_RE = /Block\s*B?(\d+)/i;

export function extractBlockId(text: string): string {
  const m = text.match(BLOCK_RE);
  if (!m) return 'UNKNOWN';
  return `B${m[1]}`;
}

// ---------------------------------------------------------------------------
// Step 2 — Extract System Type
// ---------------------------------------------------------------------------

const SYSTEM_RULES: Array<{ keywords: RegExp; type: SystemType }> = [
  { keywords: /\bcable\b|\bconduit\b|\belectrical\b|\btrunking\b|\bswitchboard\b|\bcircuit\b/i, type: 'electrical' },
  { keywords: /\bpipe\b|\bhydraul\b|\bplumb\b|\bsewer\b|\bwaste\b|\bwater\b|\bvalve\b|\btap\b|\boverflow\b/i, type: 'hydraulics' },
  { keywords: /\bhvac\b|\bduct\b|\bmechanical\b|\bair.?con\b|\bcooling\b|\bheating\b|\bfan\b|\bvent\b/i, type: 'mechanical' },
  { keywords: /\bsprinkler\b|\bfire.?main\b|\bfire.?protection\b|\bfire.?hose\b|\bfire.?suppress/i, type: 'fire_protection' },
  { keywords: /\bbeam\b|\bcavity\b|\bcolumn\b|\bslab\b|\bstructural\b|\breinforc\b|\bsteel\b/i, type: 'structural' },
  { keywords: /\boptional\b|\badd\s+to\s+scope\b/i, type: 'optional' },
];

export function extractSystemType(description: string): SystemType {
  const d = description.toLowerCase();
  for (const rule of SYSTEM_RULES) {
    if (rule.keywords.test(d)) return rule.type;
  }
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Step 3 — Normalize Unit
// ---------------------------------------------------------------------------

const UNIT_MAP: Record<string, string> = {
  no: 'ea',
  'no.': 'ea',
  ea: 'ea',
  each: 'ea',
  item: 'ea',
  items: 'ea',
  nr: 'ea',
  m: 'lm',
  lm: 'lm',
  lin: 'lm',
  'lin.m': 'lm',
  'm2': 'm2',
  sqm: 'm2',
  'm²': 'm2',
  m3: 'm3',
  cbm: 'm3',
  'l/s': 'l/s',
  kg: 'kg',
  t: 't',
  hr: 'hr',
  hrs: 'hr',
  hour: 'hr',
  hours: 'hr',
  day: 'day',
  days: 'day',
  wk: 'wk',
  week: 'wk',
  weeks: 'wk',
  allow: 'allow',
  allowance: 'allow',
  sum: 'sum',
  ls: 'sum',
  'l.s.': 'sum',
  'l.s': 'sum',
};

export function normalizeUnit(unit: string | null | undefined): string {
  if (!unit) return 'ea';
  const key = unit.toLowerCase().trim();
  return UNIT_MAP[key] ?? key;
}

// ---------------------------------------------------------------------------
// Step 4 — Build Item Signature
// ---------------------------------------------------------------------------

const SIGNATURE_STRIP_PATTERNS: RegExp[] = [
  /^architectural\s*\/?\s*structural\s+details\s*/i,
  /^optional\s+extras\s*/i,
  /^mechanical\s+hvac\s*/i,
  /^electrical\s+/i,
  /^hydraulics\s+/i,
  /^mechanical\s+/i,
  /^fire\s+protection\s+/i,
  /^structural\s+/i,
  /\b[A-Z]{1,2}\d+\.\d+\b/g,
  /\bv\d+\.\d+\b/gi,
];

export function buildSignature(description: string): string {
  let d = description.toLowerCase().trim();
  for (const pattern of SIGNATURE_STRIP_PATTERNS) {
    d = d.replace(pattern, '').trimStart();
  }
  // Collapse repeated words (cable / cable → cable)
  const words = d.split(/\s+/);
  const deduped: string[] = [];
  for (let i = 0; i < words.length; i++) {
    if (i === 0 || words[i] !== words[i - 1]) deduped.push(words[i]);
  }
  return deduped.join(' ').replace(/\s+/g, ' ').trim().slice(0, 140);
}

// ---------------------------------------------------------------------------
// Step 5 — Build Identity Key
// ---------------------------------------------------------------------------

export function buildIdentityKey(
  block_id: string,
  system_type: SystemType,
  signature: string,
  unit: string,
  unit_price: number,
): string {
  const roundedRate = unit_price.toFixed(4);
  return `${block_id}|${system_type}|${signature}|${unit}|${roundedRate}`;
}

// ---------------------------------------------------------------------------
// Step 7 — Filter non-scope items (before aggregation)
// ---------------------------------------------------------------------------

const NON_SCOPE_DESCRIPTIONS: RegExp[] = [
  /^by\s+others\b/i,
  /services\s+identified\s+not\s+part\s+of\s+passive\s+fire/i,
  /not\s+in\s+contract/i,
  /n\.?i\.?c\.?/i,
];

function isNonScopeItem(item: RawParsedItem): boolean {
  const total = Number(item.total ?? item.total_price ?? 0);
  if (!total || total === 0) return true;

  const desc = String(item.description ?? '').trim();
  if (!desc) return true;

  for (const re of NON_SCOPE_DESCRIPTIONS) {
    if (re.test(desc)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Step 8 — Detect Optional Scope
// ---------------------------------------------------------------------------

const OPTIONAL_RE = /\b(OPTIONAL|ADD\s+TO\s+SCOPE|OPTIONAL\s+SCOPE)\b/i;

function isOptionalItem(item: RawParsedItem): boolean {
  const desc = String(item.description ?? '');
  const section = String(item.section_id ?? item.section ?? '');
  return OPTIONAL_RE.test(desc) || OPTIONAL_RE.test(section);
}

// ---------------------------------------------------------------------------
// Step 6 + combined — Aggregation Engine
// ---------------------------------------------------------------------------

export function aggregateItems(
  items: RawParsedItem[],
): Map<string, IdentifiedItem> {
  const map = new Map<string, IdentifiedItem>();
  let lastBlockId = 'UNKNOWN';

  for (const item of items) {
    // Resolve block_id with fallback to last seen
    const desc = String(item.description ?? '');
    const rawSection = String(item.section_id ?? item.section ?? item.block_id ?? '');

    let block_id = 'UNKNOWN';
    if (rawSection) {
      block_id = extractBlockId(rawSection) !== 'UNKNOWN'
        ? extractBlockId(rawSection)
        : rawSection.toUpperCase().slice(0, 20);
    }
    if (block_id === 'UNKNOWN') {
      block_id = extractBlockId(desc) !== 'UNKNOWN'
        ? extractBlockId(desc)
        : lastBlockId;
    }
    lastBlockId = block_id;

    const system_type = extractSystemType(desc);
    const unit = normalizeUnit(item.unit);
    const qty = Number(item.qty ?? item.quantity ?? 0) || 0;
    const rate = Number(item.rate ?? item.unit_price ?? 0) || 0;
    const total = Number(item.total ?? item.total_price ?? 0) || 0;
    const signature = buildSignature(desc);
    const identity_key = buildIdentityKey(block_id, system_type, signature, unit, rate);
    const scope_type: ScopeType = isOptionalItem(item) ? 'optional' : 'base';

    if (map.has(identity_key)) {
      const existing = map.get(identity_key)!;
      existing.quantity = parseFloat((existing.quantity + qty).toFixed(6));
      existing.total_price = parseFloat((existing.total_price + total).toFixed(2));
    } else {
      map.set(identity_key, {
        block_id,
        system_type,
        scope_type,
        description: desc,
        normalized_signature: signature,
        unit,
        quantity: qty,
        unit_price: rate,
        total_price: total,
        identity_key,
        source: String(item.source ?? 'identity_engine'),
        frr: item.frr ? String(item.frr) : null,
      });
    }
  }

  return map;
}

// ---------------------------------------------------------------------------
// Step 9 — Document Total Extraction (from raw text)
// ---------------------------------------------------------------------------

const GRAND_TOTAL_PATTERNS: RegExp[] = [
  /Grand\s+Total\s*\(excl(?:uding)?\.?\s*GST\)\s*:?\s*\$?\s*([\d][\d\s,]*\.\d{2})/i,
  /Grand\s+Total\s*\(excl(?:uding)?\.?\s*GST\)\s*:?\s*\$?\s*([\d][\d\s,]{2,})/i,
  /Grand\s+Total\s*:?\s*\$?\s*([\d][\d\s,]*\.\d{2})/i,
  /TOTAL\s*\(excl(?:uding)?\.?\s*GST\)\s*:?\s*\$?\s*([\d][\d\s,]*\.\d{2})/i,
  /Contract\s+(?:Sum|Total|Price)\s*:?\s*\$?\s*([\d][\d\s,]*\.\d{2})/i,
  /Quote\s+Total\s*:?\s*\$?\s*([\d][\d\s,]*\.\d{2})/i,
];

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, '').replace(/,/g, '');
  const val = parseFloat(cleaned);
  return isNaN(val) || val <= 0 ? null : val;
}

export function extractDocumentGrandTotal(rawText: string): number | null {
  const flat = rawText.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');
  let best: number | null = null;
  for (const re of GRAND_TOTAL_PATTERNS) {
    const m = flat.match(re);
    if (m) {
      const val = parseAmount(m[1]);
      if (val !== null && (best === null || val > best)) {
        best = val;
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Step 10 + 11 — Main entry point
// ---------------------------------------------------------------------------

export function runIdentityEngine(
  rawItems: RawParsedItem[],
  rawDocumentText?: string,
): IdentityEngineResult {
  // Step 7: filter non-scope
  const scopeItems = rawItems.filter(item => !isNonScopeItem(item));

  // Separate optional from base before aggregation
  const baseRaw = scopeItems.filter(item => !isOptionalItem(item));
  const optionalRaw = scopeItems.filter(item => isOptionalItem(item));

  // Step 6: aggregate each group independently
  const baseMap = aggregateItems(baseRaw);
  const optionalMap = aggregateItems(optionalRaw);

  const baseItems = Array.from(baseMap.values());
  const optionalItems = Array.from(optionalMap.values());

  const baseTotal = baseItems.reduce((s, i) => s + i.total_price, 0);
  const optionalTotal = optionalItems.reduce((s, i) => s + i.total_price, 0);

  // Step 9: document total
  const document_total = rawDocumentText
    ? extractDocumentGrandTotal(rawDocumentText)
    : null;

  // Step 11: validation
  let matches_document = true;
  let variance = 0;
  let risk: 'OK' | 'HIGH' = 'OK';
  let message: string | undefined;

  if (document_total && document_total > 0 && baseTotal > 0) {
    variance = Math.abs(document_total - baseTotal) / document_total;
    matches_document = variance <= 0.02;
    if (!matches_document) {
      risk = 'HIGH';
      message = `Base total $${baseTotal.toFixed(2)} deviates ${(variance * 100).toFixed(1)}% from document total $${document_total.toFixed(2)} — systemic_miss suspected`;
    }
  }

  return {
    base: { items: baseItems, total: baseTotal },
    optional: { items: optionalItems, total: optionalTotal },
    document_total,
    validation: { matches_document, variance, risk, message },
  };
}
