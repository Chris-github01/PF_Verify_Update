import { supabase } from '../supabase';
import type { ShadowDraftRecord, DraftStatus } from '../../types/shadow';

export async function dbGetDraftsForModule(moduleKey: string): Promise<ShadowDraftRecord[]> {
  const { data, error } = await supabase
    .from('shadow_drafts')
    .select('*')
    .eq('module_key', moduleKey)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ShadowDraftRecord[];
}

export async function dbGetDraftsBySourceId(sourceId: string): Promise<ShadowDraftRecord[]> {
  const { data, error } = await supabase
    .from('shadow_drafts')
    .select('*')
    .eq('source_id', sourceId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ShadowDraftRecord[];
}

export async function dbCreateDraft(draft: {
  module_key: string;
  source_type: string;
  source_id: string;
  draft_name: string;
  payload_json: Record<string, unknown>;
}): Promise<ShadowDraftRecord> {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('shadow_drafts')
    .insert({
      ...draft,
      status: 'draft',
      created_by: user?.id,
    })
    .select()
    .single();

  if (error) throw error;
  return data as ShadowDraftRecord;
}

export async function dbUpdateDraftStatus(draftId: string, status: DraftStatus): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();

  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === 'approved') updates.approved_by = user?.id;
  if (status === 'promoted') updates.promoted_by = user?.id;

  await supabase.from('shadow_drafts').update(updates).eq('id', draftId);
}

export async function dbGetAllDrafts(filters?: { status?: DraftStatus; limit?: number }): Promise<ShadowDraftRecord[]> {
  let q = supabase
    .from('shadow_drafts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(filters?.limit ?? 100);

  if (filters?.status) q = q.eq('status', filters.status);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ShadowDraftRecord[];
}
