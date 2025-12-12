import { supabase } from '../supabase';

// Check if user is a platform admin in the database
export async function isSuperAdmin(email: string | undefined): Promise<boolean> {
  if (!email) return false;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data: adminCheck } = await supabase
      .from('platform_admins')
      .select('is_active')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    return !!adminCheck;
  } catch (error) {
    console.error('Error checking super admin status:', error);
    return false;
  }
}

export async function requireSuperAdmin(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('Not authenticated');
  }

  const isAdmin = await isSuperAdmin(session.user.email);
  if (!isAdmin) {
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

  if (!session) {
    console.warn('Attempted admin action without authentication');
    return;
  }

  const isAdmin = await isSuperAdmin(session.user.email);
  if (!isAdmin) {
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
