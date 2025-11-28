import ImportQuotes from './ImportQuotes';

interface EnhancedImportQuotesProps {
  projectId: string;
  onQuotesImported: () => void;
  onNavigateToDashboard: () => void;
  onNavigateToNext: () => void;
  dashboardMode?: 'original' | 'revisions';
}

export default function EnhancedImportQuotes(props: EnhancedImportQuotesProps) {
  return <ImportQuotes {...props} />;
}
