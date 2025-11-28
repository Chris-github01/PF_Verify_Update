export interface QuoteIntelligenceAnalysis {
  projectId: string;
  quoteIds?: string[];
  quotesAnalyzed: number;
  analyzedAt: string;
  summary: {
    totalRedFlags: number;
    criticalIssues: number;
    coverageScore: number;
    averageQualityScore: number;
    bestValueSupplier: string;
    mostCompleteSupplier: string;
  };
  redFlags: RedFlag[];
  coverageGaps: CoverageGap[];
  systemsDetected: SystemDetected[];
  supplierInsights: SupplierInsight[];
  normalizedItems: NormalizedItem[];
}

export interface RedFlag {
  id: string;
  quoteId: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  title: string;
  description: string;
  recommendation?: string;
}

export interface CoverageGap {
  id: string;
  gapType: string;
  title: string;
  description: string;
  missingIn: string[];
  presentIn: string[];
  estimatedImpact: number;
  recommendation?: string;
}

export interface SystemDetected {
  id: string;
  quoteId: string;
  systemName: string;
  systemType: string;
  itemCount: number;
  totalValue: number;
  confidence: number;
}

export interface SupplierInsight {
  id: string;
  supplierName: string;
  insightType: string;
  title: string;
  description: string;
  recommendation?: string;
}

export interface NormalizedItem {
  quoteId: string;
  supplierName: string;
}
