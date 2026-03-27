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

function detectGaps(items: { description: string; total: number }[], moduleKey: string): ShadowScopeGap[] {
  const gaps: ShadowScopeGap[] = [];
  const descs = items.map((i) => i.description.toLowerCase()).join(' ');

  const checks: { type: string; keywords: string[]; description: string; expected: string; risk: string }[] = [
    {
      type: 'commissioning',
      keywords: ['test', 'commission', 'flush', 'purge'],
      description: 'No commissioning or testing scope detected',
      expected: 'always_present',
      risk: 'medium',
    },
    {
      type: 'insulation',
      keywords: ['insul', 'lagg'],
      description: 'No pipe insulation scope detected',
      expected: 'likely_present',
      risk: 'low',
    },
    {
      type: 'as_built',
      keywords: ['as built', 'as-built', 'record draw', 'o&m', 'manual'],
      description: 'No as-built drawings or O&M documentation scope detected',
      expected: 'sometimes_present',
      risk: 'low',
    },
  ];

  for (const check of checks) {
    const found = check.keywords.some((kw) => descs.includes(kw));
    if (!found) {
      gaps.push({
        id: crypto.randomUUID(),
        run_id: '',
        missing_scope_type: check.type,
        description: check.description,
        expected_presence: check.expected,
        risk_level: check.risk,
        created_at: new Date().toISOString(),
      });
    }
  }

  return gaps;
}

function detectQualifications(items: { description: string }[]): ShadowScopeQualification[] {
  const quals: ShadowScopeQualification[] = [];
  const qualKeywords = [
    { kw: 'allow', impact: 'provisional_sum' },
    { kw: 'provisional', impact: 'provisional_sum' },
    { kw: 'by others', impact: 'exclusion' },
    { kw: 'not included', impact: 'exclusion' },
    { kw: 'subject to', impact: 'conditional' },
    { kw: 'pending', impact: 'conditional' },
  ];

  for (const item of items) {
    const d = item.description.toLowerCase();
    for (const { kw, impact } of qualKeywords) {
      if (d.includes(kw)) {
        quals.push({
          id: crypto.randomUUID(),
          run_id: '',
          description: item.description.slice(0, 200),
          normalized_description: normalizeDescription(item.description.slice(0, 200)),
          source_text: item.description,
          impact_type: impact,
          created_at: new Date().toISOString(),
        });
        break;
      }
    }
  }

  return quals.slice(0, 20);
}

function detectExclusions(items: { description: string }[]): ShadowScopeExclusion[] {
  const exclusions: ShadowScopeExclusion[] = [];
  const exclusionKeywords = [
    { kw: 'by others', risk: 'medium' },
    { kw: 'not included', risk: 'high' },
    { kw: 'excluded', risk: 'high' },
    { kw: 'not in scope', risk: 'high' },
    { kw: 'n/a', risk: 'low' },
  ];

  for (const item of items) {
    const d = item.description.toLowerCase();
    for (const { kw, risk } of exclusionKeywords) {
      if (d.includes(kw)) {
        exclusions.push({
          id: crypto.randomUUID(),
          run_id: '',
          description: item.description.slice(0, 200),
          normalized_description: normalizeDescription(item.description.slice(0, 200)),
          section: null,
          source_text: item.description,
          risk_level: risk,
          created_at: new Date().toISOString(),
        });
        break;
      }
    }
  }

  return exclusions.slice(0, 20);
}

export async function runScopeIntelligence(
  runId: string,
  moduleKey: string,
  dataset: ResolvedDataset,
): Promise<ScopeIntelligenceResult> {
  const items = dataset.lineItems.slice(0, 300);

  const scopeItems: Omit<ShadowScopeItem, 'id' | 'created_at'>[] = items
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

  if (scopeItems.length > 0) {
    await supabase.from('shadow_scope_items').insert(scopeItems);
  }

  const itemsForGap = items.map((i) => ({
    description: i.description ?? '',
    total: typeof i.total === 'number' ? i.total : 0,
  }));

  const gaps = detectGaps(itemsForGap, moduleKey).map((g) => ({ ...g, run_id: runId }));
  if (gaps.length > 0) {
    await supabase.from('shadow_scope_gaps').insert(
      gaps.map(({ id: _id, created_at: _ca, ...rest }) => rest),
    );
  }

  const quals = detectQualifications(items.map((i) => ({ description: i.description ?? '' }))).map(
    (q) => ({ ...q, run_id: runId }),
  );
  if (quals.length > 0) {
    await supabase.from('shadow_scope_qualifications').insert(
      quals.map(({ id: _id, created_at: _ca, ...rest }) => rest),
    );
  }

  const exclusions = detectExclusions(items.map((i) => ({ description: i.description ?? '' }))).map(
    (e) => ({ ...e, run_id: runId }),
  );
  if (exclusions.length > 0) {
    await supabase.from('shadow_scope_exclusions').insert(
      exclusions.map(({ id: _id, created_at: _ca, ...rest }) => rest),
    );
  }

  return {
    items: scopeItems as ShadowScopeItem[],
    gaps: gaps as ShadowScopeGap[],
    qualifications: quals as ShadowScopeQualification[],
    exclusions: exclusions as ShadowScopeExclusion[],
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
