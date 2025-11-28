import { supabase } from '../supabase';

// SUPER ADMIN EMAIL LIST - Edit this to add/remove super admins
const SUPER_ADMIN_EMAILS = [
  'your-email@domain.com',
  'backup@domain.com'
];

export function isSuperAdmin(email: string | undefined): boolean {
  if (!email) return false;
  return SUPER_ADMIN_EMAILS.includes(email.toLowerCase());
}

export async function requireSuperAdmin(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('Not authenticated');
  }

  if (!isSuperAdmin(session.user.email)) {
    throw new Error('Super admin access required');
  }

  return true;
}

export async function logAdminAction(
  action: string,
  targetType?: string,
  targetId?: string,
  details?: Record<string, any>
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session || !isSuperAdmin(session.user.email)) {
    console.warn('Attempted admin action without super admin access');
    return;
  }

  try {
    const { error } = await supabase.rpc('log_admin_action', {
      p_admin_email: session.user.email,
      p_action: action,
      p_target_type: targetType || null,
      p_target_id: targetId || null,
      p_details: details || {}
    });

    if (error) {
      console.error('Failed to log admin action:', error);
    }
  } catch (err) {
    console.error('Error logging admin action:', err);
  }
}
