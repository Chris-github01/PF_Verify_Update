import { supabase } from '../../supabase';
import { emitEvent } from '../eventBus';

export type PatternType = 'total_row' | 'header_row' | 'unit_mismatch' | 'classification_error' | 'price_format' | 'quantity_format' | 'scope_gap' | 'custom';

export interface CrossTradePattern {
  id: string;
  pattern_key: string;
  pattern_type: PatternType;
  description: string;
  affected_modules: string[];
  occurrence_counts: Record<string, number>;
  first_detected_in: string;
  confidence_score: number;
  suggested_rule_changes_json: Record<string, unknown>;
  status: 'active' | 'resolved' | 'monitoring' | 'dismissed';
  created_at: string;
  updated_at: string;
}

export interface CrossTradeSuggestion {
  id: string;
  source_module: string;
  target_module: string;
  origin_event_id?: string;
  origin_pattern_id?: string;
  suggestion_type: 'rule_import' | 'pattern_share' | 'threshold_align' | 'review_insight';
  description: string;
  suggested_changes_json: Record<string, unknown>;
  confidence_score: number;
  status: 'pending' | 'accepted' | 'rejected' | 'superseded';
  admin_notes?: string;
  created_at: string;
}

export async function dbGetCrossTradePatterns(opts: { status?: string; limit?: number } = {}): Promise<CrossTradePattern[]> {
  let q = supabase
    .from('cross_trade_patterns')
    .select('*')
    .order('confidence_score', { ascending: false })
    .limit(opts.limit ?? 100);
  if (opts.status) q = q.eq('status', opts.status);
  const { data } = await q;
  return (data ?? []) as CrossTradePattern[];
}

export async function dbCreateCrossTradePattern(pattern: Omit<CrossTradePattern, 'id' | 'created_at' | 'updated_at'>): Promise<CrossTradePattern> {
  const { data, error } = await supabase
    .from('cross_trade_patterns')
    .upsert({ ...pattern, updated_at: new Date().toISOString() }, { onConflict: 'pattern_key' })
    .select()
    .single();
  if (error) throw error;
  return data as CrossTradePattern;
}

export async function dbGetCrossTradeSuggestions(opts: { status?: string; targetModule?: string; limit?: number } = {}): Promise<CrossTradeSuggestion[]> {
  let q = supabase
    .from('cross_trade_suggestions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 100);
  if (opts.status)       q = q.eq('status', opts.status);
  if (opts.targetModule) q = q.eq('target_module', opts.targetModule);
  const { data } = await q;
  return (data ?? []) as CrossTradeSuggestion[];
}

export async function dbCreateCrossTradeSuggestion(
  suggestion: Omit<CrossTradeSuggestion, 'id' | 'created_at'>
): Promise<CrossTradeSuggestion> {
  const { data, error } = await supabase
    .from('cross_trade_suggestions')
    .insert(suggestion)
    .select()
    .single();
  if (error) throw error;
  return data as CrossTradeSuggestion;
}

export async function dbUpdateSuggestionStatus(
  id: string,
  status: CrossTradeSuggestion['status'],
  adminNotes?: string
): Promise<void> {
  await supabase.from('cross_trade_suggestions').update({
    status,
    ...(adminNotes ? { admin_notes: adminNotes } : {}),
  }).eq('id', id);
}

export function detectCrossTradePattern(
  patternKey: string,
  patternType: PatternType,
  description: string,
  sourceModule: string,
  targetModules: string[]
): Omit<CrossTradePattern, 'id' | 'created_at' | 'updated_at'> {
  const occurrenceCounts: Record<string, number> = { [sourceModule]: 1 };
  for (const m of targetModules) occurrenceCounts[m] = 0;

  return {
    pattern_key: patternKey,
    pattern_type: patternType,
    description,
    affected_modules: [sourceModule, ...targetModules],
    occurrence_counts: occurrenceCounts,
    first_detected_in: sourceModule,
    confidence_score: 5.0,
    suggested_rule_changes_json: {},
    status: 'active',
  };
}

export async function propagateCrossTradePattern(
  pattern: CrossTradePattern,
  sourceModule: string
): Promise<void> {
  const otherModules = pattern.affected_modules.filter((m) => m !== sourceModule);

  for (const targetModule of otherModules) {
    if (targetModule === 'passive_fire_parser') continue;

    await dbCreateCrossTradeSuggestion({
      source_module: sourceModule,
      target_module: targetModule,
      origin_pattern_id: pattern.id,
      suggestion_type: 'pattern_share',
      description: `Pattern '${pattern.pattern_key}' detected in ${sourceModule} — may apply to ${targetModule}`,
      suggested_changes_json: { pattern_key: pattern.pattern_key, pattern_type: pattern.pattern_type },
      confidence_score: pattern.confidence_score * 0.7,
      status: 'pending',
    });
  }

  await emitEvent({
    source_module: sourceModule,
    event_type: 'pattern_identified',
    severity: 'info',
    payload_json: { pattern_key: pattern.pattern_key, affected_modules: pattern.affected_modules },
    related_module_keys: pattern.affected_modules,
  });
}

export const KNOWN_CROSS_TRADE_PATTERNS: Omit<CrossTradePattern, 'id' | 'created_at' | 'updated_at'>[] = [
  {
    pattern_key: 'total_incl_gst_misclassification',
    pattern_type: 'total_row',
    description: '"Total Incl GST" rows being treated as line items instead of summary totals across multiple trades',
    affected_modules: ['plumbing_parser', 'active_fire_parser', 'electrical_parser', 'hvac_parser'],
    occurrence_counts: { plumbing_parser: 12, active_fire_parser: 0, electrical_parser: 0, hvac_parser: 0 },
    first_detected_in: 'plumbing_parser',
    confidence_score: 8.5,
    suggested_rule_changes_json: { ruleKey: 'total_row_detection', pattern: 'total incl gst', changeType: 'pattern_add' },
    status: 'active',
  },
  {
    pattern_key: 'header_row_inclusion',
    pattern_type: 'header_row',
    description: 'Section headers being included as billable line items across multiple trades',
    affected_modules: ['plumbing_parser', 'electrical_parser', 'hvac_parser'],
    occurrence_counts: { plumbing_parser: 8, electrical_parser: 0, hvac_parser: 0 },
    first_detected_in: 'plumbing_parser',
    confidence_score: 7.0,
    suggested_rule_changes_json: { ruleKey: 'header_row_detection', changeType: 'pattern_add' },
    status: 'active',
  },
  {
    pattern_key: 'percentage_price_misparse',
    pattern_type: 'price_format',
    description: 'Percentage values (markup, margin) being parsed as unit rates',
    affected_modules: ['plumbing_parser', 'active_fire_parser', 'electrical_parser'],
    occurrence_counts: { plumbing_parser: 5, active_fire_parser: 0, electrical_parser: 0 },
    first_detected_in: 'plumbing_parser',
    confidence_score: 6.5,
    suggested_rule_changes_json: { ruleKey: 'price_validation', pattern: '^\\d{1,2}%$', changeType: 'pattern_add' },
    status: 'active',
  },
];
