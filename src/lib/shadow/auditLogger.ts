import { supabase } from '../supabase';

interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string;
  moduleKey?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export async function logAdminAction(entry: AuditEntry): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from('admin_audit_log').insert({
    actor_user_id: user.id,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    module_key: entry.moduleKey,
    before_json: entry.before,
    after_json: entry.after,
    metadata_json: entry.metadata ?? {},
    created_at: new Date().toISOString(),
  });
}

export async function getAuditLog(filters?: {
  moduleKey?: string;
  entityType?: string;
  actorUserId?: string;
  action?: string;
  limit?: number;
}) {
  let q = supabase
    .from('admin_audit_log')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters?.moduleKey) q = q.eq('module_key', filters.moduleKey);
  if (filters?.entityType) q = q.eq('entity_type', filters.entityType);
  if (filters?.actorUserId) q = q.eq('actor_user_id', filters.actorUserId);
  if (filters?.action) q = q.ilike('action', `%${filters.action}%`);
  q = q.limit(filters?.limit ?? 200);

  const { data } = await q;
  return data ?? [];
}
