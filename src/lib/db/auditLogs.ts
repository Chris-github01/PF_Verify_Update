import { supabase } from '../supabase';
import type { AdminAuditLogRecord } from '../../types/shadow';

export interface AuditLogFilters {
  moduleKey?: string;
  actorUserId?: string;
  action?: string;
  entityType?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
}

export async function dbGetAuditLog(filters: AuditLogFilters = {}): Promise<AdminAuditLogRecord[]> {
  let q = supabase
    .from('admin_audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(filters.limit ?? 200);

  if (filters.moduleKey) q = q.eq('module_key', filters.moduleKey);
  if (filters.actorUserId) q = q.eq('actor_user_id', filters.actorUserId);
  if (filters.entityType) q = q.eq('entity_type', filters.entityType);
  if (filters.fromDate) q = q.gte('created_at', filters.fromDate);
  if (filters.toDate) q = q.lte('created_at', filters.toDate);

  if (filters.action) q = q.ilike('action', `%${filters.action}%`);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as AdminAuditLogRecord[];
}

export async function dbGetRecentAuditLog(limit = 20): Promise<AdminAuditLogRecord[]> {
  const { data } = await supabase
    .from('admin_audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as AdminAuditLogRecord[];
}
