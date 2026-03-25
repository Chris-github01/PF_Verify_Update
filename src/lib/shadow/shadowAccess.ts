import { supabase } from '../supabase';
import type { AdminRole } from '../../types/shadow';

let cachedRole: AdminRole | null | undefined = undefined;

export async function getAdminRole(): Promise<AdminRole | null> {
  if (cachedRole !== undefined) return cachedRole;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    cachedRole = null;
    return null;
  }

  const { data, error } = await supabase
    .from('admin_roles')
    .select('role')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    cachedRole = null;
    return null;
  }

  cachedRole = data.role as AdminRole;
  return cachedRole;
}

export function clearRoleCache() {
  cachedRole = undefined;
}

export async function isGodMode(): Promise<boolean> {
  const role = await getAdminRole();
  return role === 'god_mode';
}

export async function isAdminUser(): Promise<boolean> {
  const role = await getAdminRole();
  return role === 'god_mode' || role === 'internal_admin';
}

export async function requireGodMode(): Promise<void> {
  const ok = await isGodMode();
  if (!ok) throw new Error('god_mode access required');
}

export async function requireAdminAccess(): Promise<void> {
  const ok = await isAdminUser();
  if (!ok) throw new Error('Admin access required');
}
