export type DuplicateRiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';
export type OverlapRiskLevel = 'none' | 'low' | 'medium' | 'high';
export type FlagSeverity = 'low' | 'medium' | 'high' | 'critical';
export type LineIntent =
  | 'core_scope'
  | 'provisional_extra'
  | 'unit_entry_subset'
  | 'optional_scope'
  | 'insulation_dependency'
  | 'summary_only'
  | 'review_required';

export type DuplicationFlagType =
  | 'duplicate_signature'
  | 'subset_overlap_unit_entry'
  | 'provisional_extra_not_merged'
  | 'optional_scope_excluded'
  | 'dependency_without_parent'
  | 'system_conflict'
  | 'summary_line_excluded'
  | 'classification_conflict'
  | 'quantity_inflation_risk';

export type CommercialTag =
  | 'Likely double count'
  | 'Potential subset overlap'
  | 'Provisional add-on outside safe BOQ'
  | 'Alternative system pricing on same penetration'
  | 'Standalone dependency item'
  | 'Summary line excluded'
  | 'Optional scope excluded'
  | 'Classification conflict';

export interface RawQuoteLineReference {
  supplierId: string;
  quoteId: string;
  quoteItemId: string;
  sourceLineNumber: number;
  sourceDescription: string;
  sourceSection: string;
  rawQuantity: number;
  rawUnitRate: number;
  rawTotal: number;
}

export interface PenetrationSignature {
  trade: string;
  service: string;
  serviceType: string;
  sizeNormalized: string;
  substrateNormalized: string;
  frlNormalized: string;
  orientationNormalized: string;
  locationClass: string;
  insulationState: 'with_insulation' | 'without_insulation' | 'insulation_only' | 'unknown';
  unitEntryFlag: boolean;
  optionalFlag: boolean;
  extraOverFlag: boolean;
  provisionalFlag: boolean;
}

export interface NormalizedPenetrationLine {
  normalizedLineId: string;
  supplierId: string;
  trade: string;
  signature: PenetrationSignature;
  signatureKey: string;
  canonicalDescription: string;
  intent: LineIntent;
  quantityRawSum: number;
  quantitySafe: number;
  quantityVerified: number;
  quantityProvisional: number;
  quantityOptional: number;
  quantityDependency: number;
  rawUnitRate: number;
  rawValueTotal: number;
  safeValueTotal: number;
  verifiedValueTotal: number;
  provisionalValueTotal: number;
  optionalValueTotal: number;
  dependencyValueTotal: number;
  duplicateRiskLevel: DuplicateRiskLevel;
  overlapRiskLevel: OverlapRiskLevel;
  pricingStrategyTag: string;
  chosenSystem: string;
  alternativeSystems: string[];
  includedSourceRefs: RawQuoteLineReference[];
  excludedSourceRefs: RawQuoteLineReference[];
  reasoning: string[];
  confidence: number;
}

export interface DuplicationFlag {
  flagId: string;
  supplierId: string;
  severity: FlagSeverity;
  flagType: DuplicationFlagType;
  commercialTag: CommercialTag;
  normalizedLineId: string;
  signatureKey: string;
  quoteItemIds: string[];
  explanation: string;
  commercialImpact: string;
  quantityAtRisk: number;
  valueAtRisk: number;
  affectedSourceLines: RawQuoteLineReference[];
}

export interface NormalizationAuditSummary {
  supplierId: string;
  supplierName: string;
  trade: string;
  rawLineCount: number;
  normalizedLineCount: number;
  rawQuantityTotal: number;
  safeQuantityTotal: number;
  verifiedQuantityTotal: number;
  provisionalQuantityTotal: number;
  optionalQuantityTotal: number;
  dependencyQuantityTotal: number;
  rawValueTotal: number;
  safeValueTotal: number;
  verifiedValueTotal: number;
  provisionalValueTotal: number;
  optionalValueTotal: number;
  dependencyValueTotal: number;
  quantityAtRisk: number;
  valueAtRisk: number;
  duplicateFlagsCount: number;
  overlapFlagsCount: number;
  systemConflictCount: number;
  provisionalCount: number;
  optionalCount: number;
  dependencyCount: number;
  summaryLinesExcluded: number;
  commercialVerdict: string;
  verdictSeverity: FlagSeverity | 'safe';
}

export interface BoqNormalisationResult {
  projectId: string;
  trade: string;
  runId: string;
  runAt: string;
  config: BoqNormalisationConfig;
  normalizedLines: NormalizedPenetrationLine[];
  duplicationFlags: DuplicationFlag[];
  auditSummaries: NormalizationAuditSummary[];
  normalizedBoqBySupplier: Record<string, NormalizedPenetrationLine[]>;
  normalizationAuditSummaryBySupplier: Record<string, NormalizationAuditSummary>;
  duplicationFlagsBySupplier: Record<string, DuplicationFlag[]>;
}

export interface BoqNormalisationConfig {
  enableBoqNormalization: boolean;
  includeProvisionalInScenarioTotals: boolean;
  mergeUnitEntryIntoGeneral: boolean;
  strictSystemConflictMode: boolean;
  shadowAdminOnly: boolean;
}

export const DEFAULT_BOQ_NORMALISATION_CONFIG: BoqNormalisationConfig = {
  enableBoqNormalization: true,
  includeProvisionalInScenarioTotals: false,
  mergeUnitEntryIntoGeneral: false,
  strictSystemConflictMode: true,
  shadowAdminOnly: true,
};

export interface SignatureGroup {
  signatureKey: string;
  signature: PenetrationSignature;
  lines: Array<{
    sourceRef: RawQuoteLineReference;
    intent: LineIntent;
    detectedSystems: string[];
  }>;
}
