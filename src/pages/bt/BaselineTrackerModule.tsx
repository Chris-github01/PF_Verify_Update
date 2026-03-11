import { useState } from 'react';
import BTDashboard from './BTDashboard';
import BTProjectsList from './BTProjectsList';
import BTCreateProject from './BTCreateProject';
import BTProjectDetail from './BTProjectDetail';
import BTClaimDetail from './BTClaimDetail';

type BTView =
  | 'bt-dashboard'
  | 'bt-projects'
  | 'bt-project-new'
  | 'bt-project-detail'
  | 'bt-claim-detail';

export default function BaselineTrackerModule() {
  const [view, setView] = useState<BTView>('bt-dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);

  const handleNavigate = (target: string, id?: string) => {
    switch (target) {
      case 'bt-dashboard':
        setView('bt-dashboard');
        break;
      case 'bt-projects':
        setView('bt-projects');
        break;
      case 'bt-project-new':
        setView('bt-project-new');
        break;
      case 'bt-project-detail':
        if (id) {
          setSelectedProjectId(id);
          setView('bt-project-detail');
        }
        break;
      case 'bt-claim-detail':
        if (id) {
          setSelectedClaimId(id);
          setView('bt-claim-detail');
        }
        break;
      default:
        setView('bt-dashboard');
    }
  };

  if (view === 'bt-dashboard') {
    return <BTDashboard onNavigate={handleNavigate} />;
  }

  if (view === 'bt-projects') {
    return <BTProjectsList onNavigate={handleNavigate} />;
  }

  if (view === 'bt-project-new') {
    return <BTCreateProject onNavigate={handleNavigate} />;
  }

  if (view === 'bt-project-detail' && selectedProjectId) {
    return <BTProjectDetail projectId={selectedProjectId} onNavigate={handleNavigate} />;
  }

  if (view === 'bt-claim-detail' && selectedClaimId) {
    return <BTClaimDetail claimId={selectedClaimId} onNavigate={handleNavigate} />;
  }

  return <BTDashboard onNavigate={handleNavigate} />;
}
