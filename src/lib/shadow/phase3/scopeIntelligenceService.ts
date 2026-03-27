import { supabase } from '../../supabase';
import type { ResolvedDataset } from '../phase1/sourceAdapters';

export interface ShadowScopeItem {
  id: string;
  run_id: string;
  module_key: string;
  item_type: string;
  description: string;
  normalized_description: string;
  section: string | null;
  classification: string;
  quantity: number | null;
  unit: string | null;
  rate: number | null;
  total_value: number | null;
  source: string;
  confidence: number;
  created_at: string;
}

export interface ShadowScopeGap {
  id: string;
  run_id: string;
  missing_scope_type: string;
  description: string;
  expected_presence: string;
  risk_level: string;
  created_at: string;
}

export interface ShadowScopeQualification {
  id: string;
  run_id: string;
  description: string;
  normalized_description: string;
  source_text: string | null;
  impact_type: string;
  created_at: string;
}

export interface ShadowScopeExclusion {
  id: string;
  run_id: string;
  description: string;
  normalized_description: string;
  section: string | null;
  source_text: string | null;
  risk_level: string;
  created_at: string;
}

export interface ScopeIntelligenceResult {
  items: ShadowScopeItem[];
  gaps: ShadowScopeGap[];
  qualifications: ShadowScopeQualification[];
  exclusions: ShadowScopeExclusion[];
}

// ---------------------------------------------------------------------------
// Per-trade gap patterns: tied to fingerprint expectations, not generic words
// ---------------------------------------------------------------------------
interface GapCheck {
  type: string;
  keywords: string[];
  description: string;
  expected: string;
  risk: string;
  trades: string[];
}

const TRADE_GAP_PATTERNS: GapCheck[] = [
  // Plumbing
  {
    type: 'commissioning_hydraulic',
    keywords: ['commission', 'test', 'flush', 'purge', 'pressure test', 'hydrostatic'],
    description: 'No hydraulic commissioning or pressure testing scope detected',
    expected: 'always_present',
    risk: 'high',
    trades: ['plumbing_parser', 'plumbing'],
  },
  {
    type: 'pipe_insulation',
    keywords: ['insul', 'lagg', 'thermal wrap', 'vapour barrier'],
    description: 'No pipe insulation scope detected — common omission in plumbing quotes',
    expected: 'likely_present',
    risk: 'high',
    trades: ['plumbing_parser', 'plumbing'],
  },
  {
    type: 'backflow_prevention',
    keywords: ['backflow', 'rpz', 'dca', 'testable', 'non-return'],
    description: 'No backflow prevention devices detected — typically code-mandated',
    expected: 'likely_present',
    risk: 'medium',
    trades: ['plumbing_parser', 'plumbing'],
  },
  {
    type: 'drainage_stormwater',
    keywords: ['stormwater', 'drainage', 'grate', 'pit', 'sump', 'overflow'],
    description: 'No stormwater or drainage scope detected',
    expected: 'sometimes_present',
    risk: 'medium',
    trades: ['plumbing_parser', 'plumbing'],
  },
  // HVAC
  {
    type: 'commissioning_air',
    keywords: ['commission', 'balance', 'tab ', 'test and balance', 'air balance'],
    description: 'No HVAC commissioning or air balancing scope detected',
    expected: 'always_present',
    risk: 'high',
    trades: ['hvac', 'hvac_parser'],
  },
  {
    type: 'ductwork_insulation',
    keywords: ['duct insul', 'duct wrap', 'thermal duct', 'insulated duct'],
    description: 'No ductwork insulation scope detected',
    expected: 'likely_present',
    risk: 'medium',
    trades: ['hvac', 'hvac_parser'],
  },
  // Fire (active)
  {
    type: 'commissioning_fire',
    keywords: ['commission', 'witness test', 'annual test', 'acceptance test', 'flow test'],
    description: 'No fire system commissioning or acceptance testing scope detected',
    expected: 'always_present',
    risk: 'high',
    trades: ['active_fire', 'active_fire_parser'],
  },
  {
    type: 'hydraulic_calcs',
    keywords: ['hydraulic calc', 'hydraulic design', 'design cert'],
    description: 'No hydraulic calculations or design certification scope detected',
    expected: 'likely_present',
    risk: 'medium',
    trades: ['active_fire', 'active_fire_parser'],
  },
  // Electrical
  {
    type: 'commissioning_electrical',
    keywords: ['commission', 'test and tag', 'megger', 'earth test', 'pat test'],
    description: 'No electrical commissioning or testing scope detected',
    expected: 'always_present',
    risk: 'high',
    trades: ['electrical', 'electrical_parser'],
  },
  {
    type: 'as_built_drawings',
    keywords: ['as built', 'as-built', 'record draw', 'o&m', 'operation manual', 'maintenance manual'],
    description: 'No as-built drawings or O&M documentation scope detected',
    expected: 'sometimes_present',
    risk: 'medium',
    trades: ['plumbing_parser', 'hvac', 'active_fire', 'electrical', 'plumbing', 'comparison_engine'],
  },
];

function normalizeDescription(desc: string): string {
  return desc.trim().toLowerCase().replace(/\s+/g, ' ');
}

function classifyItem(desc: string): string {
  const d = desc.toLowerCase();
  if (d.includes('supply only') || d.includes('supply &')) return 'supply_only';
  if (d.includes('install') || d.includes('fix') || d.includes('connect')) return 'supply_and_install';
  if (d.includes('allow') || d.includes('provisional')) return 'provisional';
  if (d.includes('test') || d.includes('commission')) return 'commissioning';
  return 'general';
}

function detectItemType(desc: string): string {
  const d = desc.toLowerCase();
  if (d.includes('pipe') || d.includes('fitting') || d.includes('valve')) return 'piping';
  if (d.includes('pump') || d.includes('motor') || d.includes('fan')) return 'equipment';
  if (d.includes('insul')) return 'insulation';
  if (d.includes('access') || d.includes('door') || d.includes('panel')) return 'access';
  if (d.includes('test') || d.includes('commission') || d.includes('flush')) return 'testing';
  return 'general';
}

function detectGaps(
  items: { description: string; total: number }[],
  moduleKey: string,
): Omit<ShadowScopeGap, 'id' | 'run_id' | 'created_at'>[] {
  const gaps: Omit<ShadowScopeGap, 'id' | 'run_id' | 'created_at'>[] = [];
  if (items.length === 0) return gaps;

  const descs = items.map((i) => i.description.toLowerCase()).join(' ');

  // Only apply patterns that are relevant to this trade module.
  // Falls back to all cross-trade patterns when module is unknown.
  const applicable = TRADE_GAP_PATTERNS.filter(
    (p) =>
      p.trades.includes(moduleKey) ||
      p.trades.includes('comparison_engine') ||
      p.trades.some((t) => moduleKey.includes(t)),
  );

  // If no specific trade match, apply universal cross-trade patterns only
  const patterns =
    applicable.length > 0
      ? applicable
      : TRADE_GAP_PATTERNS.filter((p) => p.trades.includes('comparison_engine'));

  for (const check of patterns) {
    const found = check.keywords.some((kw) => descs.includes(kw));
    if (!found) {
      gaps.push({
        missing_scope_type: check.type,
        description: check.description,
        expected_presence: check.expected,
        risk_level: check.risk,
      });
    }
  }

  return gaps;
}

function detectQualifications(
  items: { description: string }[],
): Omit<ShadowScopeQualification, 'id' | 'run_id' | 'created_at'>[] {
  const quals: Omit<ShadowScopeQualification, 'id' | 'run_id' | 'created_at'>[] = [];
  const qualKeywords = [
    { kw: 'allow for', impact: 'provisional_sum' },
    { kw: 'allowance', impact: 'provisional_sum' },
    { kw: 'provisional', impact: 'provisional_sum' },
    { kw: 'ps item', impact: 'provisional_sum' },
    { kw: 'by others', impact: 'exclusion' },
    { kw: 'not included', impact: 'exclusion' },
    { kw: 'subject to', impact: 'conditional' },
    { kw: 'pending', impact: 'conditional' },
    { kw: 'tbc', impact: 'conditional' },
    { kw: 'to be confirmed', impact: 'conditional' },
  ];

  const seen = new Set<string>();
  for (const item of items) {
    if (!item.description) continue;
    const d = item.description.toLowerCase();
    for (const { kw, impact } of qualKeywords) {
      if (d.includes(kw)) {
        const key = `${impact}:${normalizeDescription(item.description.slice(0, 80))}`;
        if (!seen.has(key)) {
          seen.add(key);
          quals.push({
            description: item.description.slice(0, 200),
            normalized_description: normalizeDescription(item.description.slice(0, 200)),
            source_text: item.description,
            impact_type: impact,
          });
        }
        break;
      }
    }
  }

  return quals.slice(0, 30);
}

function detectExclusions(
  items: { description: string }[],
): Omit<ShadowScopeExclusion, 'id' | 'run_id' | 'created_at'>[] {
  const exclusions: Omit<ShadowScopeExclusion, 'id' | 'run_id' | 'created_at'>[] = [];
  const exclusionKeywords = [
    { kw: 'by others', risk: 'medium' },
    { kw: 'not included', risk: 'high' },
    { kw: 'excluded', risk: 'high' },
    { kw: 'not in scope', risk: 'high' },
    { kw: 'not in contract', risk: 'high' },
    { kw: 'n/a', risk: 'low' },
    { kw: 'nil', risk: 'low' },
  ];

  const seen = new Set<string>();
  for (const item of items) {
    if (!item.description) continue;
    const d = item.description.toLowerCase();
    for (const { kw, risk } of exclusionKeywords) {
      if (d.includes(kw)) {
        const key = `${risk}:${normalizeDescription(item.description.slice(0, 80))}`;
        if (!seen.has(key)) {
          seen.add(key);
          exclusions.push({
            description: item.description.slice(0, 200),
            normalized_description: normalizeDescription(item.description.slice(0, 200)),
            section: null,
            source_text: item.description,
            risk_level: risk,
          });
        }
        break;
      }
    }
  }

  return exclusions.slice(0, 30);
}

export async function runScopeIntelligence(
  runId: string,
  moduleKey: string,
  dataset: ResolvedDataset,
): Promise<ScopeIntelligenceResult> {
  const items = dataset.lineItems.slice(0, 300);

  if (items.length === 0) {
    console.warn(`[Phase3/Scope] runId=${runId.slice(0, 8)} — zero line items, skipping scope write`);
    return { items: [], gaps: [], qualifications: [], exclusions: [] };
  }

  // --- Scope items ---
  const scopeItemRows: Omit<ShadowScopeItem, 'id' | 'created_at'>[] = items
    .filter((i) => i.description && i.description.trim().length > 3)
    .map((i) => ({
      run_id: runId,
      module_key: moduleKey,
      item_type: detectItemType(i.description),
      description: i.description.slice(0, 500),
      normalized_description: normalizeDescription(i.description.slice(0, 500)),
      section: null,
      classification: classifyItem(i.description),
      quantity: typeof i.qty === 'number' ? i.qty : null,
      unit: i.unit ?? null,
      rate: typeof i.rate === 'number' ? i.rate : null,
      total_value: typeof i.total === 'number' ? i.total : null,
      source: 'live_parser',
      confidence: 0.75,
    }));

  if (scopeItemRows.length > 0) {
    const { error } = await supabase.from('shadow_scope_items').insert(scopeItemRows);
    if (error) {
      console.warn(`[Phase3/Scope] shadow_scope_items insert failed: ${error.message}`);
    } else {
      console.log(`[Phase3/Scope] Wrote ${scopeItemRows.length} scope items for run ${runId.slice(0, 8)}`);
    }
  } else {
    console.warn(`[Phase3/Scope] runId=${runId.slice(0, 8)} — zero valid scope items after filter`);
  }

  // --- Gaps (trade-aware) ---
  const itemsForGap = items.map((i) => ({
    description: i.description ?? '',
    total: typeof i.total === 'number' ? i.total : 0,
  }));

  const gapRows = detectGaps(itemsForGap, moduleKey).map((g) => ({ ...g, run_id: runId }));
  if (gapRows.length > 0) {
    const { error } = await supabase.from('shadow_scope_gaps').insert(gapRows);
    if (error) {
      console.warn(`[Phase3/Scope] shadow_scope_gaps insert failed: ${error.message}`);
    } else {
      console.log(`[Phase3/Scope] Wrote ${gapRows.length} scope gaps for run ${runId.slice(0, 8)}`);
    }
  } else {
    console.log(`[Phase3/Scope] No scope gaps detected for module=${moduleKey} run=${runId.slice(0, 8)}`);
  }

  // --- Qualifications ---
  const qualRows = detectQualifications(
    items.map((i) => ({ description: i.description ?? '' })),
  ).map((q) => ({ ...q, run_id: runId }));

  if (qualRows.length > 0) {
    const { error } = await supabase.from('shadow_scope_qualifications').insert(qualRows);
    if (error) {
      console.warn(`[Phase3/Scope] shadow_scope_qualifications insert failed: ${error.message}`);
    }
  }

  // --- Exclusions ---
  const exclusionRows = detectExclusions(
    items.map((i) => ({ description: i.description ?? '' })),
  ).map((e) => ({ ...e, run_id: runId }));

  if (exclusionRows.length > 0) {
    const { error } = await supabase.from('shadow_scope_exclusions').insert(exclusionRows);
    if (error) {
      console.warn(`[Phase3/Scope] shadow_scope_exclusions insert failed: ${error.message}`);
    }
  }

  return {
    items: scopeItemRows as ShadowScopeItem[],
    gaps: gapRows as ShadowScopeGap[],
    qualifications: qualRows as ShadowScopeQualification[],
    exclusions: exclusionRows as ShadowScopeExclusion[],
  };
}

export async function getScopeIntelligenceForRun(runId: string): Promise<ScopeIntelligenceResult> {
  const [itemsRes, gapsRes, qualsRes, exclusionsRes] = await Promise.all([
    supabase.from('shadow_scope_items').select('*').eq('run_id', runId).order('created_at'),
    supabase.from('shadow_scope_gaps').select('*').eq('run_id', runId).order('risk_level'),
    supabase.from('shadow_scope_qualifications').select('*').eq('run_id', runId).order('created_at'),
    supabase.from('shadow_scope_exclusions').select('*').eq('run_id', runId).order('risk_level'),
  ]);

  return {
    items: (itemsRes.data ?? []) as ShadowScopeItem[],
    gaps: (gapsRes.data ?? []) as ShadowScopeGap[],
    qualifications: (qualsRes.data ?? []) as ShadowScopeQualification[],
    exclusions: (exclusionsRes.data ?? []) as ShadowScopeExclusion[],
  };
}
