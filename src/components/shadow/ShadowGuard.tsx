import { useEffect, useState } from 'react';
import { Shield } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import ShadowLogin from '../../pages/shadow/ShadowLogin';

interface Props {
  children: React.ReactNode;
  requireGodMode?: boolean;
}

async function checkAdminAccess(requireGodMode: boolean): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return false;

  const rolesFilter = requireGodMode ? 'god_mode' : 'god_mode,internal_admin';
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/admin_roles?user_id=eq.${session.user.id}&role=in.(${rolesFilter})&limit=1`,
    {
      headers: {
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${session.access_token}`,
      },
    }
  );

  if (!response.ok) return false;
  const roles = await response.json();
  return Array.isArray(roles) && roles.length > 0;
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
