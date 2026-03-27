import { supabase } from '../../supabase';

export type CorrectionType =
  | 'total_correction'
  | 'line_item_add'
  | 'line_item_remove'
  | 'line_item_edit'
  | 'classification_correction'
  | 'qualification_correction'
  | 'failure_override'
  | 'benchmark_truth_correction';

export type FieldType =
  | 'document_total'
  | 'validated_total'
  | 'line_item'
  | 'classification'
  | 'qualification'
  | 'failure_tag'
  | 'benchmark_truth'
  | 'diagnostics_profile';

export type NoteType =
  | 'general'
  | 'commercial'
  | 'parser_observation'
  | 'supplier_pattern'
  | 'rollout_warning';

export interface AdjudicationEvent {
  id: string;
  run_id: string;
  module_key: string;
  correction_type: CorrectionType;
  field_type: FieldType;
  original_value_json: Record<string, unknown> | null;
  corrected_value_json: Record<string, unknown> | null;
  root_cause_category: string | null;
  human_reason: string | null;
  evidence_json: Record<string, unknown> | null;
  financial_impact_estimate: number | null;
  adjudicated_by: string | null;
  created_at: string;
}

export interface AdjudicationNote {
  id: string;
  run_id: string;
  note_type: NoteType;
  note_text: string;
  created_by: string | null;
  created_at: string;
}

export interface CreateAdjudicationEventInput {
  runId: string;
  moduleKey: string;
  correctionType: CorrectionType;
  fieldType: FieldType;
  originalValue?: Record<string, unknown> | null;
  correctedValue?: Record<string, unknown> | null;
  rootCauseCategory?: string | null;
  humanReason?: string | null;
  evidence?: Record<string, unknown> | null;
  financialImpactEstimate?: number | null;
}

export interface CreateAdjudicationNoteInput {
  runId: string;
  noteType: NoteType;
  noteText: string;
}

export async function createAdjudicationEvent(
  input: CreateAdjudicationEventInput,
): Promise<AdjudicationEvent> {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('adjudication_events')
    .insert({
      run_id: input.runId,
      module_key: input.moduleKey,
      correction_type: input.correctionType,
      field_type: input.fieldType,
      original_value_json: input.originalValue ?? null,
      corrected_value_json: input.correctedValue ?? null,
      root_cause_category: input.rootCauseCategory ?? null,
      human_reason: input.humanReason ?? null,
      evidence_json: input.evidence ?? null,
      financial_impact_estimate: input.financialImpactEstimate ?? null,
      adjudicated_by: user?.id ?? null,
    })
    .select('*')
    .single();

  if (error) throw new Error(`[adjudicationService] createAdjudicationEvent failed: ${error.message}`);
  return data as AdjudicationEvent;
}

export async function createAdjudicationNote(
  input: CreateAdjudicationNoteInput,
): Promise<AdjudicationNote> {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('adjudication_notes')
    .insert({
      run_id: input.runId,
      note_type: input.noteType,
      note_text: input.noteText,
      created_by: user?.id ?? null,
    })
    .select('*')
    .single();

  if (error) throw new Error(`[adjudicationService] createAdjudicationNote failed: ${error.message}`);
  return data as AdjudicationNote;
}

export async function getAdjudicationEvents(runId: string): Promise<AdjudicationEvent[]> {
  const { data, error } = await supabase
    .from('adjudication_events')
    .select('*')
    .eq('run_id', runId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`[adjudicationService] getAdjudicationEvents failed: ${error.message}`);
  return (data ?? []) as AdjudicationEvent[];
}

export async function getAdjudicationNotes(runId: string): Promise<AdjudicationNote[]> {
  const { data, error } = await supabase
    .from('adjudication_notes')
    .select('*')
    .eq('run_id', runId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`[adjudicationService] getAdjudicationNotes failed: ${error.message}`);
  return (data ?? []) as AdjudicationNote[];
}

export async function getAllAdjudicationEvents(
  moduleKey?: string,
  limit = 100,
): Promise<AdjudicationEvent[]> {
  let query = supabase
    .from('adjudication_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (moduleKey) {
    query = query.eq('module_key', moduleKey);
  }

  const { data, error } = await query;
  if (error) throw new Error(`[adjudicationService] getAllAdjudicationEvents failed: ${error.message}`);
  return (data ?? []) as AdjudicationEvent[];
}

export const CORRECTION_TYPE_LABELS: Record<CorrectionType, string> = {
  total_correction: 'Total Correction',
  line_item_add: 'Line Item Added',
  line_item_remove: 'Line Item Removed',
  line_item_edit: 'Line Item Edited',
  classification_correction: 'Classification Correction',
  qualification_correction: 'Qualification Correction',
  failure_override: 'Failure Override',
  benchmark_truth_correction: 'Benchmark Truth Correction',
};

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  document_total: 'Document Total',
  validated_total: 'Validated Total',
  line_item: 'Line Item',
  classification: 'Classification',
  qualification: 'Qualification',
  failure_tag: 'Failure Tag',
  benchmark_truth: 'Benchmark Truth',
  diagnostics_profile: 'Diagnostics Profile',
};

export const NOTE_TYPE_LABELS: Record<NoteType, string> = {
  general: 'General',
  commercial: 'Commercial',
  parser_observation: 'Parser Observation',
  supplier_pattern: 'Supplier Pattern',
  rollout_warning: 'Rollout Warning',
};

export const ROOT_CAUSE_CATEGORIES = [
  'missing_section',
  'total_row_misidentified',
  'duplicate_row',
  'formatting_anomaly',
  'gst_treatment_error',
  'provisional_sum_error',
  'incomplete_parsing',
  'supplier_specific_format',
  'regex_pattern_gap',
  'llm_extraction_error',
  'other',
] as const;

export type RootCauseCategory = typeof ROOT_CAUSE_CATEGORIES[number];
