export type ValidationStatus = 'validated' | 'conditional' | 'not_comparable';

export interface ValidationNote {
  check: string;
  status: 'pass' | 'warn' | 'fail';
  score?: number;
  message: string;
}

export interface CommercialValidationResult {
  id?: string;
  run_id: string;
  trade_key: string;

  total_suppliers: number;
  comparable_suppliers: number;

  has_optionals: boolean;
  optionals_normalized: boolean;

  has_provisional_quantities: boolean;
  provisional_risk_score: number;

  exclusion_mismatch_score: number;

  quantity_alignment_score: number;
  match_confidence_score: number;

  scope_completeness_variance: number;

  normalization_applied: boolean;

  validation_status: ValidationStatus;
  validation_notes: ValidationNote[];

  created_at?: string;
}

export interface SupplierQIData {
  quoteId: string;
  supplierName: string;
  matchedGroups: MatchedGroupSummary[];
  unmatchedItemCount: number;
  normalizationApplied: boolean;
  rawTotal: number;
  normalizedTotal: number;
  qualificationFlags: string[];
  exclusionNotes: string[];
  optionalLines: number;
}

export interface MatchedGroupSummary {
  normalizedKey: string;
  canonicalDescription: string;
  matchConfidence: number;
  quantityDeviation: number | null;
  withinTolerance: boolean;
}

export const QUANTITY_TOLERANCE = 0.15;
export const ALIGNMENT_THRESHOLD = 0.8;
export const CONFIDENCE_THRESHOLD = 0.75;
export const PROVISIONAL_HIGH_RISK = 0.1;
