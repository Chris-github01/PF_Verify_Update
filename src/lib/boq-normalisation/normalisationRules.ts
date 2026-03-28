import type { LineIntent, PenetrationSignature } from '../../types/boqNormalisation.types';

const SERVICE_ALIASES: Record<string, string> = {
  'fire alarm cable': 'Fire Alarm Cable',
  'alarm cable': 'Fire Alarm Cable',
  'fire alarm cabling': 'Fire Alarm Cable',
  'cable conduit': 'Cable Conduit',
  'conduit': 'Cable Conduit',
  'emt conduit': 'Cable Conduit',
  'pex': 'PEX Pipe',
  'pex pipe': 'PEX Pipe',
  'mdpe': 'MDPE Pipe',
  'mdpe pipe': 'MDPE Pipe',
  'copper pipe': 'Copper Pipe',
  'copper': 'Copper Pipe',
  'sprinkler pipe': 'Sprinkler Pipe',
  'sprinkler': 'Sprinkler Pipe',
  'fire main': 'Fire Main',
  'fire main pipe': 'Fire Main',
  'ductwork': 'Ductwork',
  'duct': 'Ductwork',
  'circular duct': 'Circular Ductwork',
  'rectangular duct': 'Rectangular Ductwork',
  'cable tray': 'Cable Tray',
  'trunking': 'Trunking',
  'cable trunking': 'Trunking',
  'hvac duct': 'Ductwork',
  'exhaust duct': 'Exhaust Ductwork',
  'supply duct': 'Supply Ductwork',
};

const FRL_MAP: Record<string, string> = {
  '-/30/30': '-/30/30',
  '-/60/60': '-/60/60',
  '-/120/120': '-/120/120',
  '-/180/180': '-/180/180',
  '-/240/240': '-/240/240',
  '30/30/30': '30/30/30',
  '60/60/60': '60/60/60',
  '120/120/120': '120/120/120',
  '240/240/240': '240/240/240',
  'smoke wall': 'Smoke Wall',
  'smoke barrier': 'Smoke Wall',
  'smoke': 'Smoke Wall',
  'acoustic': 'Acoustic',
  'fire rated': 'Fire Rated',
};

const SUBSTRATE_PATTERNS: Array<{ pattern: RegExp; canonical: string }> = [
  { pattern: /concrete\s+floor/i, canonical: 'Concrete Floor' },
  { pattern: /concrete\s+wall/i, canonical: 'Concrete Wall' },
  { pattern: /concrete\s+slab/i, canonical: 'Concrete Slab' },
  { pattern: /gib\s+fyreline\s+wall\s+2\s*x\s*13/i, canonical: 'Gib Fyreline Wall 2x13mm' },
  { pattern: /gib\s+fyreline\s+wall\s+1\s*x\s*13/i, canonical: 'Gib Fyreline Wall 1x13mm' },
  { pattern: /gib\s+fyreline\s+wall/i, canonical: 'Gib Fyreline Wall' },
  { pattern: /gib\s+fyreline\s+ceiling/i, canonical: 'Gib Fyreline Ceiling' },
  { pattern: /villaboard\s+1\s*x\s*9/i, canonical: 'Villaboard 1x9mm' },
  { pattern: /villaboard\s+2\s*x\s*9/i, canonical: 'Villaboard 2x9mm' },
  { pattern: /villaboard/i, canonical: 'Villaboard' },
  { pattern: /james\s+hardie/i, canonical: 'James Hardie Board' },
  { pattern: /masonry\s+wall/i, canonical: 'Masonry Wall' },
  { pattern: /masonry\s+floor/i, canonical: 'Masonry Floor' },
  { pattern: /brick\s+wall/i, canonical: 'Brick Wall' },
  { pattern: /timber\s+floor/i, canonical: 'Timber Floor' },
  { pattern: /timber\s+wall/i, canonical: 'Timber Wall' },
  { pattern: /steel\s+floor/i, canonical: 'Steel Floor' },
  { pattern: /steel\s+deck/i, canonical: 'Steel Deck' },
  { pattern: /plasterboard\s+wall/i, canonical: 'Plasterboard Wall' },
  { pattern: /plasterboard\s+ceiling/i, canonical: 'Plasterboard Ceiling' },
  { pattern: /plasterboard/i, canonical: 'Plasterboard' },
  { pattern: /floor/i, canonical: 'Floor' },
  { pattern: /wall/i, canonical: 'Wall' },
  { pattern: /ceiling/i, canonical: 'Ceiling' },
  { pattern: /roof/i, canonical: 'Roof' },
];

const PROVISIONAL_KEYWORDS = [
  'extra over',
  'extra-over',
  'not shown',
  'not on layout',
  'refer tbc',
  'tbc breakdown',
  'provisional',
  'allow for',
  'allowance',
  'nts',
  'n.t.s.',
  'refer breakdown',
  'additional penetrations',
  'additional',
  'add for',
];

const OPTIONAL_KEYWORDS = [
  'optional',
  'if required',
  'contingency',
  'pc sum',
  'pc item',
  'builders work',
  'bwic',
  'b.w.i.c',
  'owner supply',
  'client supply',
  'by others',
  'alt.',
  'alternative',
];

const UNIT_ENTRY_KEYWORDS = [
  'unit entry',
  'unit rate entry',
  'schedule rate entry',
  'rate entry',
  'sor entry',
  'schedule of rates entry',
  'unit rate',
];

const INSULATION_KEYWORDS = [
  'insulation wrap',
  'insulation',
  'wrap',
  'lagging',
  'acoustic wrap',
  'fire wrap',
  'mineral wool',
  'rockwool wrap',
  'foil wrap',
  'armaflex',
  'sealant only',
  'collar only',
  'intumescent collar',
  'intumescent only',
];

const SUMMARY_KEYWORDS = [
  'total',
  'sub total',
  'subtotal',
  'grand total',
  'section total',
  'sum total',
  'total carried',
  'total c/f',
  'carried forward',
  'page total',
  'trade total',
];

export function normalizeService(raw: string): string {
  if (!raw) return '';
  const lower = raw.toLowerCase().trim();
  for (const [alias, canonical] of Object.entries(SERVICE_ALIASES)) {
    if (lower === alias || lower.startsWith(alias + ' ') || lower.includes(alias)) {
      return canonical;
    }
  }
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function normalizeSize(raw: string): string {
  if (!raw) return '';
  let s = raw.toLowerCase().trim();
  s = s.replace(/\s*(mm|m|mm2)\s*/g, (match, unit) => unit.toLowerCase());
  s = s.replace(/\s*x\s*/g, 'x');
  s = s.replace(/(\d)\s+(\d)/g, '$1$2');
  s = s.replace(/\s+/g, '');
  const match = s.match(/^(\d+(?:\.\d+)?)(x\d+(?:\.\d+)?)?(x\d+(?:\.\d+)?)?/);
  if (match) {
    const parts = [match[1], match[2], match[3]].filter(Boolean);
    const joined = parts.join('').replace(/x/g, 'x');
    const numMatch = joined.match(/^(\d+(?:\.\d+)?)(x\d+(?:\.\d+)?)?(x\d+(?:\.\d+)?)?/);
    if (numMatch) {
      const allParts = [numMatch[1], numMatch[2], numMatch[3]].filter(Boolean);
      return allParts.join('').replace(/x(\d)/g, 'x$1') + 'mm';
    }
  }
  return raw.trim();
}

export function normalizeFRL(raw: string): string {
  if (!raw) return '';
  const lower = raw.toLowerCase().trim();
  for (const [key, canonical] of Object.entries(FRL_MAP)) {
    if (lower === key.toLowerCase() || lower.includes(key.toLowerCase())) {
      return canonical;
    }
  }
  const frlPattern = raw.match(/(-|\d+)\/(-|\d+)\/(-|\d+)/);
  if (frlPattern) return frlPattern[0];
  return raw.trim();
}

export function normalizeSubstrate(raw: string): string {
  if (!raw) return '';
  for (const { pattern, canonical } of SUBSTRATE_PATTERNS) {
    if (pattern.test(raw)) return canonical;
  }
  return raw.trim();
}

export function classifyLineIntent(description: string, existingFields?: {
  is_provisional?: boolean;
  is_optional?: boolean;
  is_unit_entry?: boolean;
  is_summary?: boolean;
  item_type?: string;
}): LineIntent {
  const lower = (description || '').toLowerCase();

  if (existingFields?.is_summary) return 'summary_only';
  if (SUMMARY_KEYWORDS.some(k => lower.includes(k) && lower.length < 60)) return 'summary_only';

  if (existingFields?.is_optional) return 'optional_scope';
  if (OPTIONAL_KEYWORDS.some(k => lower.includes(k))) return 'optional_scope';

  if (existingFields?.is_unit_entry) return 'unit_entry_subset';
  if (UNIT_ENTRY_KEYWORDS.some(k => lower.includes(k))) return 'unit_entry_subset';

  if (existingFields?.is_provisional) return 'provisional_extra';
  if (PROVISIONAL_KEYWORDS.some(k => lower.includes(k))) return 'provisional_extra';

  if (INSULATION_KEYWORDS.some(k => lower.includes(k))) {
    const hasPenetrationContext = lower.match(/\d+mm/) || lower.includes('penetrat') || lower.includes('pipe') || lower.includes('duct');
    if (!hasPenetrationContext) return 'insulation_dependency';
    if (lower.includes('wrap') || lower.includes('lagging') || (lower.includes('insulation') && !lower.includes('penetrat'))) {
      return 'insulation_dependency';
    }
  }

  if (!description || description.length < 3) return 'review_required';

  return 'core_scope';
}

export function detectSystemConflict(systems: string[]): boolean {
  if (systems.length <= 1) return false;
  const normalized = systems.map(s => s.toLowerCase().trim());
  const unique = new Set(normalized);
  return unique.size > 1;
}

export function buildSignatureKey(sig: PenetrationSignature): string {
  return [
    sig.trade,
    sig.service,
    sig.serviceType,
    sig.sizeNormalized,
    sig.substrateNormalized,
    sig.frlNormalized,
    sig.orientationNormalized,
    sig.locationClass,
    sig.insulationState,
  ]
    .map(s => (s || '').toLowerCase().replace(/\s+/g, '_'))
    .join('::');
}

export function buildSignatureKeyForGrouping(sig: PenetrationSignature): string {
  return [
    sig.trade,
    sig.service,
    sig.sizeNormalized,
    sig.substrateNormalized,
    sig.frlNormalized,
  ]
    .map(s => (s || '').toLowerCase().replace(/\s+/g, '_'))
    .join('::');
}

export function extractSystemFromDescription(description: string): string {
  const systemPatterns = [
    /\b(hilti|rockwool|nullifire|envirograf|bostik|sika|tremco|fosroc|basf|geberit|promat|cafco|rectorseal|specified\s+air|mechanical\s+seal|intumescent\s+seal)\b/i,
    /\b(cp\s*\d+[a-z]?)\b/i,
    /\b(fs\s*\d+[a-z]?)\b/i,
    /system\s+([a-z0-9\-]+)/i,
    /product:\s*([^\s,]+)/i,
  ];
  for (const pattern of systemPatterns) {
    const match = description.match(pattern);
    if (match) return match[1] || match[0];
  }
  return '';
}

export function extractOrientationFromDescription(description: string): string {
  const lower = description.toLowerCase();
  if (lower.includes('floor') || lower.includes('horizontal') || lower.includes('slab')) return 'horizontal';
  if (lower.includes('wall') || lower.includes('vertical')) return 'vertical';
  if (lower.includes('ceiling')) return 'overhead';
  return 'unknown';
}

export function extractLocationClass(description: string): string {
  const lower = description.toLowerCase();
  if (lower.includes('plant room') || lower.includes('plantroom')) return 'plant_room';
  if (lower.includes('riser') || lower.includes('riser shaft')) return 'riser';
  if (lower.includes('corridor')) return 'corridor';
  if (lower.includes('basement')) return 'basement';
  if (lower.includes('roof')) return 'roof';
  if (lower.includes('car park') || lower.includes('carpark')) return 'car_park';
  return 'general';
}

export function detectInsulationState(description: string): PenetrationSignature['insulationState'] {
  const lower = description.toLowerCase();
  const isInsulationOnly =
    INSULATION_KEYWORDS.slice(0, 6).some(k => lower.startsWith(k)) ||
    (lower.includes('insulation') && !lower.includes('penetrat') && !lower.includes('pipe penetrat'));
  if (isInsulationOnly) return 'insulation_only';
  if (lower.includes('insulated') || lower.includes('with insulation') || lower.includes('+ insulation')) return 'with_insulation';
  if (lower.includes('uninsulated') || lower.includes('without insulation') || lower.includes('no insulation')) return 'without_insulation';
  return 'unknown';
}

export function buildCanonicalDescription(sig: PenetrationSignature): string {
  const parts: string[] = [];
  if (sig.service) parts.push(sig.service);
  if (sig.sizeNormalized) parts.push(sig.sizeNormalized);
  if (sig.frlNormalized && sig.frlNormalized !== 'unknown') parts.push(sig.frlNormalized);
  if (sig.substrateNormalized && sig.substrateNormalized !== 'unknown') parts.push(`Through ${sig.substrateNormalized}`);
  if (sig.insulationState === 'with_insulation') parts.push('(Insulated)');
  if (sig.insulationState === 'insulation_only') parts.push('(Insulation Only)');
  if (sig.optionalFlag) parts.push('[Optional]');
  if (sig.provisionalFlag) parts.push('[Provisional]');
  if (sig.unitEntryFlag) parts.push('[Unit Entry]');
  if (sig.extraOverFlag) parts.push('[Extra Over]');
  return parts.join(' ') || 'Unclassified Penetration';
}
