import { useState } from 'react';
import ReportsHub from './ReportsHub';
import AwardReport from './AwardReport';
import type { DashboardMode } from '../App';

interface EnhancedReportsHubProps {
  projectId: string;
  projects: any[];
  onNavigateBackToScope: () => void;
  onNavigateBackToDashboard: () => void;
  dashboardMode?: DashboardMode;
}

export default function EnhancedReportsHub(props: EnhancedReportsHubProps) {
  const [view, setView] = useState<'hub' | 'award-report' | 'equalisation' | 'trade-analysis'>('hub');
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  const handleNavigate = (path: 'award-report' | 'equalisation' | 'trade-analysis', reportId?: string) => {
    if (reportId) {
      setSelectedReportId(reportId);
    }
    setView(path);
  };

  const handleBackToHub = () => {
    setView('hub');
    setSelectedReportId(null);
  };

  if (view === 'award-report') {
    return (
      <AwardReport
        projectId={props.projectId}
        reportId={selectedReportId || undefined}
        onNavigate={handleBackToHub}
        dashboardMode={props.dashboardMode}
      />
    );
  }

  return (
    <ReportsHub
      {...props}
      onNavigate={(path) => handleNavigate(path)}
      dashboardMode={props.dashboardMode}
    />
  );
}
