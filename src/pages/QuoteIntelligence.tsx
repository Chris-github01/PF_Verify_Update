import QuoteIntelligenceReport from './QuoteIntelligenceReport';
import type { DashboardMode } from '../App';

interface QuoteIntelligenceProps {
  projectId: string;
  onNavigateBack: () => void;
  onNavigateNext: () => void;
  dashboardMode?: DashboardMode;
  onQuotesSelected?: (quoteIds: string[]) => void;
}

export default function QuoteIntelligence(props: QuoteIntelligenceProps) {
  return <QuoteIntelligenceReport {...props} />;
}
