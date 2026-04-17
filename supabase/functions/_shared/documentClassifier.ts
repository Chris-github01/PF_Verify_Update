// =============================================================================
// DOCUMENT CLASSIFIER
//
// Classifies a document by STRUCTURE, not by vendor or supplier name.
// Returns a DocumentClass that drives the parser router.
//
// Classes:
//   summary_schedule_pdf  — has both summary totals page AND numbered schedule rows
//   schedule_only_pdf     — numbered row schedules, no authoritative summary page
//   simple_line_items_pdf — short quote with standard qty/rate/total layout
//   scanned_ocr_pdf       — poor OCR quality, broken lines, low table confidence
//   spreadsheet_boq       — xlsx/csv structured columns
//   mixed_unknown         — cannot classify with confidence
// =============================================================================

export type DocumentClass =
  | 'multi_page_boq_summary_pdf'
  | 'summary_schedule_pdf'
  | 'schedule_only_pdf'
  | 'simple_line_items_pdf'
  | 'scanned_ocr_pdf'
  | 'spreadsheet_boq'
  | 'mixed_unknown';

export type CommercialFamily =
  | 'itemized_quote'
  | 'lump_sum_quote'
  | 'hybrid_quote'
  | 'spreadsheet_quote'
  | 'scanned_ocr_quote'
  | 'unknown_quote';

export interface PageData {
  pageNum: number;
  text: string;
}

export interface ClassificationResult {
  documentClass: DocumentClass;
  commercialFamily: CommercialFamily;
  confidence: number; // 0–1
  reasons: string[];
  signals: {
    hasSummaryTotals: boolean;
    hasScheduleRows: boolean;
    hasOptionalScope: boolean;
    hasBlockRowIds: boolean;
    hasPrelimsSection: boolean;
    hasPricedRowsAboveThreshold: boolean;
    hasUnnumberedTableRows: boolean;
    numberedRowCount: number;
    pageCount: number;
    avgLineLength: number;
    tableConfidence: number;
    isSpreadsheet: boolean;
    ocrQuality: 'good' | 'poor' | 'unknown';
  };
}

// ---------------------------------------------------------------------------
// Signal detectors — all structural, no vendor names
// ---------------------------------------------------------------------------

// Summary total labels (broad set — any quote format)
const SUMMARY_TOTAL_PATTERNS: RegExp[] = [
  /Grand\s+Total/i,
  /Contract\s+(Sum|Total|Price)/i,
  /Quote\s+Total/i,
  /Total\s+(excl|ex)\.?\s*(of\s+)?(GST|Tax)/i,
  /Net\s+Total/i,
  /Lump\s+Sum\s+Total/i,
  /Total\s+Price/i,
  /Total\s+Value/i,
  /Sub[\s-]?Total/i,
];

// Optional scope markers
const OPTIONAL_SCOPE_PATTERNS: RegExp[] = [
  /\bOPTIONAL\s+SCOPE\b/i,
  /\bADD\s+TO\s+SCOPE\b/i,
  /\bOPTIONAL\s+EXTRAS\b/i,
  /\bPROVISIONAL\s+SUM\b/i,
  /\bPC\s+SUM\b/i,
];

// Schedule row indicators: numbered rows in table-like layout
const NUMBERED_ROW_RE = /^\s*\d{1,3}[\s\t]+\S/m;
const SCHEDULE_BLOCK_RE = /\bBLOCK\b|\bLEVEL\s+\d\b|\bZONE\s+[A-Z]\b|\bSTAGE\s+\d\b/i;
const TABLE_HEADER_RE = /\b(Description|Item|Qty|Quantity|Unit|Rate|Total|Amount)\b/i;

// Block-style row IDs (e.g. B30, B31-B34) — signals multi-page BOQ with block structure
const BLOCK_ROW_ID_RE = /\bB\d{1,3}\b/;
const BLOCK_ROW_ID_DENSE_RE = /\bB\d{1,3}\b.*\bB\d{1,3}\b/;

// Poor OCR signals
const BROKEN_LINE_RE = /[^\x20-\x7E\n\r\t]{3,}/;
const VERY_SHORT_LINE_RE = /^.{1,4}$/m;

// Prelims / allowances section markers — hybrid-specific signals
const PRELIMS_PATTERNS: RegExp[] = [
  /\bPRELIMS?\b/i,
  /\bPRELIMINARIES\b/i,
  /\bALLOWANCES?\b/i,
  /\bMOBILISATION\b/i,
  /\bSITE\s+ESTABLISHMENT\b/i,
  /\bOH\s*&\s*P\b/i,
  /\bOVERHEADS?\s+(&|AND)\s+PROFIT\b/i,
  /\bQUALITY\s+ASSURANCE\b/i,
  /\bWARRANTY\s+(PERIOD|ALLOWANCE)\b/i,
];

// Lump-sum document signals — few priced rows, scope-description heavy
const LUMP_SUM_SCOPE_PATTERNS: RegExp[] = [
  /\bLUMP\s+SUM\b/i,
  /\bSCOPE\s+OF\s+WORKS?\b/i,
  /\bINCLUSIONS?\b/i,
  /\bEXCLUSIONS?\b/i,
];

// Unnumbered table breakdown signals — columnar tables without leading row IDs
// e.g. Service | Size | FRR | Substrate | Qty | Rate | Total
const UNNUMBERED_TABLE_COL_RE = /\b(Service|FRR|Substrate|Fire\s+Rating|Wrap|Base\s+Rate|Insulation|Penetration|Joint|Gap)\b/gi;
const UNNUMBERED_TABLE_HEADER_RE = /\b(Service|FRR|Substrate)\b.*\b(Qty|Quantity|Rate|Total)\b/i;

// Priced row — a line that carries a dollar amount (used for counting)
const PRICED_ROW_RE = /\$[\d,]+\.\d{2}/gm;

function countNumberedRows(text: string): number {
  const matches = text.match(/^\s*\d{1,3}[\s\t]+\S/gm);
  return matches ? matches.length : 0;
}

function countPricedRows(text: string): number {
  const matches = text.match(PRICED_ROW_RE);
  return matches ? matches.length : 0;
}

function hasSummaryTotals(text: string): boolean {
  return SUMMARY_TOTAL_PATTERNS.some(re => re.test(text));
}

function hasOptionalScope(text: string): boolean {
  return OPTIONAL_SCOPE_PATTERNS.some(re => re.test(text));
}

function hasScheduleRows(text: string): boolean {
  return NUMBERED_ROW_RE.test(text) || SCHEDULE_BLOCK_RE.test(text);
}

function hasBlockRowIds(text: string): boolean {
  return BLOCK_ROW_ID_DENSE_RE.test(text) || (BLOCK_ROW_ID_RE.test(text) && SCHEDULE_BLOCK_RE.test(text));
}

function hasPrelimsSection(text: string): boolean {
  return PRELIMS_PATTERNS.some(re => re.test(text));
}

function hasUnnumberedTableRows(text: string): boolean {
  if (UNNUMBERED_TABLE_HEADER_RE.test(text)) return true;
  const colMatches = (text.match(UNNUMBERED_TABLE_COL_RE) ?? []).length;
  return colMatches >= 3;
}

function hasLumpSumScopeLanguage(text: string): boolean {
  return LUMP_SUM_SCOPE_PATTERNS.some(re => re.test(text));
}

function hasTableHeaders(text: string): boolean {
  const matches = (text.match(TABLE_HEADER_RE) ?? []).length;
  return matches >= 2;
}

function averageLineLength(text: string): number {
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  if (lines.length === 0) return 0;
  const total = lines.reduce((s, l) => s + l.length, 0);
  return total / lines.length;
}

function estimateTableConfidence(text: string): number {
  let score = 0;
  if (hasTableHeaders(text)) score += 0.3;
  if (NUMBERED_ROW_RE.test(text)) score += 0.3;
  if (/\$[\d,]+\.\d{2}/.test(text)) score += 0.2;
  if (/\b\d+(\.\d+)?\s+(ea|no|lm|m2|nr|each|item)\b/i.test(text)) score += 0.2;
  return Math.min(score, 1.0);
}

function estimateOcrQuality(text: string): 'good' | 'poor' | 'unknown' {
  if (!text || text.length < 50) return 'unknown';
  const brokenMatches = (text.match(BROKEN_LINE_RE) ?? []).length;
  const veryShortLines = (text.match(VERY_SHORT_LINE_RE) ?? []).length;
  const totalLines = text.split('\n').length;
  const brokenRatio = brokenMatches / Math.max(totalLines, 1);
  const shortRatio = veryShortLines / Math.max(totalLines, 1);
  if (brokenRatio > 0.05 || shortRatio > 0.3) return 'poor';
  return 'good';
}

// ---------------------------------------------------------------------------
// Commercial family mapping — structural signals only, no supplier names
// ---------------------------------------------------------------------------

export function mapToCommercialFamily(
  documentClass: DocumentClass,
  signals: ClassificationResult['signals'],
): CommercialFamily {
  if (documentClass === 'spreadsheet_boq') return 'spreadsheet_quote';
  if (documentClass === 'scanned_ocr_pdf') return 'scanned_ocr_quote';
  if (documentClass === 'mixed_unknown') return 'unknown_quote';

  // Itemized: many rows regardless of whether a summary page exists
  if (
    documentClass === 'multi_page_boq_summary_pdf' ||
    documentClass === 'schedule_only_pdf' ||
    (documentClass === 'summary_schedule_pdf' && signals.numberedRowCount > 10)
  ) {
    return 'itemized_quote';
  }

  // Hybrid: unnumbered table breakdown with summary totals (Pattern B)
  if (signals.hasUnnumberedTableRows && signals.hasSummaryTotals) {
    return 'hybrid_quote';
  }

  // Hybrid: has some rows AND either prelims or optional scope sections
  if (
    signals.hasPricedRowsAboveThreshold &&
    (signals.hasPrelimsSection || signals.hasOptionalScope)
  ) {
    return 'hybrid_quote';
  }

  // Lump sum: summary total exists, few priced rows, scope-description heavy
  if (
    signals.hasSummaryTotals &&
    !signals.hasPricedRowsAboveThreshold
  ) {
    return 'lump_sum_quote';
  }

  // Default: treat summary_schedule_pdf with borderline rows as hybrid
  if (documentClass === 'summary_schedule_pdf') {
    return signals.hasOptionalScope ? 'hybrid_quote' : 'itemized_quote';
  }

  // simple_line_items with prelims/optionals → hybrid
  if (documentClass === 'simple_line_items_pdf') {
    if (signals.hasPrelimsSection || signals.hasOptionalScope) return 'hybrid_quote';
    return 'lump_sum_quote';
  }

  return 'unknown_quote';
}

// ---------------------------------------------------------------------------
// Main classifier
// ---------------------------------------------------------------------------

export function classifyDocument(
  rawText: string,
  pages: PageData[],
  fileExtension?: string,
): ClassificationResult {
  const reasons: string[] = [];

  // Spreadsheet fast-path
  const isSpreadsheet = fileExtension === 'xlsx' || fileExtension === 'csv' || fileExtension === 'xls';
  if (isSpreadsheet) {
    return {
      documentClass: 'spreadsheet_boq',
      commercialFamily: 'spreadsheet_quote',
      confidence: 1.0,
      reasons: ['File extension indicates spreadsheet format'],
      signals: {
        hasSummaryTotals: false,
        hasScheduleRows: false,
        hasOptionalScope: false,
        hasBlockRowIds: false,
        hasPrelimsSection: false,
        hasPricedRowsAboveThreshold: false,
        hasUnnumberedTableRows: false,
        numberedRowCount: 0,
        pageCount: pages.length,
        avgLineLength: 0,
        tableConfidence: 1.0,
        isSpreadsheet: true,
        ocrQuality: 'good',
      },
    };
  }

  // Aggregate full text signals
  const fullText = rawText || pages.map(p => p.text).join('\n\n');

  const summaryTotalsDetected = hasSummaryTotals(fullText);
  const scheduleRowsDetected = hasScheduleRows(fullText);
  const optionalScopeDetected = hasOptionalScope(fullText);
  const blockRowIdsDetected = hasBlockRowIds(fullText);
  const prelimsSectionDetected = hasPrelimsSection(fullText);
  const unnumberedTableRowsDetected = hasUnnumberedTableRows(fullText);
  const numberedRowCount = countNumberedRows(fullText);
  const pricedRowCount = countPricedRows(fullText);
  const pricedRowsAboveThreshold = pricedRowCount > 5;
  const avgLine = averageLineLength(fullText);
  const tableConf = estimateTableConfidence(fullText);
  const ocrQuality = estimateOcrQuality(fullText);

  if (summaryTotalsDetected) reasons.push('Summary total labels detected');
  if (scheduleRowsDetected) reasons.push('Numbered schedule rows detected');
  if (optionalScopeDetected) reasons.push('Optional scope section detected');
  if (blockRowIdsDetected) reasons.push('Block-style row IDs detected (e.g. B30, B31)');
  if (prelimsSectionDetected) reasons.push('Prelims/allowances section detected');
  if (unnumberedTableRowsDetected) reasons.push('Unnumbered table breakdown columns detected (FRR/Service/Substrate)');
  if (numberedRowCount > 30) reasons.push(`High numbered row count (${numberedRowCount})`);
  if (ocrQuality === 'poor') reasons.push('Poor OCR quality detected');

  const signals: ClassificationResult['signals'] = {
    hasSummaryTotals: summaryTotalsDetected,
    hasScheduleRows: scheduleRowsDetected,
    hasOptionalScope: optionalScopeDetected,
    hasBlockRowIds: blockRowIdsDetected,
    hasPrelimsSection: prelimsSectionDetected,
    hasPricedRowsAboveThreshold: pricedRowsAboveThreshold,
    hasUnnumberedTableRows: unnumberedTableRowsDetected,
    numberedRowCount,
    pageCount: pages.length,
    avgLineLength: avgLine,
    tableConfidence: tableConf,
    isSpreadsheet,
    ocrQuality,
  };

  // --- Classification logic ---

  // Poor OCR → scanned_ocr_pdf regardless of other signals
  if (ocrQuality === 'poor' && tableConf < 0.3) {
    reasons.push('Low table confidence + poor OCR → scanned_ocr_pdf');
    return makeResult('scanned_ocr_pdf', 0.75, reasons, signals);
  }

  // Multi-page BOQ with Grand Total summary page — highest priority check.
  // Signals: Grand Total present + multi-page (>=3) + block-style row IDs OR
  // large numbered row count (>=20) with summary on a non-last page.
  if (
    summaryTotalsDetected &&
    pages.length >= 3 &&
    (blockRowIdsDetected || numberedRowCount >= 20)
  ) {
    reasons.push('Grand Total + multi-page + BOQ rows → multi_page_boq_summary_pdf');
    return makeResult('multi_page_boq_summary_pdf', 0.94, reasons, signals);
  }

  // Has authoritative summary totals AND schedule rows → summary_schedule_pdf
  if (summaryTotalsDetected && scheduleRowsDetected && numberedRowCount > 10) {
    reasons.push('Summary totals + schedule rows → summary_schedule_pdf');
    const confidence = numberedRowCount > 30 ? 0.92 : 0.80;
    return makeResult('summary_schedule_pdf', confidence, reasons, signals);
  }

  // Many numbered rows, no summary totals → schedule_only_pdf
  if (scheduleRowsDetected && numberedRowCount > 10 && !summaryTotalsDetected) {
    reasons.push('Schedule rows without summary totals → schedule_only_pdf');
    return makeResult('schedule_only_pdf', 0.80, reasons, signals);
  }

  // Summary totals + few rows → simple_line_items_pdf
  if (summaryTotalsDetected && numberedRowCount <= 10 && tableConf > 0.3) {
    reasons.push('Summary totals with few rows → simple_line_items_pdf');
    return makeResult('simple_line_items_pdf', 0.78, reasons, signals);
  }

  // Has table structure but no numbered rows → simple_line_items_pdf
  if (tableConf >= 0.5 && numberedRowCount <= 10) {
    reasons.push('Table structure detected without numbered rows → simple_line_items_pdf');
    return makeResult('simple_line_items_pdf', 0.65, reasons, signals);
  }

  // Cannot classify
  reasons.push('No confident classification signals found → mixed_unknown');
  return makeResult('mixed_unknown', 0.40, reasons, signals);
}

function makeResult(
  documentClass: DocumentClass,
  confidence: number,
  reasons: string[],
  signals: ClassificationResult['signals'],
): ClassificationResult {
  return { documentClass, commercialFamily: mapToCommercialFamily(documentClass, signals), confidence, reasons, signals };
}
