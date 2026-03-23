import ExcelJS from 'exceljs';
import { supabase } from '../supabase';
import {
  classifyParsedQuoteRows,
  type ParsedQuoteRow,
  type MissingExtractedLine,
  type EnrichedQuoteRow,
  type ClassificationSummary,
} from '../classification/classifyParsedQuoteRows';
import type { ClassificationOptions } from '../classification/classificationRules';

const COLORS = {
  headerBg: 'FF0F2942',
  headerFg: 'FFFFFFFF',
  subHeaderBg: 'FFE0EAF4',
  subHeaderFg: 'FF0F2942',
  mainScope: 'FFD1FAE5',
  mainScopeBorder: 'FF059669',
  mainScopeText: 'FF065F46',
  summaryOnly: 'FFFEE2E2',
  summaryOnlyBorder: 'FFDC2626',
  summaryOnlyText: 'FF991B1B',
  optionalScope: 'FFFEF3C7',
  optionalScopeBorder: 'FFD97706',
  optionalScopeText: 'FF92400E',
  reviewRequired: 'FFF1F5F9',
  reviewRequiredBorder: 'FF94A3B8',
  reviewRequiredText: 'FF475569',
  missingLine: 'FFEFF6FF',
  missingLineBorder: 'FF3B82F6',
  missingLineText: 'FF1D4ED8',
  reconstructed: 'FFD1FAE5',
  reconstructedBorder: 'FF059669',
  reconstructedText: 'FF065F46',
  varianceGood: 'FFD1FAE5',
  varianceBad: 'FFFEF9C3',
  rowEven: 'FFF8FAFC',
  rowOdd: 'FFFFFFFF',
  border: 'FFE2E8F0',
};

function styledCell(
  cell: ExcelJS.Cell,
  opts: {
    value?: ExcelJS.CellValue;
    bg?: string;
    fg?: string;
    bold?: boolean;
    size?: number;
    align?: ExcelJS.Alignment['horizontal'];
    border?: string;
    numFmt?: string;
    italic?: boolean;
    wrapText?: boolean;
  }
) {
  if (opts.value !== undefined) cell.value = opts.value;
  cell.font = {
    name: 'Calibri',
    size: opts.size ?? 10,
    bold: opts.bold ?? false,
    italic: opts.italic ?? false,
    color: { argb: opts.fg ?? 'FF1E293B' },
  };
  cell.alignment = {
    horizontal: opts.align ?? 'left',
    vertical: 'middle',
    wrapText: opts.wrapText ?? false,
  };
  if (opts.bg) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.bg } };
  }
  if (opts.numFmt) cell.numFmt = opts.numFmt;
  const b = opts.border ?? COLORS.border;
  cell.border = {
    top: { style: 'thin', color: { argb: b } },
    bottom: { style: 'thin', color: { argb: b } },
    left: { style: 'thin', color: { argb: b } },
    right: { style: 'thin', color: { argb: b } },
  };
}

function fmt(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function addSummarySheet(
  workbook: ExcelJS.Workbook,
  summary: ClassificationSummary,
  supplierName: string,
  projectName: string,
  missingLines: MissingExtractedLine[]
) {
  const ws = workbook.addWorksheet('Classification Summary');
  ws.columns = [
    { key: 'label', width: 36 },
    { key: 'value', width: 20 },
    { key: 'rows', width: 14 },
    { key: 'note', width: 50 },
  ];

  ws.mergeCells('A1:D1');
  styledCell(ws.getCell('A1'), {
    value: 'SAFE CLASSIFICATION AUDIT — TOTALS RECONSTRUCTION',
    bg: COLORS.headerBg, fg: COLORS.headerFg, bold: true, size: 14, align: 'center',
  });
  ws.getRow(1).height = 30;

  ws.mergeCells('A2:D2');
  styledCell(ws.getCell('A2'), {
    value: `Project: ${projectName}   |   Supplier: ${supplierName}   |   Generated: ${new Date().toLocaleDateString('en-NZ', { year: 'numeric', month: 'long', day: 'numeric' })}`,
    bg: COLORS.subHeaderBg, fg: COLORS.subHeaderFg, size: 10, italic: true, align: 'center',
  });
  ws.getRow(2).height = 20;

  const blank = ws.addRow([]);
  blank.height = 6;

  const hRow = ws.getRow(4);
  ['Category', 'Amount', 'Row Count', 'Notes'].forEach((h, i) => {
    styledCell(hRow.getCell(i + 1), {
      value: h, bg: COLORS.subHeaderBg, fg: COLORS.subHeaderFg, bold: true, size: 10,
    });
  });
  hRow.height = 22;

  const rows: Array<{
    label: string;
    value: number | null;
    count: number | string;
    note: string;
    bg: string;
    fg: string;
    border: string;
    bold?: boolean;
  }> = [
    {
      label: 'Parsed Total — All Rows',
      value: summary.parsed_total_all_rows,
      count: summary.counts.main_scope + summary.counts.summary_only + summary.counts.optional_scope + summary.counts.review_required,
      note: 'Raw sum of all extracted quote_items before classification',
      bg: COLORS.rowEven, fg: 'FF1E293B', border: COLORS.border,
    },
    {
      label: 'Main Scope',
      value: summary.main_scope_total,
      count: summary.counts.main_scope,
      note: 'Items with FRR + substrate + measurable element + pricing — counts toward safe total',
      bg: COLORS.mainScope, fg: COLORS.mainScopeText, border: COLORS.mainScopeBorder,
    },
    {
      label: 'Excluded — Summary Only',
      value: summary.summary_only_total,
      count: summary.counts.summary_only,
      note: 'Matched known summary phrases — double-counts document sections, excluded from safe total',
      bg: COLORS.summaryOnly, fg: COLORS.summaryOnlyText, border: COLORS.summaryOnlyBorder,
    },
    {
      label: 'Excluded — Optional Scope',
      value: summary.optional_scope_total,
      count: summary.counts.optional_scope,
      note: 'Matched optional item families (door seals, flush box pads, etc.) — excluded from safe total',
      bg: COLORS.optionalScope, fg: COLORS.optionalScopeText, border: COLORS.optionalScopeBorder,
    },
    {
      label: 'Review Required (not counted)',
      value: summary.review_required_total,
      count: summary.counts.review_required,
      note: 'Insufficient signals to auto-classify — not included in safe total',
      bg: COLORS.reviewRequired, fg: COLORS.reviewRequiredText, border: COLORS.reviewRequiredBorder,
    },
    {
      label: 'Missing Extracted Lines (audit only)',
      value: summary.missing_extracted_total,
      count: summary.counts.missing_extracted_line,
      note: 'Known chunk-boundary splits — NOT in DB, audit-only addback',
      bg: COLORS.missingLine, fg: COLORS.missingLineText, border: COLORS.missingLineBorder,
    },
    {
      label: 'Reconstructed Safe Total',
      value: summary.reconstructed_total,
      count: '—',
      note: 'Main Scope + Missing Extracted Lines',
      bg: COLORS.reconstructed, fg: COLORS.reconstructedText, border: COLORS.reconstructedBorder,
      bold: true,
    },
    {
      label: 'Document PDF Grand Total',
      value: summary.document_total,
      count: '—',
      note: 'Manually supplied document total for cross-check',
      bg: COLORS.rowOdd, fg: 'FF1E293B', border: COLORS.border,
    },
    {
      label: 'Variance (Reconstructed vs Document)',
      value: summary.variance_to_document_total,
      count: '—',
      note: summary.variance_to_document_total != null && Math.abs(summary.variance_to_document_total) <= 1
        ? 'Reconstruction matches document total — high confidence'
        : 'Non-zero variance — review missing lines or unclassified items',
      bg: summary.variance_to_document_total != null && Math.abs(summary.variance_to_document_total) <= 1
        ? COLORS.varianceGood : COLORS.varianceBad,
      fg: 'FF1E293B', border: COLORS.border,
      bold: true,
    },
  ];

  let rowNum = 5;
  for (const r of rows) {
    const wsRow = ws.getRow(rowNum);
    styledCell(wsRow.getCell(1), { value: r.label, bg: r.bg, fg: r.fg, border: r.border, bold: r.bold });
    styledCell(wsRow.getCell(2), {
      value: r.value != null ? r.value : '—',
      bg: r.bg, fg: r.fg, border: r.border, bold: r.bold,
      align: 'right',
      numFmt: r.value != null ? '$#,##0.00' : undefined,
    });
    styledCell(wsRow.getCell(3), { value: r.count, bg: r.bg, fg: r.fg, border: r.border, align: 'center' });
    styledCell(wsRow.getCell(4), { value: r.note, bg: r.bg, fg: r.fg, border: r.border, italic: true });
    wsRow.height = 20;
    rowNum++;
  }

  if (missingLines.length > 0) {
    rowNum += 1;
    ws.mergeCells(`A${rowNum}:D${rowNum}`);
    styledCell(ws.getCell(`A${rowNum}`), {
      value: 'MISSING EXTRACTED LINES — AUDIT ONLY (never inserted into database)',
      bg: COLORS.missingLine, fg: COLORS.missingLineText, bold: true, size: 10,
    });
    ws.getRow(rowNum).height = 20;
    rowNum++;

    const mlHRow = ws.getRow(rowNum);
    ['Description', 'Expected Total', 'Confidence', 'Reason'].forEach((h, i) => {
      styledCell(mlHRow.getCell(i + 1), {
        value: h, bg: COLORS.subHeaderBg, fg: COLORS.subHeaderFg, bold: true, size: 10,
      });
    });
    mlHRow.height = 20;
    rowNum++;

    for (const ml of missingLines) {
      const mlRow = ws.getRow(rowNum);
      styledCell(mlRow.getCell(1), { value: ml.description, bg: COLORS.missingLine, fg: COLORS.missingLineText, border: COLORS.missingLineBorder, wrapText: true });
      styledCell(mlRow.getCell(2), { value: ml.expected_total, bg: COLORS.missingLine, fg: COLORS.missingLineText, border: COLORS.missingLineBorder, align: 'right', numFmt: '$#,##0.00' });
      styledCell(mlRow.getCell(3), { value: ml.confidence, bg: COLORS.missingLine, fg: COLORS.missingLineText, border: COLORS.missingLineBorder, align: 'center' });
      styledCell(mlRow.getCell(4), { value: ml.reason, bg: COLORS.missingLine, fg: COLORS.missingLineText, border: COLORS.missingLineBorder, italic: true });
      mlRow.height = 36;
      rowNum++;
    }
  }

  rowNum += 1;
  ws.mergeCells(`A${rowNum}:D${rowNum}`);
  styledCell(ws.getCell(`A${rowNum}`), {
    value: 'Classification Audit is a read-only overlay. No rows were modified, hidden, or inserted into the database. Generated by VerifyTrade.',
    bg: 'FFF8FAFC', fg: 'FF94A3B8', italic: true, size: 9,
  });
}

function addDetailSheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  rows: EnrichedQuoteRow[],
  headerColor: { bg: string; fg: string; border: string },
  tagLabel: string
) {
  if (rows.length === 0) return;

  const ws = workbook.addWorksheet(sheetName);
  ws.columns = [
    { key: 'description', width: 52 },
    { key: 'qty', width: 10 },
    { key: 'unit', width: 10 },
    { key: 'rate', width: 14 },
    { key: 'total', width: 16 },
    { key: 'confidence', width: 12 },
    { key: 'rule', width: 22 },
    { key: 'reason', width: 50 },
  ];

  ws.mergeCells('A1:H1');
  styledCell(ws.getCell('A1'), {
    value: `${tagLabel.toUpperCase()} — ${rows.length} items`,
    bg: headerColor.bg, fg: headerColor.fg, bold: true, size: 12, align: 'center',
  });
  ws.getRow(1).height = 28;

  const hRow = ws.getRow(2);
  ['Description', 'Qty', 'Unit', 'Rate', 'Total', 'Confidence', 'Rule Applied', 'Classification Reason'].forEach((h, i) => {
    styledCell(hRow.getCell(i + 1), {
      value: h, bg: headerColor.bg, fg: headerColor.fg, bold: true, size: 10,
    });
  });
  hRow.height = 22;

  let rowNum = 3;
  for (const r of rows) {
    const wsRow = ws.getRow(rowNum);
    const isEven = (rowNum % 2) === 0;
    const bg = isEven ? COLORS.rowEven : COLORS.rowOdd;

    styledCell(wsRow.getCell(1), { value: r.description || '—', bg, wrapText: true });
    styledCell(wsRow.getCell(2), { value: r.quantity ?? '—', bg, align: 'right' });
    styledCell(wsRow.getCell(3), { value: r.unit || '—', bg });
    styledCell(wsRow.getCell(4), {
      value: r.unit_price != null ? r.unit_price : '—',
      bg, align: 'right',
      numFmt: r.unit_price != null ? '$#,##0.00' : undefined,
    });
    styledCell(wsRow.getCell(5), {
      value: r.total_price != null ? r.total_price : '—',
      bg, align: 'right', bold: true,
      numFmt: r.total_price != null ? '$#,##0.00' : undefined,
    });
    styledCell(wsRow.getCell(6), { value: r.safe_classification_confidence, bg, align: 'center' });
    styledCell(wsRow.getCell(7), { value: r.safe_rule_applied || '—', bg });
    styledCell(wsRow.getCell(8), { value: r.safe_classification_reason, bg, italic: true });

    wsRow.height = (r.description || '').length > 80 ? 40 : 22;
    rowNum++;
  }

  const groupTotal = rows.reduce((s, r) => s + Number(r.total_price ?? 0), 0);
  const footRow = ws.getRow(rowNum);
  styledCell(footRow.getCell(1), {
    value: `${tagLabel} Subtotal`,
    bg: headerColor.bg, fg: headerColor.fg, bold: true,
  });
  styledCell(footRow.getCell(5), {
    value: groupTotal,
    bg: headerColor.bg, fg: headerColor.fg, bold: true,
    align: 'right', numFmt: '$#,##0.00',
  });
  [2, 3, 4, 6, 7, 8].forEach(i => {
    styledCell(footRow.getCell(i), { bg: headerColor.bg });
  });
  footRow.height = 22;

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: 8 } };
}

export interface SafeClassificationExportOptions {
  projectId: string;
  projectName: string;
  quoteId: string;
  supplierName: string;
  documentTotal?: number | null;
  knownMissingLines?: MissingExtractedLine[];
  classificationOptions?: ClassificationOptions;
}

export async function exportSafeClassificationAudit(
  opts: SafeClassificationExportOptions
): Promise<void> {
  const {
    projectId: _projectId,
    projectName,
    quoteId,
    supplierName,
    documentTotal = null,
    knownMissingLines = [],
    classificationOptions = {},
  } = opts;

  const { data, error } = await supabase
    .from('quote_items')
    .select('*')
    .eq('quote_id', quoteId)
    .order('id', { ascending: true });

  if (error) throw error;

  const rows: ParsedQuoteRow[] = (data || []).map(item => ({
    id: item.id,
    quote_id: item.quote_id,
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    unit_price: item.unit_price,
    total_price: item.total_price,
    section: item.section,
    service: item.service,
    scope_category: item.scope_category,
    frr: item.frr,
    source: item.source,
  }));

  const result = classifyParsedQuoteRows(rows, classificationOptions, knownMissingLines, documentTotal);
  const { enrichedRows, missingLines, summary } = result;

  const mainScopeRows = enrichedRows.filter(r => r.safe_classification_tag === 'main_scope');
  const summaryOnlyRows = enrichedRows.filter(r => r.safe_classification_tag === 'summary_only');
  const optionalScopeRows = enrichedRows.filter(r => r.safe_classification_tag === 'optional_scope');
  const reviewRequiredRows = enrichedRows.filter(r => r.safe_classification_tag === 'review_required');

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'VerifyTrade';
  workbook.created = new Date();

  addSummarySheet(workbook, summary, supplierName, projectName, missingLines);

  addDetailSheet(
    workbook,
    'Main Scope',
    mainScopeRows,
    { bg: COLORS.mainScope, fg: COLORS.mainScopeText, border: COLORS.mainScopeBorder },
    'Main Scope'
  );

  addDetailSheet(
    workbook,
    'Summary Only (Excluded)',
    summaryOnlyRows,
    { bg: COLORS.summaryOnly, fg: COLORS.summaryOnlyText, border: COLORS.summaryOnlyBorder },
    'Summary Only'
  );

  addDetailSheet(
    workbook,
    'Optional Scope (Excluded)',
    optionalScopeRows,
    { bg: COLORS.optionalScope, fg: COLORS.optionalScopeText, border: COLORS.optionalScopeBorder },
    'Optional Scope'
  );

  addDetailSheet(
    workbook,
    'Review Required',
    reviewRequiredRows,
    { bg: COLORS.reviewRequired, fg: COLORS.reviewRequiredText, border: COLORS.reviewRequiredBorder },
    'Review Required'
  );

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const ts = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '_');
  link.download = `${safe(projectName)}_${safe(supplierName)}_Safe_Classification_Audit_${ts}.xlsx`;
  link.click();
  window.URL.revokeObjectURL(url);
}
