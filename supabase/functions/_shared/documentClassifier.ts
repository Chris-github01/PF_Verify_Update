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
  | 'summary_schedule_pdf'
  | 'schedule_only_pdf'
  | 'simple_line_items_pdf'
  | 'scanned_ocr_pdf'
  | 'spreadsheet_boq'
  | 'mixed_unknown';

export interface PageData {
  pageNum: number;
  text: string;
}

export interface ClassificationResult {
  documentClass: DocumentClass;
  confidence: number; // 0–1
  reasons: string[];
  signals: {
    hasSummaryTotals: boolean;
    hasScheduleRows: boolean;
    hasOptionalScope: boolean;
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

// Poor OCR signals
const BROKEN_LINE_RE = /[^\x20-\x7E\n\r\t]{3,}/;
const VERY_SHORT_LINE_RE = /^.{1,4}$/m;

function countNumberedRows(text: string): number {
  const matches = text.match(/^\s*\d{1,3}[\s\t]+\S/gm);
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
      confidence: 1.0,
      reasons: ['File extension indicates spreadsheet format'],
      signals: {
        hasSummaryTotals: false,
        hasScheduleRows: false,
        hasOptionalScope: false,
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
  const numberedRowCount = countNumberedRows(fullText);
  const avgLine = averageLineLength(fullText);
  const tableConf = estimateTableConfidence(fullText);
  const ocrQuality = estimateOcrQuality(fullText);

  if (summaryTotalsDetected) reasons.push('Summary total labels detected');
  if (scheduleRowsDetected) reasons.push('Numbered schedule rows detected');
  if (optionalScopeDetected) reasons.push('Optional scope section detected');
  if (numberedRowCount > 30) reasons.push(`High numbered row count (${numberedRowCount})`);
  if (ocrQuality === 'poor') reasons.push('Poor OCR quality detected');

  // --- Classification logic ---

  // Poor OCR → scanned_ocr_pdf regardless of other signals
  if (ocrQuality === 'poor' && tableConf < 0.3) {
    reasons.push('Low table confidence + poor OCR → scanned_ocr_pdf');
    return makeResult('scanned_ocr_pdf', 0.75, reasons, {
      hasSummaryTotals: summaryTotalsDetected,
      hasScheduleRows: scheduleRowsDetected,
      hasOptionalScope: optionalScopeDetected,
      numberedRowCount,
      pageCount: pages.length,
      avgLineLength: avgLine,
      tableConfidence: tableConf,
      isSpreadsheet,
      ocrQuality,
    });
  }

  // Has authoritative summary totals AND schedule rows → summary_schedule_pdf
  if (summaryTotalsDetected && scheduleRowsDetected && numberedRowCount > 10) {
    reasons.push('Summary totals + schedule rows → summary_schedule_pdf');
    const confidence = summaryTotalsDetected && numberedRowCount > 30 ? 0.92 : 0.80;
    return makeResult('summary_schedule_pdf', confidence, reasons, {
      hasSummaryTotals: summaryTotalsDetected,
      hasScheduleRows: scheduleRowsDetected,
      hasOptionalScope: optionalScopeDetected,
      numberedRowCount,
      pageCount: pages.length,
      avgLineLength: avgLine,
      tableConfidence: tableConf,
      isSpreadsheet,
      ocrQuality,
    });
  }

  // Many numbered rows, no summary totals → schedule_only_pdf
  if (scheduleRowsDetected && numberedRowCount > 10 && !summaryTotalsDetected) {
    reasons.push('Schedule rows without summary totals → schedule_only_pdf');
    return makeResult('schedule_only_pdf', 0.80, reasons, {
      hasSummaryTotals: false,
      hasScheduleRows: true,
      hasOptionalScope: optionalScopeDetected,
      numberedRowCount,
      pageCount: pages.length,
      avgLineLength: avgLine,
      tableConfidence: tableConf,
      isSpreadsheet,
      ocrQuality,
    });
  }

  // Summary totals + few rows → simple_line_items_pdf
  if (summaryTotalsDetected && numberedRowCount <= 10 && tableConf > 0.3) {
    reasons.push('Summary totals with few rows → simple_line_items_pdf');
    return makeResult('simple_line_items_pdf', 0.78, reasons, {
      hasSummaryTotals: true,
      hasScheduleRows: false,
      hasOptionalScope: optionalScopeDetected,
      numberedRowCount,
      pageCount: pages.length,
      avgLineLength: avgLine,
      tableConfidence: tableConf,
      isSpreadsheet,
      ocrQuality,
    });
  }

  // Has table structure but no numbered rows → simple_line_items_pdf
  if (tableConf >= 0.5 && numberedRowCount <= 10) {
    reasons.push('Table structure detected without numbered rows → simple_line_items_pdf');
    return makeResult('simple_line_items_pdf', 0.65, reasons, {
      hasSummaryTotals: summaryTotalsDetected,
      hasScheduleRows: false,
      hasOptionalScope: optionalScopeDetected,
      numberedRowCount,
      pageCount: pages.length,
      avgLineLength: avgLine,
      tableConfidence: tableConf,
      isSpreadsheet,
      ocrQuality,
    });
  }

  // Cannot classify
  reasons.push('No confident classification signals found → mixed_unknown');
  return makeResult('mixed_unknown', 0.40, reasons, {
    hasSummaryTotals: summaryTotalsDetected,
    hasScheduleRows: scheduleRowsDetected,
    hasOptionalScope: optionalScopeDetected,
    numberedRowCount,
    pageCount: pages.length,
    avgLineLength: avgLine,
    tableConfidence: tableConf,
    isSpreadsheet,
    ocrQuality,
  });
}

function makeResult(
  documentClass: DocumentClass,
  confidence: number,
  reasons: string[],
  signals: ClassificationResult['signals'],
): ClassificationResult {
  return { documentClass, confidence, reasons, signals };
}
