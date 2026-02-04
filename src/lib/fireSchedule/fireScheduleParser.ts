/**
 * Main Fire Schedule Parser
 * Orchestrates detection, extraction, and normalization
 */

import * as pdfjs from 'pdfjs-dist';
import { detectSchedulePages, groupScheduleSections, type SchedulePageInfo } from './scheduleDetector';
import { extractTableFromItems, normalizeHeaders, type ExtractedTable, type TextItem } from './tableExtractor';

// Configure PDF.js worker
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
}

export interface ScheduleRow {
  solution_id: string | null;
  system_classification: string | null;
  substrate: string | null;
  orientation: string | null;
  frr_rating: string | null;
  service_type: string | null;
  service_size_text: string | null;
  service_size_min_mm: number | null;
  service_size_max_mm: number | null;
  insulation_type: string | null;
  insulation_thickness_mm: number | null;
  test_reference: string | null;
  fire_stop_products: string | null;
  substrate_requirements: string | null;
  build_up: string | null;
  notes: string | null;
  raw_text: string;
  parse_confidence: number;
  page_number: number;
  row_index: number;
}

export interface ParseResult {
  success: boolean;
  rows: ScheduleRow[];
  metadata: {
    total_rows: number;
    average_confidence: number;
    low_confidence_count: number;
    parsing_notes: string[];
  };
  debug: {
    schedule_pages: number[];
    method_used: string;
    errors?: string[];
  };
  error?: string;
}

/**
 * Extract text with coordinates from a single PDF page
 */
async function extractPageTextItems(page: any): Promise<TextItem[]> {
  const textContent = await page.getTextContent();
  const items: TextItem[] = [];

  for (const item of textContent.items) {
    if ('str' in item && item.str.trim()) {
      items.push({
        text: item.str,
        x: item.transform[4],
        y: item.transform[5],
        width: item.width || 0,
        height: item.height || 0
      });
    }
  }

  return items;
}

/**
 * Extract plain text from a page for detection
 */
async function extractPageText(page: any): Promise<string> {
  const textContent = await page.getTextContent();
  const strings = textContent.items.map((item: any) => item.str || '');
  return strings.join(' ');
}

/**
 * Parse size range from text (e.g., "15-150mm" -> [15, 150])
 */
function parseSizeRange(sizeText: string): [number | null, number | null] {
  if (!sizeText) return [null, null];

  // Match patterns like "15-150mm", "Ø110", "Up to 100mm", "600mm wide"
  const rangeMatch = sizeText.match(/(\d+)\s*-\s*(\d+)/);
  if (rangeMatch) {
    return [parseInt(rangeMatch[1]), parseInt(rangeMatch[2])];
  }

  const singleMatch = sizeText.match(/(\d+)/);
  if (singleMatch) {
    const value = parseInt(singleMatch[1]);
    return [value, value];
  }

  return [null, null];
}

/**
 * Parse numeric value from text
 */
function parseNumber(text: string): number | null {
  if (!text) return null;
  const match = text.match(/(\d+\.?\d*)/);
  return match ? parseFloat(match[1]) : null;
}

/**
 * Extract PFP code from text
 */
function extractPFPCode(text: string): string | null {
  if (!text) return null;
  const match = text.match(/PFP\d+[A-Z]?/i);
  return match ? match[0].toUpperCase() : null;
}

/**
 * Convert extracted table row to ScheduleRow
 */
function rowToScheduleRow(
  rowData: string[],
  headers: string[],
  pageNumber: number,
  rowIndex: number
): ScheduleRow | null {
  const rowObj: any = {};

  // Map columns to row object
  for (let i = 0; i < headers.length; i++) {
    rowObj[headers[i]] = rowData[i] || '';
  }

  const rawText = rowData.join(' | ');

  // Extract size range
  const [sizeMin, sizeMax] = parseSizeRange(rowObj.size || rowObj.service_size_text || '');

  // Calculate confidence
  let confidence = 0.3;
  if (rowObj.fire_stop_reference || rowObj.test_reference) confidence += 0.2;
  if (rowObj.service_type) confidence += 0.2;
  if (rowObj.fire_stop_products) confidence += 0.2;
  if (rawText.length > 30) confidence += 0.1;

  // Skip rows with very low confidence
  if (confidence < 0.4) return null;

  return {
    solution_id: extractPFPCode(rowObj.fire_stop_reference || rowObj.test_reference || ''),
    system_classification: rowObj.substrate || rowObj.system_classification || null,
    substrate: rowObj.substrate || null,
    orientation: rowObj.orientation || null,
    frr_rating: rowObj.frr_rating || null,
    service_type: rowObj.service_type ?
      `${rowObj.service_type}${rowObj.material ? ' - ' + rowObj.material : ''}` : null,
    service_size_text: rowObj.size || rowObj.service_size_text || null,
    service_size_min_mm: sizeMin,
    service_size_max_mm: sizeMax,
    insulation_type: null,
    insulation_thickness_mm: parseNumber(rowObj.insulation || ''),
    test_reference: rowObj.fire_stop_reference || rowObj.test_reference || null,
    fire_stop_products: rowObj.fire_stop_products || null,
    substrate_requirements: rowObj.substrate_requirements || null,
    build_up: rowObj.build_up || null,
    notes: null,
    raw_text: rawText,
    parse_confidence: confidence,
    page_number: pageNumber,
    row_index: rowIndex
  };
}

/**
 * Main parse function
 */
export async function parseFireSchedule(pdfBytes: Uint8Array): Promise<ParseResult> {
  const notes: string[] = [];
  const errors: string[] = [];

  try {
    // Step 1: Load PDF
    notes.push('Loading PDF document...');
    const loadingTask = pdfjs.getDocument({ data: pdfBytes });
    const pdfDocument = await loadingTask.promise;
    const numPages = pdfDocument.numPages;
    notes.push(`PDF loaded: ${numPages} pages`);

    // Step 2: Extract text from all pages for detection
    notes.push('Extracting page text for schedule detection...');
    const pageTexts = [];
    for (let i = 1; i <= numPages; i++) {
      const page = await pdfDocument.getPage(i);
      const text = await extractPageText(page);
      pageTexts.push({ pageNumber: i, text });
    }

    // Step 3: Detect schedule pages
    notes.push('Detecting schedule pages...');
    const schedulePageInfo = detectSchedulePages(pageTexts);

    if (schedulePageInfo.length === 0) {
      return {
        success: false,
        rows: [],
        metadata: {
          total_rows: 0,
          average_confidence: 0,
          low_confidence_count: 0,
          parsing_notes: [...notes, 'No schedule pages detected']
        },
        debug: {
          schedule_pages: [],
          method_used: 'coordinate-clustering',
          errors: ['No pages matched schedule detection criteria']
        },
        error: 'No fire schedule pages found in PDF'
      };
    }

    const schedulePages = schedulePageInfo.map(info => info.pageNumber);
    notes.push(`Found ${schedulePages.length} schedule pages: ${schedulePages.join(', ')}`);

    // Step 4: Extract tables from schedule pages
    notes.push('Extracting tables from schedule pages...');
    const allRows: ScheduleRow[] = [];
    let totalConfidence = 0;

    for (const pageNum of schedulePages) {
      const page = await pdfDocument.getPage(pageNum);
      const textItems = await extractPageTextItems(page);

      notes.push(`Page ${pageNum}: Extracted ${textItems.length} text items`);

      // Extract table using coordinate clustering
      const table = extractTableFromItems(textItems);
      notes.push(`Page ${pageNum}: ${table.notes.join('; ')}`);

      if (table.rows.length === 0) {
        notes.push(`Page ${pageNum}: No table structure found`);
        continue;
      }

      // Normalize headers
      const normalizedHeaders = normalizeHeaders(table.headers);

      // Convert rows to ScheduleRow objects
      for (let i = 0; i < table.rows.length; i++) {
        const scheduleRow = rowToScheduleRow(table.rows[i], normalizedHeaders, pageNum, i);
        if (scheduleRow) {
          allRows.push(scheduleRow);
          totalConfidence += scheduleRow.parse_confidence;
        }
      }
    }

    const avgConfidence = allRows.length > 0 ? totalConfidence / allRows.length : 0;
    const lowConfidenceCount = allRows.filter(row => row.parse_confidence < 0.7).length;

    notes.push(`Extracted ${allRows.length} total rows`);
    notes.push(`Average confidence: ${(avgConfidence * 100).toFixed(1)}%`);

    return {
      success: allRows.length > 0,
      rows: allRows,
      metadata: {
        total_rows: allRows.length,
        average_confidence: avgConfidence,
        low_confidence_count: lowConfidenceCount,
        parsing_notes: notes
      },
      debug: {
        schedule_pages: schedulePages,
        method_used: 'coordinate-clustering',
        errors: errors.length > 0 ? errors : undefined
      }
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    errors.push(errorMessage);
    notes.push(`Error: ${errorMessage}`);

    return {
      success: false,
      rows: [],
      metadata: {
        total_rows: 0,
        average_confidence: 0,
        low_confidence_count: 0,
        parsing_notes: notes
      },
      debug: {
        schedule_pages: [],
        method_used: 'coordinate-clustering',
        errors
      },
      error: errorMessage
    };
  }
}
