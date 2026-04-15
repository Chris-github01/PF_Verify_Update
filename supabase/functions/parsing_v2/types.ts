export type TradeType =
  | "passive_fire"
  | "plumbing"
  | "electrical"
  | "hvac"
  | "active_fire"
  | "carpentry"
  | "unknown";

export interface StructureSection {
  heading: string;
  startLine: number;
  endLine: number;
  level: number;
}

export interface StructureTable {
  startLine: number;
  endLine: number;
  columnCount: number;
  headerLine: string | null;
}

export interface StructureBlock {
  label: string;
  startLine: number;
  endLine: number;
}

export interface DocumentStructure {
  sections: StructureSection[];
  tables: StructureTable[];
  blocks: StructureBlock[];
  metadata: {
    lineCount: number;
    estimatedTradeType: TradeType;
    hasPageMarkers: boolean;
    hasLevelStructure: boolean;
    hasSectionSubtotals: boolean;
    grandTotal: number | null;
  };
}

export interface SmartChunk {
  chunkText: string;
  section: string;
  block: string | null;
  pageRange: [number, number] | null;
  startLine: number;
  endLine: number;
  estimatedItemCount: number;
}

export interface RawLineItem {
  description: string;
  qty: number | null;
  unit: string | null;
  rate: number | null;
  total: number | null;
  sourceLineIndex: number;
  rawLine: string;
  confidence: "high" | "medium" | "low";
  parseMethod: "deterministic" | "llm" | "inferred";
  normalization_confidence?: number;
}

export interface NormalizedLineItem {
  description: string;
  qty: number;
  unit: string;
  rate: number;
  total: number;
  section: string;
  block: string | null;
  isOptional: boolean;
  isAdjustment: boolean;
  isSummaryRow: boolean;
  frr: string | null;
  sourceChunk: number;
  confidence: "high" | "medium" | "low";
  parseMethod: "deterministic" | "llm" | "inferred";
}

export interface ValidationIssue {
  type:
    | "math_mismatch"
    | "zero_total"
    | "negative_total"
    | "duplicate"
    | "missing_description"
    | "document_total_gap"
    | "implausible_rate"
    | "implausible_qty"
    | "significant_total_mismatch";
  severity: "error" | "warning";
  itemIndex: number | null;
  message: string;
  details?: Record<string, unknown>;
}

export interface ValidationResult {
  validItems: NormalizedLineItem[];
  invalidItems: NormalizedLineItem[];
  issues: ValidationIssue[];
  score: number;
  itemsTotal: number;
  documentTotal: number | null;
  documentTotalGap: number | null;
  documentTotalGapPct: number | null;
  parsingGap: number;
  parsingGapPercent: number;
  hasGap: boolean;
  hasCriticalErrors: boolean;
}

export interface ParsingV2Result {
  success: boolean;
  items: NormalizedLineItem[];
  validation: ValidationResult;
  structure: DocumentStructure;
  chunks: SmartChunk[];
  meta: {
    totalChunks: number;
    chunksWithDeterministicItems: number;
    chunksWithLlmFallback: number;
    rawItemCount: number;
    finalItemCount: number;
    documentTotal: number | null;
    itemsTotal: number;
    processingMs: number;
    parserVersion: string;
  };
  error?: string;
}

export interface ParseV2Request {
  text: string;
  tradeType?: TradeType;
  documentTotal?: number;
  filename?: string;
  openaiApiKey?: string;
}
