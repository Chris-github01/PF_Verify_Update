/**
 * Shared types for the dual-mode report system.
 * No calculation logic — purely structural types.
 */

export type ReportMode = 'CLIENT' | 'INTERNAL';

export interface ReportSupplierRow {
  rank: number;
  supplierName: string;
  adjustedTotal: number;
  riskScore: number;
  coveragePercent: number;
  itemsQuoted: number;
  totalItems: number;
  weightedScore?: number;
  notes?: string[];
  quoteId?: string | null;
  projectedTotal?: number;
  variationExposureValue?: number;
  variationExposurePct?: number;
  behaviourClass?: string;
  behaviourRiskTier?: 'low' | 'medium' | 'high' | 'critical';
  scopeGaps?: string[];
  normalizedTotal?: number;
  underallowanceFlag?: boolean;
  recommendationStatus?: 'recommended' | 'narrow_margin' | 'provisional' | 'no_recommendation';
}

export interface ReportRecommendation {
  type: 'best_value' | 'lowest_risk' | 'balanced';
  supplierName: string;
  price: number;
  coverage: number;
  riskScore: number;
  score: number;
}

export interface ReportScoringWeights {
  price: number;
  compliance: number;
  coverage: number;
  risk: number;
}

export interface ApprovalRecord {
  ai_recommended_supplier: string;
  final_approved_supplier: string;
  is_override: boolean;
  override_reason_category?: string;
  override_reason_detail?: string;
  approved_by_email: string;
  approved_at: string;
}

export interface ReportOptions {
  mode: ReportMode;
  projectName: string;
  clientName?: string;
  generatedAt: string;
  generatedByEmail?: string;
  reportId?: string;
  suppliers: ReportSupplierRow[];
  recommendations: ReportRecommendation[];
  scoringWeights?: ReportScoringWeights;
  executiveSummary?: string;
  keyDecisionDrivers?: string[];
  commercialWarning?: string;
  commercialControlsRequired?: string[];
  approvalRecord?: ApprovalRecord;
  organisationLogoUrl?: string;
  additionalSections?: Array<{ title: string; content: string }>;
  quantityIntelligenceSummary?: {
    linesWithMajorVariance: number;
    linesWithReviewFlag: number;
    underallowedSupplierNames: string[];
  };
}
