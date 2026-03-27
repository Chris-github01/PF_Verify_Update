import { useEffect, useState } from 'react';
import { Shield } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import ShadowLogin from '../../pages/shadow/ShadowLogin';

interface Props {
  children: React.ReactNode;
  requireGodMode?: boolean;
}

async function checkAdminAccess(requireGodMode: boolean): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return false;

    const { data, error } = await supabase
      .from('admin_roles')
      .select('role')
      .eq('user_id', session.user.id)
      .in('role', requireGodMode ? ['god_mode'] : ['god_mode', 'internal_admin'])
      .limit(1);

    if (error) {
      console.error('[shadow] checkAdminAccess error:', error);
      return false;
    }

    const hasAccess = Array.isArray(data) && data.length > 0;
    console.debug(`[shadow] checkAdminAccess: user=${session.user.id} hasAccess=${hasAccess} roles=${JSON.stringify(data)}`);
    return hasAccess;
  } catch (err) {
    console.error('[shadow] checkAdminAccess exception:', err);
    return false;
  }
}

export default function ShadowGuard({ children, requireGodMode = false }: Props) {
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    checkAdminAccess(requireGodMode).then(setAllowed);
  }, [requireGodMode]);

  if (allowed === null) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-400">
          <Shield className="w-5 h-5 animate-pulse" />
          <span className="text-sm">Verifying access...</span>
        </div>
      </div>
    );
  }

  if (!allowed) {
    return <ShadowLogin />;
  }

  return <>{children}</>;
}
