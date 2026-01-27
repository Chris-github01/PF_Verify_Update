import { useState, useEffect } from 'react';
import ReportsHub from './ReportsHub';
import AwardReport from './AwardReport';
import type { DashboardMode } from '../App';
import { useTrade } from '../lib/tradeContext';

interface EnhancedReportsHubProps {
  projectId: string;
  projects: any[];
  onNavigateBackToScope: () => void;
  onNavigateBackToDashboard: () => void;
  dashboardMode?: DashboardMode;
  preselectedQuoteIds?: string[];
}

export default function EnhancedReportsHub(props: EnhancedReportsHubProps) {
  const { currentTrade } = useTrade();
  const [view, setView] = useState<'hub' | 'award-report' | 'equalisation' | 'trade-analysis'>('hub');
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  // CRITICAL: Clear report selection when trade changes
  useEffect(() => {
    console.log('🔄 EnhancedReportsHub: Trade changed to', currentTrade, '- clearing selectedReportId');
    setSelectedReportId(null);
    setView('hub');
  }, [currentTrade]);

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
        preselectedQuoteIds={props.preselectedQuoteIds}
      />
    );
  }

  return (
    <ReportsHub
      {...props}
      onNavigate={(path) => handleNavigate(path)}
      dashboardMode={props.dashboardMode}
      preselectedQuoteIds={props.preselectedQuoteIds}
    />
  );
}
