import type { QuoteIntelligenceAnalysis } from '../../types/quoteIntelligence.types';
import type { DashboardMode } from '../../App';
import { analyzeQuoteIntelligenceHybrid } from './hybridAnalyzer';

export async function analyzeQuoteIntelligence(
  projectId: string,
  dashboardMode?: DashboardMode,
  quoteIds?: string[],
  trade?: string
): Promise<QuoteIntelligenceAnalysis> {
  return analyzeQuoteIntelligenceHybrid(projectId, dashboardMode, quoteIds, trade);
}
