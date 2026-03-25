import { useEffect, useState } from 'react';
import { Shield, Lock } from 'lucide-react';
import { isAdminUser, isGodMode } from '../../lib/shadow/shadowAccess';

interface Props {
  children: React.ReactNode;
  requireGodMode?: boolean;
}

export default function ShadowGuard({ children, requireGodMode = false }: Props) {
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
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
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-red-950 border border-red-800 flex items-center justify-center mx-auto">
            <Lock className="w-8 h-8 text-red-400" />
          </div>
          <h1 className="text-xl font-semibold text-white">Access Denied</h1>
          <p className="text-gray-400 text-sm max-w-sm">
            {requireGodMode
              ? 'This area requires god_mode privileges.'
              : 'This area requires god_mode or internal_admin privileges.'}
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
