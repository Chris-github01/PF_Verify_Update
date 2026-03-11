import QuoteIntelligenceReport from './QuoteIntelligenceReport';
import type { DashboardMode } from '../App';

interface QuoteIntelligenceProps {
  projectId: string;
  onNavigateBack: () => void;
  onNavigateNext: () => void;
  dashboardMode?: DashboardMode;
  onQuotesSelected?: (quoteIds: string[]) => void;
  workflowStep?: number;
  workflowTotal?: number;
  nextLabel?: string;
  backLabel?: string;
  hideRecommendedActions?: boolean;
}

export default function QuoteIntelligence(props: QuoteIntelligenceProps) {
  return <QuoteIntelligenceReport {...props} />;
}
