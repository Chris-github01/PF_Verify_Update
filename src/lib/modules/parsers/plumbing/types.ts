export interface PlumbingSourceRow {
  description?: string | null;
  desc?: string | null;
  item?: string | null;
  qty?: number | string | null;
  quantity?: number | string | null;
  unit?: string | null;
  rate?: number | string | null;
  unit_rate?: number | string | null;
  total?: number | string | null;
  total_price?: number | string | null;
  amount?: number | string | null;
  [key: string]: unknown;
}

export interface PlumbingParserInput {
  sourceType: 'quote' | 'parsing_job';
  sourceId: string;
  rows: PlumbingSourceRow[];
  documentTotal?: number | null;
  supplierName?: string | null;
  metadata?: Record<string, unknown>;
}

export interface PlumbingNormalizedRow {
  rowIndex: number;
  description: string;
  qty: number | null;
  unit: string | null;
  rate: number | null;
  amount: number | null;
  classification: string;
  includedInParsedTotal: boolean;
  exclusionReason: string | null;
  detectionSignals: string[];
  confidenceScore: number;
  matchesDocumentTotal: boolean;
  sumsPriorRows: boolean;
}

export interface PlumbingParserOutput {
  parserVersion: string;
  moduleKey: string;
  sourceId: string;
  sourceType: string;
  parsedValue: number;
  detectedDocumentTotal: number | null;
  differenceToDocumentTotal: number | null;
  includedLineCount: number;
  excludedLineCount: number;
  totalRowCount: number;
  excludedSummaryRows: PlumbingNormalizedRow[];
  suspiciousRows: PlumbingNormalizedRow[];
  includedRows: PlumbingNormalizedRow[];
  allRows: PlumbingNormalizedRow[];
  parserWarnings: string[];
  ruleHitsSummary: Record<string, number>;
  hasTotalMismatch: boolean;
  hasLikelyFinalTotalAsLineItem: boolean;
  hasDuplicateValueRisk: boolean;
  executedAt: string;
}

export interface PlumbingRunResult {
  success: boolean;
  output?: PlumbingParserOutput;
  error?: string;
  durationMs: number;
}

export interface PlumbingClassificationChange {
  rowIndex: number;
  rawText: string;
  amount: number | null;
  liveClassification: string;
  shadowClassification: string;
  liveIncluded: boolean;
  shadowIncluded: boolean;
  exclusionReason: string | null;
  detectionSignals: string[];
  confidenceScore: number;
}

export interface PlumbingRiskFlag {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  explanation: string;
  suggestedAction: string;
}

export interface PlumbingCompareResult {
  liveOutput: PlumbingParserOutput;
  shadowOutput: PlumbingParserOutput;
  liveParsedTotal: number;
  shadowParsedTotal: number;
  totalsDelta: number;
  totalsMatch: boolean;
  detectedDocumentTotal: number | null;
  liveDiffToDocument: number | null;
  shadowDiffToDocument: number | null;
  shadowIsBetter: boolean;
  itemCountDelta: number;
  excludedCountDelta: number;
  changedClassifications: PlumbingClassificationChange[];
  riskFlags: PlumbingRiskFlag[];
  recommendation: 'shadow_better' | 'live_better' | 'needs_review' | 'inconclusive';
  adjudicationSummary: string;
  executedAt: string;
}
