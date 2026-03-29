import type {
  ScopeBucket,
  BehaviourRiskRating,
  GateStatus,
  TrendDirection,
} from './scopeIntelligenceConfig';

export type { ScopeBucket, BehaviourRiskRating, GateStatus, TrendDirection };

export interface RawQuoteItem {
  id: string;
  description: string | null;
  raw_text?: string | null;
  raw_description?: string | null;
  total_price: number | null;
  unit_price?: number | null;
  quantity?: number | null;
  section_context?: string | null;
  is_excluded?: boolean | null;
  scope_category?: string | null;
  source?: string | null;
  validation_flags?: Record<string, unknown> | null;
}

export interface ScopeItemClassification {
  quoteItemId: string;
  quoteId: string;
  projectId: string;
  organisationId: string;
  supplierName: string;
  scopeBucket: ScopeBucket;
  confidence: number;
  reasoning: string;
  anchorPhrasesMatched: string[];
  commercialWeight: number;
  rawTextSnapshot: string;
  sectionContext?: string;
}

export interface SupplierScopeSummary {
  projectId: string;
  quoteId: string;
  organisationId: string;
  supplierName: string;
  submittedTotal: number | null;
  normalisedTotal: number | null;
  coreScope: {
    coveragePct: number;
    itemCount: number;
    weightedValue: number;
  };
  secondaryScope: {
    coveragePct: number;
    itemCount: number;
  };
  excludedScopeCount: number;
  riskScopeCount: number;
  optionalScopeCount: number;
  unknownScopeCount: number;
  summaryOnlyCount: number;
  totalClassifiedItems: number;
  scopeConfidenceScore: number;
  likelyVariationExposureScore: number;
  scopeSummaryText: string;
  classificationVersion: string;
  computedAt: string;
}

export interface BehaviourProfile {
  id?: string;
  organisationId: string;
  supplierName: string;
  tradeType: string;
  totalTendersSeen: number;
  totalWins: number;
  avgCoreScopeCoveragePct: number;
  avgSecondaryScopeCoveragePct: number;
  avgExcludedScopeCount: number;
  avgRiskScopeCount: number;
  avgUnknownScopeCount: number;
  avgVariationExposureScore: number;
  historicalRedFlagCount: number;
  behaviourRiskRating: BehaviourRiskRating;
  confidenceScore: number;
  trendDirection: TrendDirection;
  trendSummary: string;
  lastTenderAt: string | null;
  profileSummaryText?: string;
}

export interface BehaviourEvent {
  organisationId: string;
  projectId: string;
  supplierName: string;
  tradeType: string;
  eventType: string;
  eventSubtype?: string;
  eventPayload: Record<string, unknown>;
  severity: 'info' | 'warning' | 'critical';
}

export interface TenderSnapshot {
  organisationId: string;
  projectId: string;
  quoteId: string | null;
  supplierName: string;
  tradeType: string;
  submittedTotal: number | null;
  normalisedTotal: number | null;
  coreScopeCoveragePct: number;
  secondaryScopeCoveragePct: number;
  excludedScopeCount: number;
  riskScopeCount: number;
  unknownScopeCount: number;
  scopeConfidenceScore: number;
  likelyVariationExposureScore: number;
  decisionGateStatus: GateStatus;
  gateReasons: string[];
  wasRecommended: boolean;
  wasLowestPrice: boolean;
}

export interface GateReason {
  dimension: string;
  status: GateStatus;
  message: string;
  value?: number | string;
  threshold?: number | string;
}

export interface DecisionGateResult {
  supplierName: string;
  quoteId: string;
  projectId: string;
  organisationId: string;
  gateStatus: GateStatus;
  gateReasons: GateReason[];
  gateSummary: string;
  canBeRecommended: boolean;
  canBeBestTenderer: boolean;
  overrideRequired: boolean;
  evaluatedAt: string;
}

export interface CommercialIntelligencePayload {
  projectId: string;
  organisationId: string;
  tradeType: string;
  suppliers: Array<{
    supplierName: string;
    quoteId: string;
    submittedTotal: number | null;
    normalisedTotal?: number | null;
    items: RawQuoteItem[];
    isLowestPrice?: boolean;
  }>;
}

export interface SupplierIntelligenceView {
  supplierName: string;
  quoteId: string;
  submittedTotal: number | null;
  normalisedTotal: number | null;
  scopeSummary: SupplierScopeSummary | null;
  behaviourProfile: BehaviourProfile | null;
  gateResult: DecisionGateResult | null;
  isLowestPrice: boolean;
  isCheapestButGated: boolean;
}
