import { useState } from 'react';
import SCCDashboard from './SCCDashboard';
import SCCScopeLedger from './SCCScopeLedger';
import SCCClaimBuilder from './SCCClaimBuilder';
import SCCVariationRegister from './SCCVariationRegister';

type SCCView =
  | { type: 'dashboard' }
  | { type: 'ledger'; contractId: string }
  | { type: 'claims'; contractId: string }
  | { type: 'variations'; contractId: string };

interface SCCMainProps {
  projectId: string | null;
}

export default function SCCMain({ projectId }: SCCMainProps) {
  const [view, setView] = useState<SCCView>({ type: 'dashboard' });

  switch (view.type) {
    case 'dashboard':
      return (
        <SCCDashboard
          projectId={projectId}
          onNavigateToContract={(contractId) => setView({ type: 'ledger', contractId })}
          onNavigateToNewClaim={(contractId) => setView({ type: 'claims', contractId })}
          onNavigateToVariations={(contractId) => setView({ type: 'variations', contractId })}
        />
      );

    case 'ledger':
      return (
        <SCCScopeLedger
          contractId={view.contractId}
          onBack={() => setView({ type: 'dashboard' })}
          onNavigateToClaims={() => setView({ type: 'claims', contractId: view.contractId })}
        />
      );

    case 'claims':
      return (
        <SCCClaimBuilder
          contractId={view.contractId}
          onBack={() => setView({ type: 'dashboard' })}
        />
      );

    case 'variations':
      return (
        <SCCVariationRegister
          contractId={view.contractId}
          onBack={() => setView({ type: 'dashboard' })}
        />
      );
  }
}
