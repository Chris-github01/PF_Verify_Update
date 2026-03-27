export type RowClassification =
  | 'line_item'
  | 'summary_total'
  | 'subtotal'
  | 'header'
  | 'note'
  | 'unclassified';

export type ReviewStatus =
  | 'unreviewed'
  | 'reviewed_ok'
  | 'reviewed_needs_changes'
  | 'reviewed_blocked';

export type RecommendedOutcome =
  | 'shadow_better'
  | 'needs_review'
  | 'live_better'
  | 'inconclusive'
  | 'systemic_failure';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface ClassifiedRow {
  rowIndex: number;
  rawText: string;
  normalizedDescription: string;
  quantity: number | null;
  unit: string | null;
  rate: number | null;
  amount: number | null;
  classification: RowClassification;
  includedInParsedTotal: boolean;
  exclusionReason: string | null;
  detectionSignals: string[];
  confidenceScore: number;
  matchesDocumentTotal: boolean;
  sumsPriorRows: boolean;
}

export interface TotalRowDetectionResult {
  classification: RowClassification;
  exclusionReason: string | null;
  detectionSignals: string[];
  confidenceScore: number;
  shouldExcludeFromItems: boolean;
  shouldExcludeFromParsedTotal: boolean;
  matchesDocumentTotal: boolean;
  sumsPriorRows: boolean;
}

export interface PlumbingRunLevelSummary {
  parsedValue: number;
  detectedDocumentTotal: number | null;
  differenceToDocumentTotal: number | null;
  includedLineCount: number;
  excludedLineCount: number;
  excludedSummaryRows: ClassifiedRow[];
  suspiciousRows: ClassifiedRow[];
  hasTotalMismatch: boolean;
  hasLikelyFinalTotalAsLineItem: boolean;
  hasDuplicateValueRisk: boolean;
  parserWarnings: string[];
  ruleHitsSummary: Record<string, number>;
}

export interface PlumbingNormalizedOutput {
  rows: ClassifiedRow[];
  summary: PlumbingRunLevelSummary;
  includedRows: ClassifiedRow[];
  excludedRows: ClassifiedRow[];
}

export interface RiskFlag {
  id: string;
  severity: RiskLevel;
  title: string;
  explanation: string;
  suggestedAction: string;
}

export type AnchorType =
  | 'explicit_total_price'
  | 'explicit_grand_total'
  | 'explicit_contract_total'
  | 'explicit_final_total'
  | 'explicit_label'
  | 'final_total_row_live'
  | 'final_total_row_shadow'
  | 'final_total_row_agreed'
  | 'strong_final_summary'
  | 'max_summary'
  | 'detected_live'
  | 'detected_shadow';

export interface TotalCandidate {
  value: number;
  anchorType: AnchorType;
  sourceText: string;
  confidence: number;
  rankingScore: number;
  /** Whether this candidate was selected as the validated total */
  selected: boolean;
  /** Why this candidate was accepted or rejected */
  selectionReason: string;
}

export interface DocumentTotalValidation {
  /** Raw total extracted by the normaliser (may be from a weak summary row) */
  detectedDocumentTotal: number | null;
  /** Best-anchored total after cross-checking all candidates */
  validatedDocumentTotal: number | null;
  /** Anchor type that won */
  anchorType: AnchorType | null;
  /** Source text of the winning anchor row */
  anchorSourceText: string | null;
  /** Confidence of the winning anchor (0–1) */
  anchorConfidence: number | null;
  /** True when detected and validated totals differ beyond tolerance */
  extractionMismatch: boolean;
  /** Human-readable reason for any mismatch */
  mismatchReason: string | null;
  /** All candidates considered, ordered by ranking score descending */
  candidates: TotalCandidate[];
}

export interface TotalsComparison {
  liveParsedTotal: number;
  shadowParsedTotal: number;
  /** Raw detected document total (may be incorrect) */
  detectedDocumentTotal: number | null;
  /** Validated document total — preferred anchor for gap calculations */
  validatedDocumentTotal: number | null;
  /** True when detected !== validated totals beyond tolerance */
  documentTotalExtractionMismatch: boolean;
  liveDiffToDocument: number | null;
  shadowDiffToDocument: number | null;
  /** Gap calculated against the validated total (positive = under-counted) */
  validatedDocumentGap: number | null;
  shadowIsBetter: boolean;
  shadowTotalDelta: number;
  /** True when live === shadow but both diverge from document_total beyond tolerance */
  isSystemicMiss: boolean;
  /** The absolute gap: document_total - parsed_total (positive = under-counted) */
  documentGap: number | null;
}

export interface RowClassificationChange {
  rowIndex: number;
  rawText: string;
  amount: number | null;
  liveClassification: RowClassification;
  shadowClassification: RowClassification;
  liveIncluded: boolean;
  shadowIncluded: boolean;
  exclusionReason: string | null;
  detectionSignals: string[];
  confidenceScore: number;
}

export interface PlumbingDiff {
  totalsComparison: TotalsComparison;
  documentTotalValidation: DocumentTotalValidation;
  rowClassificationChanges: RowClassificationChange[];
  addedRows: ClassifiedRow[];
  removedRows: ClassifiedRow[];
  changedRows: RowClassificationChange[];
  riskFlags: RiskFlag[];
  recommendedOutcome: RecommendedOutcome;
  adjudicationSummary: string;
  liveExcludedRows: ClassifiedRow[];
  shadowExcludedRows: ClassifiedRow[];
  liveSuspiciousRows: ClassifiedRow[];
  shadowSuspiciousRows: ClassifiedRow[];
  /** Set when both parsers agree but both diverge from document total */
  systemicFailure: boolean;
}

export interface PlumbingAdjudicationDraft {
  moduleKey: 'plumbing_parser';
  sourceType: string;
  sourceId: string;
  runId: string;
  compareSummary: string;
  totalsComparison: TotalsComparison;
  rowChanges: RowClassificationChange[];
  excludedRows: ClassifiedRow[];
  suspiciousRows: ClassifiedRow[];
  riskFlags: RiskFlag[];
  recommendedOutcome: RecommendedOutcome;
  reviewStatus: ReviewStatus;
  adminNote?: string;
}
