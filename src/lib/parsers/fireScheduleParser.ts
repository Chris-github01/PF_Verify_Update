import type { FireEngineerScheduleRow } from '../../types/boq.types';

/**
 * Fire Engineer Schedule Parser
 *
 * Parses Passive Fire Schedule sections from fire engineer PDFs (Appendix A, etc.)
 * Extracts structured data with confidence scoring.
 */

export interface ScheduleSectionDetection {
  found: boolean;
  startPage: number | null;
  endPage: number | null;
  sectionTitle: string | null;
}

export interface ParsedScheduleRow extends Omit<FireEngineerScheduleRow, 'id' | 'schedule_id' | 'created_at' | 'updated_at'> {
  // Additional parsing metadata
  detectedColumns: string[];
  parsingWarnings: string[];
}

const SCHEDULE_SECTION_HEADERS = [
  /passive\s+fire\s+schedule/i,
  /appendix\s+a\s*[:-]?\s*passive\s+fire/i,
  /fire\s+stopping\s+schedule/i,
  /penetration\s+schedule/i,
  /pfp\s+schedule/i,
];

const COLUMN_PATTERNS = {
  solution_id: /(?:solution|ref|pfp)\s*(?:id|ref|no\.?)?/i,
  system_classification: /(?:system|classification|type)/i,
  substrate: /substrate|wall\s+type|construction/i,
  frr_rating: /frr|fire\s+rating|rating|resistance/i,
  service_type: /service|penetration\s+type|cable|pipe|duct/i,
  service_size: /size|diameter|dimension|opening/i,
  test_reference: /test|certification|warres|bre/i,
};

/**
 * Detect if PDF contains a passive fire schedule section
 */
export function detectScheduleSection(pdfText: string): ScheduleSectionDetection {
  const lines = pdfText.split('\n');
  let startPage: number | null = null;
  let sectionTitle: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    for (const headerPattern of SCHEDULE_SECTION_HEADERS) {
      if (headerPattern.test(line)) {
        startPage = estimatePageNumber(i, lines.length);
        sectionTitle = line;
        break;
      }
    }

    if (startPage !== null) break;
  }

  return {
    found: startPage !== null,
    startPage,
    endPage: startPage ? startPage + 10 : null, // Estimate 10 pages max
    sectionTitle,
  };
}

/**
 * Extract table rows from schedule section
 */
export function extractScheduleRows(
  pdfText: string,
  startPage: number,
  endPage: number
): ParsedScheduleRow[] {
  const lines = pdfText.split('\n');
  const rows: ParsedScheduleRow[] = [];
  let rowIndex = 0;

  // Simple table detection: look for rows with multiple fields separated by whitespace/tabs
  const tableStartPatterns = [
    /solution|ref|id/i,
    /system|classification/i,
  ];

  let inTable = false;
  let currentPage = startPage;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const estimatedPage = estimatePageNumber(i, lines.length);

    if (estimatedPage < startPage || estimatedPage > endPage) {
      continue;
    }

    // Detect table start
    if (!inTable) {
      for (const pattern of tableStartPatterns) {
        if (pattern.test(line)) {
          inTable = true;
          break;
        }
      }
      continue;
    }

    // Skip empty lines
    if (!line) continue;

    // Skip header rows
    if (isHeaderRow(line)) continue;

    // Parse row
    const parsedRow = parseScheduleRow(line, rowIndex, estimatedPage);
    if (parsedRow) {
      rows.push(parsedRow);
      rowIndex++;
    }
  }

  return rows;
}

/**
 * Parse individual schedule row
 */
function parseScheduleRow(
  rawText: string,
  rowIndex: number,
  pageNumber: number
): ParsedScheduleRow | null {
  // Split by multiple spaces, tabs, or pipe characters
  const fields = rawText.split(/\s{2,}|\t+|\|/).map(f => f.trim()).filter(Boolean);

  if (fields.length < 3) {
    // Not enough fields to be a valid row
    return null;
  }

  const detectedColumns: string[] = [];
  const parsingWarnings: string[] = [];

  // Attempt to identify columns based on content patterns
  let solution_id: string | null = null;
  let system_classification: string | null = null;
  let substrate: string | null = null;
  let frr_rating: string | null = null;
  let service_type: string | null = null;
  let service_size_text: string | null = null;
  let service_size_min_mm: number | null = null;
  let service_size_max_mm: number | null = null;
  let insulation_type: string | null = null;
  let insulation_thickness_mm: number | null = null;
  let test_reference: string | null = null;
  let notes: string | null = null;

  // Pattern matching for each field
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];

    // Solution ID: typically first column, alphanumeric with possible dashes
    if (i === 0 && /^[A-Z0-9-]+$/i.test(field)) {
      solution_id = field;
      detectedColumns.push('solution_id');
      continue;
    }

    // FRR Rating: contains numbers followed by "mins" or formats like "-/120/120"
    if (/\d+\s*mins?|[-/]\d+[-/]\d+/i.test(field)) {
      frr_rating = field;
      detectedColumns.push('frr_rating');
      continue;
    }

    // Service Size: contains Ø symbol, dimensions like "100x200", or ranges like "0-50mm"
    if (/ø\d+|^\d+x\d+|\d+-\d+\s*mm/i.test(field)) {
      service_size_text = field;
      const sizeResult = parseServiceSize(field);
      service_size_min_mm = sizeResult.min;
      service_size_max_mm = sizeResult.max;
      detectedColumns.push('service_size');
      continue;
    }

    // Substrate: common materials
    if (/concrete|plasterboard|masonry|brick|block|timber|steel/i.test(field)) {
      substrate = field;
      detectedColumns.push('substrate');
      continue;
    }

    // Service Type: electrical, plumbing, etc.
    if (/electrical|cable|plumbing|pipe|hvac|duct|mechanical/i.test(field)) {
      service_type = field;
      detectedColumns.push('service_type');
      continue;
    }

    // Test Reference: WARRES, BRE, etc.
    if (/warres|bre|fire\s*test|cert/i.test(field)) {
      test_reference = field;
      detectedColumns.push('test_reference');
      continue;
    }

    // System Classification: if longer descriptive text
    if (field.length > 10 && !system_classification) {
      system_classification = field;
      detectedColumns.push('system_classification');
      continue;
    }
  }

  // Calculate parse confidence
  const expectedColumns = 6; // Minimum expected columns
  const foundColumns = detectedColumns.length;
  const baseConfidence = Math.min(foundColumns / expectedColumns, 1.0);

  // Adjust confidence based on critical fields
  let confidence = baseConfidence;
  if (!solution_id) confidence *= 0.7;
  if (!frr_rating) confidence *= 0.8;
  if (!service_size_text) confidence *= 0.8;
  if (!system_classification && !substrate) confidence *= 0.9;

  // Add warnings for missing critical fields
  if (!solution_id) parsingWarnings.push('Missing solution ID');
  if (!frr_rating) parsingWarnings.push('Missing FRR rating');
  if (!service_size_text) parsingWarnings.push('Missing service size');

  return {
    page_number: pageNumber,
    row_index: rowIndex,
    solution_id,
    system_classification,
    substrate,
    orientation: null, // May need additional parsing
    frr_rating,
    service_type,
    service_size_text,
    service_size_min_mm,
    service_size_max_mm,
    insulation_type,
    insulation_thickness_mm,
    test_reference,
    notes,
    raw_text: rawText,
    parse_confidence: confidence,
    detectedColumns,
    parsingWarnings,
  };
}

/**
 * Parse service size text into numeric min/max values
 */
function parseServiceSize(sizeText: string): { min: number | null; max: number | null } {
  // Remove Ø symbol
  let text = sizeText.replace(/ø/gi, '');

  // Range pattern: "0-50mm" or "50-100"
  const rangeMatch = text.match(/(\d+)\s*-\s*(\d+)/);
  if (rangeMatch) {
    return {
      min: parseFloat(rangeMatch[1]),
      max: parseFloat(rangeMatch[2]),
    };
  }

  // Dimensions pattern: "100x200" or "750x200"
  const dimensionMatch = text.match(/(\d+)\s*x\s*(\d+)/i);
  if (dimensionMatch) {
    const dim1 = parseFloat(dimensionMatch[1]);
    const dim2 = parseFloat(dimensionMatch[2]);
    return {
      min: Math.min(dim1, dim2),
      max: Math.max(dim1, dim2),
    };
  }

  // Single number: "110" or "110mm"
  const singleMatch = text.match(/(\d+(?:\.\d+)?)/);
  if (singleMatch) {
    const value = parseFloat(singleMatch[1]);
    return {
      min: value,
      max: value,
    };
  }

  return { min: null, max: null };
}

/**
 * Determine if line is a table header
 */
function isHeaderRow(line: string): boolean {
  const lowerLine = line.toLowerCase();
  const headerKeywords = ['solution', 'ref', 'system', 'classification', 'substrate', 'rating', 'size', 'service'];
  let keywordCount = 0;

  for (const keyword of headerKeywords) {
    if (lowerLine.includes(keyword)) keywordCount++;
  }

  return keywordCount >= 3;
}

/**
 * Estimate page number from line index
 */
function estimatePageNumber(lineIndex: number, totalLines: number): number {
  const linesPerPage = 50; // Rough estimate
  return Math.floor(lineIndex / linesPerPage) + 1;
}

/**
 * Validate parsed rows and provide summary statistics
 */
export function validateScheduleRows(rows: ParsedScheduleRow[]): {
  totalRows: number;
  averageConfidence: number;
  lowConfidenceCount: number;
  missingCriticalFields: {
    solution_id: number;
    frr_rating: number;
    service_size: number;
  };
} {
  const totalRows = rows.length;
  const averageConfidence = rows.reduce((sum, r) => sum + r.parse_confidence, 0) / totalRows;
  const lowConfidenceCount = rows.filter(r => r.parse_confidence < 0.7).length;

  const missingCriticalFields = {
    solution_id: rows.filter(r => !r.solution_id).length,
    frr_rating: rows.filter(r => !r.frr_rating).length,
    service_size: rows.filter(r => !r.service_size_text).length,
  };

  return {
    totalRows,
    averageConfidence,
    lowConfidenceCount,
    missingCriticalFields,
  };
}
