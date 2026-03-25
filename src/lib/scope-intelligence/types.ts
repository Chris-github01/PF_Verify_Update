export type ScopeClassification =
  | "main_scope"
  | "total_line"
  | "exclusion"
  | "qualification"
  | "optional_item"
  | "narrative"
  | "unknown";

export type RiskSignalTag =
  | "by_others"
  | "no_allowance"
  | "subject_to"
  | "tbc"
  | "provisional"
  | "optional"
  | "excluded"
  | "client_supply"
  | "supply_by_others"
  | "install_by_others";

export interface ScopeIntelligenceLine {
  originalIndex: number;
  description: string;
  value: number | null;
  classification: ScopeClassification;
  confidence: number;
  reasons: string[];
  shouldCountInScopeTotal: boolean;
  riskSignals: RiskSignalTag[];
}

export interface ScopeIntelligenceResult {
  lines: ScopeIntelligenceLine[];
  countedLines: ScopeIntelligenceLine[];
  excludedLines: ScopeIntelligenceLine[];
  detectedTotals: ScopeIntelligenceLine[];
  calculatedScopeTotal: number;
  detectedDocumentTotal: number | null;
  discrepancy: number | null;
  summary: {
    mainScopeCount: number;
    exclusionCount: number;
    qualificationCount: number;
    optionalCount: number;
    totalLineCount: number;
    narrativeCount: number;
    unknownCount: number;
  };
}

export interface RawParsedLine {
  description?: string | null;
  qty?: number | string | null;
  unit?: string | null;
  rate?: number | string | null;
  total?: number | string | null;
  total_price?: number | string | null;
  amount?: number | string | null;
  section?: string | null;
  service_type?: string | null;
  raw_text?: string | null;
  [key: string]: unknown;
}
