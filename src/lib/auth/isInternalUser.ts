import { supabase } from '../supabase';
import { getAdminRole } from '../shadow/shadowAccess';

const INTERNAL_EMAIL_DOMAINS: string[] = [];

export async function isInternalUser(): Promise<boolean> {
  const role = await getAdminRole();
  if (role === 'god_mode' || role === 'internal_admin') return true;

  if (INTERNAL_EMAIL_DOMAINS.length > 0) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email) {
      const domain = user.email.split('@')[1] ?? '';
      if (INTERNAL_EMAIL_DOMAINS.includes(domain)) return true;
    }
  }

  return false;
}

export async function getCurrentUserOrgId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('organisation_members')
    .select('organisation_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('joined_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  return data?.organisation_id ?? null;
}
