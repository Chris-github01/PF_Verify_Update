import { useEffect, useState } from 'react';
import { Shield } from 'lucide-react';
import { clearRoleCache, isAdminUser, isGodMode } from '../../lib/shadow/shadowAccess';
import ShadowLogin from '../../pages/shadow/ShadowLogin';

interface Props {
  children: React.ReactNode;
  requireGodMode?: boolean;
}

export default function ShadowGuard({ children, requireGodMode = false }: Props) {
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      // Always clear cache on mount so a fresh sign-in is reflected immediately
      clearRoleCache();
      if (requireGodMode) {
        const god = await isGodMode();
        setAllowed(god);
      } else {
        const admin = await isAdminUser();
        setAllowed(admin);
      }
    })();
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
