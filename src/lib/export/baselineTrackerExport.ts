import ExcelJS from 'exceljs';
import type {
  BTProject,
  BTBaselineHeader,
  BTBaselineLineItem,
  BTClaimPeriod,
  BTClaimLineItem,
  BTVariation,
} from '../../types/baselineTracker.types';

const BRAND_BLUE = 'FF1E40AF';
const HEADER_BG = 'FF1E293B';
const SECTION_A = 'FFD1E7FF';
const SECTION_B = 'FFD1FAE5';
const SECTION_C = 'FFFEF3C7';
const SECTION_D = 'FFFED7AA';
const SECTION_E = 'FFFECACA';

function applyHeaderStyle(cell: ExcelJS.Cell, bgColor: string = HEADER_BG) {
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  cell.border = {
    top: { style: 'thin', color: { argb: 'FF374151' } },
    bottom: { style: 'thin', color: { argb: 'FF374151' } },
    left: { style: 'thin', color: { argb: 'FF374151' } },
    right: { style: 'thin', color: { argb: 'FF374151' } },
  };
}

function applyDataRowStyle(row: ExcelJS.Row, isEven: boolean) {
  const bg = isEven ? 'FFF8FAFC' : 'FFFFFFFF';
  for (let c = 1; c <= 30; c++) {
    const cell = row.getCell(c);
    if (!cell.fill || (cell.fill as any).fgColor?.argb === undefined) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
    }
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
    };
    cell.font = { size: 9 };
  }
}

function addTitleBlock(ws: ExcelJS.Worksheet, title: string, subtitle: string, colCount: number) {
  const colLetter = String.fromCharCode(64 + colCount);
  ws.mergeCells(`A1:${colLetter}1`);
  const t = ws.getCell('A1');
  t.value = title;
  t.font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_BLUE } };
  t.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 32;

  ws.mergeCells(`A2:${colLetter}2`);
  const s = ws.getCell('A2');
  s.value = subtitle;
  s.font = { size: 10, color: { argb: 'FF475569' } };
  s.alignment = { horizontal: 'center' };
  ws.getRow(2).height = 22;

  ws.addRow([]);
}

function formatCurrency(ws: ExcelJS.Worksheet, cell: ExcelJS.Cell, value: number) {
  cell.value = value;
  cell.numFmt = '"$"#,##0.00';
}

function formatPercent(cell: ExcelJS.Cell, value: number) {
  cell.value = value / 100;
  cell.numFmt = '0.00%';
}

// ============================================================
// BASELINE SNAPSHOT EXPORT
// ============================================================
export async function exportBaselineSnapshot(
  project: BTProject,
  header: BTBaselineHeader,
  lineItems: BTBaselineLineItem[],
  variations: BTVariation[]
): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'VerifyTrade Baseline Tracker';
  wb.created = new Date();

  // --- Tab 1: Project Summary ---
  const wsSummary = wb.addWorksheet('Project Summary');
  wsSummary.columns = [{ width: 30 }, { width: 40 }];
  addTitleBlock(wsSummary, 'BASELINE TRACKER — PROJECT SUMMARY', `${project.project_name} | Ref: ${project.contract_reference || 'N/A'}`, 2);

  const summaryData = [
    ['Project Name', project.project_name],
    ['Project Code', project.project_code || ''],
    ['Client', project.client_name || ''],
    ['Main Contractor', project.main_contractor_name || ''],
    ['Site Address', project.site_address || ''],
    ['Contract Reference', project.contract_reference || ''],
    ['Baseline Reference', header.baseline_reference || ''],
    ['Baseline Version', header.baseline_version],
    ['Baseline Status', header.baseline_status.toUpperCase()],
    ['Contract Value (excl. GST)', header.contract_value_excl_gst],
    ['Contract Value (incl. GST)', header.contract_value_incl_gst],
    ['Retention %', header.retention_percent],
    ['Payment Terms', `${header.payment_terms_days} days`],
    ['Claim Frequency', header.claim_frequency],
    ['Project Start', project.start_date || ''],
    ['Project End', project.end_date || ''],
    ['Baseline Locked At', header.confirmed_at ? new Date(header.confirmed_at).toLocaleDateString('en-NZ') : 'Not locked'],
    ['Generated At', new Date().toLocaleDateString('en-NZ')],
  ];

  summaryData.forEach(([label, value], i) => {
    const row = wsSummary.addRow([label, value]);
    row.getCell(1).font = { bold: true, size: 10 };
    row.getCell(2).font = { size: 10 };
    if (typeof value === 'number' && (label as string).includes('Value')) {
      row.getCell(2).numFmt = '"$"#,##0.00';
    }
    if ((label as string).includes('%')) {
      row.getCell(2).numFmt = '0.00"%"';
    }
    const bg = i % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF';
    row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
    row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
  });

  // --- Tab 2: Baseline Items ---
  const wsItems = wb.addWorksheet('Baseline Items');
  wsItems.columns = [
    { key: 'line_number', width: 12 },
    { key: 'wbs', width: 15 },
    { key: 'trade', width: 15 },
    { key: 'location', width: 18 },
    { key: 'item_title', width: 40 },
    { key: 'item_description', width: 40 },
    { key: 'unit', width: 10 },
    { key: 'qty', width: 12 },
    { key: 'rate', width: 15 },
    { key: 'amount', width: 15 },
    { key: 'claim_method', width: 18 },
    { key: 'milestone_label', width: 20 },
  ];

  addTitleBlock(wsItems, 'BASELINE LINE ITEMS', `${project.project_name} | ${lineItems.length} items | Locked: ${header.baseline_status === 'locked' ? 'YES' : 'NO'}`, 12);

  const headers = ['Line No', 'WBS Code', 'Trade', 'Location', 'Item Title', 'Description', 'Unit', 'Qty', 'Rate', 'Amount', 'Claim Method', 'Milestone'];
  const hRow = wsItems.addRow(headers);
  const hColors = [SECTION_A, SECTION_A, SECTION_A, SECTION_A, SECTION_A, SECTION_A, SECTION_A, SECTION_A, SECTION_A, SECTION_A, SECTION_B, SECTION_B];
  headers.forEach((_, i) => {
    const cell = hRow.getCell(i + 1);
    applyHeaderStyle(cell, hColors[i]);
    cell.font = { bold: true, color: { argb: 'FF1F2937' }, size: 10 };
  });
  hRow.height = 35;

  let total = 0;
  lineItems.forEach((item, idx) => {
    const row = wsItems.addRow([
      item.line_number,
      item.work_breakdown_code || '',
      item.trade_category || '',
      item.location || '',
      item.item_title,
      item.item_description || '',
      item.unit,
      item.baseline_quantity,
      item.baseline_rate,
      item.baseline_amount,
      item.claim_method.replace(/_/g, ' '),
      item.milestone_label || '',
    ]);
    row.getCell(8).numFmt = '#,##0.00';
    row.getCell(9).numFmt = '"$"#,##0.0000';
    row.getCell(10).numFmt = '"$"#,##0.00';
    applyDataRowStyle(row, idx % 2 === 0);
    total += item.baseline_amount;
  });

  const totalRow = wsItems.addRow(['', '', '', '', '', '', 'TOTAL', '', '', total, '', '']);
  totalRow.getCell(7).font = { bold: true };
  totalRow.getCell(10).font = { bold: true };
  totalRow.getCell(10).numFmt = '"$"#,##0.00';
  totalRow.getCell(10).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };

  wsItems.views = [{ state: 'frozen', ySplit: 4 }];

  // --- Tab 3: Assumptions & Exclusions ---
  const wsNotes = wb.addWorksheet('Assumptions & Exclusions');
  wsNotes.columns = [{ width: 12 }, { width: 40 }, { width: 50 }, { width: 50 }];
  addTitleBlock(wsNotes, 'ASSUMPTIONS & EXCLUSIONS', project.project_name, 4);

  const notesHRow = wsNotes.addRow(['Line No', 'Item Title', 'Assumptions', 'Exclusions']);
  notesHRow.eachCell((cell) => applyHeaderStyle(cell));
  notesHRow.height = 30;

  lineItems
    .filter((i) => i.assumptions_notes || i.exclusions_notes)
    .forEach((item, idx) => {
      const row = wsNotes.addRow([item.line_number, item.item_title, item.assumptions_notes || '', item.exclusions_notes || '']);
      applyDataRowStyle(row, idx % 2 === 0);
      row.getCell(3).alignment = { wrapText: true };
      row.getCell(4).alignment = { wrapText: true };
      row.height = 30;
    });

  // --- Tab 4: Variations ---
  const wsVars = wb.addWorksheet('Variations');
  wsVars.columns = [{ width: 15 }, { width: 35 }, { width: 15 }, { width: 18 }, { width: 15 }, { width: 15 }, { width: 20 }];
  addTitleBlock(wsVars, 'VARIATION REGISTER', project.project_name, 7);

  const varHRow = wsVars.addRow(['Ref', 'Title', 'Type', 'Status', 'Amount', 'Approved $', 'Approved Date']);
  varHRow.eachCell((cell) => applyHeaderStyle(cell));
  varHRow.height = 30;

  variations.forEach((v, idx) => {
    const row = wsVars.addRow([
      v.variation_reference,
      v.title,
      v.variation_type.replace(/_/g, ' '),
      v.status.toUpperCase(),
      v.amount,
      v.approved_amount ?? '',
      v.approved_date ? new Date(v.approved_date).toLocaleDateString('en-NZ') : '',
    ]);
    row.getCell(5).numFmt = '"$"#,##0.00';
    if (v.approved_amount !== null) row.getCell(6).numFmt = '"$"#,##0.00';
    applyDataRowStyle(row, idx % 2 === 0);
  });

  // --- Tab 5: Audit Summary ---
  const wsAudit = wb.addWorksheet('Audit Summary');
  wsAudit.columns = [{ width: 30 }, { width: 40 }];
  addTitleBlock(wsAudit, 'AUDIT SUMMARY', 'Baseline Tracker Export — Controlled Document', 2);

  const auditData = [
    ['Export Generated At', new Date().toISOString()],
    ['Baseline Status', header.baseline_status.toUpperCase()],
    ['Baseline Version', header.baseline_version],
    ['Total Line Items', lineItems.length],
    ['Total Variations', variations.length],
    ['Approved Variations', variations.filter((v) => v.status === 'approved').length],
    ['Contract Value (excl. GST)', header.contract_value_excl_gst],
    ['Generated By', 'VerifyTrade Baseline Tracker'],
  ];

  auditData.forEach(([label, value], i) => {
    const row = wsAudit.addRow([label, value]);
    row.getCell(1).font = { bold: true, size: 10 };
    if (typeof value === 'number' && (label as string).includes('Value')) {
      row.getCell(2).numFmt = '"$"#,##0.00';
    }
    const bg = i % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF';
    row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
    row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
  });

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ============================================================
// CLAIM EXPORT
// ============================================================
export async function exportClaimPeriod(
  project: BTProject,
  header: BTBaselineHeader,
  claim: BTClaimPeriod,
  claimLines: BTClaimLineItem[],
  variations: BTVariation[]
): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'VerifyTrade Baseline Tracker';
  wb.created = new Date();

  // --- Tab 1: Claim Summary ---
  const wsSummary = wb.addWorksheet('Claim Summary');
  wsSummary.columns = [{ width: 35 }, { width: 35 }];
  addTitleBlock(wsSummary, `PAYMENT CLAIM — ${claim.claim_period_name}`, `Claim No. ${claim.claim_no} | ${project.project_name}`, 2);

  const summaryRows: [string, any][] = [
    ['Project Name', project.project_name],
    ['Project Code', project.project_code || ''],
    ['Contract Reference', project.contract_reference || ''],
    ['Client', project.client_name || ''],
    ['Main Contractor', project.main_contractor_name || ''],
    ['Claim No.', claim.claim_no],
    ['Claim Period Name', claim.claim_period_name],
    ['Period Start', claim.period_start ? new Date(claim.period_start).toLocaleDateString('en-NZ') : ''],
    ['Period End', claim.period_end ? new Date(claim.period_end).toLocaleDateString('en-NZ') : ''],
    ['Due Date', claim.due_date ? new Date(claim.due_date).toLocaleDateString('en-NZ') : ''],
    ['Status', claim.status.replace(/_/g, ' ').toUpperCase()],
    ['', ''],
    ['Baseline Contract Value', header.contract_value_excl_gst],
    ['Previous Claims Total', claim.previous_claimed_total],
    ['Current Claim Subtotal', claim.current_claim_subtotal],
    ['Approved Variations Total', claim.approved_variations_total],
    ['Gross Claim', claim.gross_claim],
    ['Retention Deduction', -Math.abs(claim.retention_amount)],
    ['Net Before GST', claim.net_before_gst],
    ['GST', claim.gst_amount],
    ['TOTAL THIS CLAIM (incl. GST)', claim.total_this_claim_incl_gst],
    ['', ''],
    ['Certified Amount', claim.certified_amount ?? 'Pending'],
    ['Paid Amount', claim.paid_amount ?? 'Pending'],
  ];

  summaryRows.forEach(([label, value], i) => {
    const row = wsSummary.addRow([label, value]);
    const isTotal = label === 'TOTAL THIS CLAIM (incl. GST)';
    row.getCell(1).font = { bold: isTotal, size: 10 };
    row.getCell(2).font = { bold: isTotal, size: 10 };
    if (typeof value === 'number') {
      row.getCell(2).numFmt = '"$"#,##0.00';
      if (isTotal) {
        row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
        row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
      }
    }
    if (label === '') return;
    const bg = i % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF';
    if (!isTotal) {
      row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
    }
  });

  // --- Tab 2: Claim Line Items ---
  const wsLines = wb.addWorksheet('Claim Line Items');
  wsLines.columns = [
    { width: 10 }, { width: 15 }, { width: 35 }, { width: 20 }, { width: 8 },
    { width: 12 }, { width: 15 }, { width: 12 }, { width: 12 }, { width: 12 },
    { width: 14 }, { width: 14 }, { width: 12 }, { width: 14 }, { width: 18 },
  ];
  addTitleBlock(wsLines, 'CLAIM LINE ITEMS', `Claim No. ${claim.claim_no} — ${claim.claim_period_name}`, 15);

  const lineHeaders = [
    'Line No', 'WBS Code', 'Item Title', 'Location', 'Unit',
    'Baseline Qty', 'Baseline $', 'Prev Claimed', 'This Claim Qty', 'This Claim %',
    'This Claim $', 'Total Claimed $', 'Remaining Qty', 'Remaining $', 'Status',
  ];
  const lineHColors = [
    SECTION_A, SECTION_A, SECTION_A, SECTION_A, SECTION_A,
    SECTION_A, SECTION_A, SECTION_B, SECTION_B, SECTION_B,
    SECTION_C, SECTION_C, SECTION_C, SECTION_C, SECTION_D,
  ];
  const lineHRow = wsLines.addRow(lineHeaders);
  lineHeaders.forEach((_, i) => {
    const cell = lineHRow.getCell(i + 1);
    applyHeaderStyle(cell, lineHColors[i]);
    cell.font = { bold: true, color: { argb: 'FF1F2937' }, size: 9 };
  });
  lineHRow.height = 35;

  claimLines.forEach((cl, idx) => {
    const li = cl.baseline_line_item;
    const row = wsLines.addRow([
      li?.line_number || '',
      li?.work_breakdown_code || '',
      li?.item_title || '',
      li?.location || '',
      li?.unit || '',
      li?.baseline_quantity || 0,
      li?.baseline_amount || 0,
      cl.previous_value_claimed,
      cl.this_period_quantity,
      cl.this_period_percent / 100,
      cl.this_period_value,
      cl.total_value_claimed_to_date,
      cl.remaining_quantity,
      cl.remaining_value,
      cl.line_status.replace(/_/g, ' '),
    ]);
    [6, 7, 8, 11, 12, 14].forEach((c) => { row.getCell(c).numFmt = '"$"#,##0.00'; });
    [9].forEach((c) => { row.getCell(c).numFmt = '#,##0.00'; });
    row.getCell(10).numFmt = '0.00%';
    row.getCell(13).numFmt = '#,##0.00';
    applyDataRowStyle(row, idx % 2 === 0);
  });

  wsLines.views = [{ state: 'frozen', ySplit: 4 }];

  // --- Tab 3: Variations ---
  const wsVars = wb.addWorksheet('Variations');
  wsVars.columns = [{ width: 15 }, { width: 35 }, { width: 15 }, { width: 18 }, { width: 15 }, { width: 15 }, { width: 18 }, { width: 18 }];
  addTitleBlock(wsVars, 'VARIATIONS', `Claim No. ${claim.claim_no}`, 8);

  const varHRow = wsVars.addRow(['Ref', 'Title', 'Type', 'Status', 'Amount', 'Approved $', 'Claimed to Date', 'Remaining']);
  varHRow.eachCell((cell) => applyHeaderStyle(cell));
  varHRow.height = 30;

  variations.forEach((v, idx) => {
    const remaining = (v.approved_amount ?? v.amount) - v.claimed_to_date;
    const row = wsVars.addRow([
      v.variation_reference, v.title,
      v.variation_type.replace(/_/g, ' '),
      v.status.toUpperCase(),
      v.amount, v.approved_amount ?? '',
      v.claimed_to_date, remaining,
    ]);
    [5, 6, 7, 8].forEach((c) => { if (typeof row.getCell(c).value === 'number') row.getCell(c).numFmt = '"$"#,##0.00'; });
    applyDataRowStyle(row, idx % 2 === 0);
  });

  // --- Tab 4: Retention & Deductions ---
  const wsRet = wb.addWorksheet('Retention & Deductions');
  wsRet.columns = [{ width: 35 }, { width: 20 }, { width: 15 }, { width: 15 }];
  addTitleBlock(wsRet, 'RETENTION & DEDUCTIONS', `Claim No. ${claim.claim_no}`, 4);

  const retHRow = wsRet.addRow(['Description', 'Basis', 'Rate / %', 'Amount']);
  retHRow.eachCell((cell) => applyHeaderStyle(cell));
  retHRow.height = 30;

  const retRows: [string, string, any, number][] = [
    ['Retention', 'Gross Claim', `${header.retention_percent}%`, claim.retention_amount],
  ];
  retRows.forEach(([desc, basis, rate, amount], idx) => {
    const row = wsRet.addRow([desc, basis, rate, amount]);
    row.getCell(4).numFmt = '"$"#,##0.00';
    applyDataRowStyle(row, idx % 2 === 0);
  });

  // --- Tab 5: Notes ---
  const wsNotes = wb.addWorksheet('Notes');
  wsNotes.columns = [{ width: 25 }, { width: 60 }];
  addTitleBlock(wsNotes, 'CLAIM NOTES', `Claim No. ${claim.claim_no}`, 2);

  const notesData: [string, string][] = [
    ['Claim Notes', claim.notes || ''],
    ['Submission Notes', claim.submitted_at ? `Submitted on ${new Date(claim.submitted_at).toLocaleDateString('en-NZ')}` : 'Not yet submitted'],
  ];
  notesData.forEach(([label, value], i) => {
    const row = wsNotes.addRow([label, value]);
    row.getCell(1).font = { bold: true, size: 10 };
    row.getCell(2).alignment = { wrapText: true };
    row.height = 30;
    const bg = i % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF';
    row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
    row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
  });

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ============================================================
// PROGRESS EXPORT
// ============================================================
export async function exportProgressSummary(
  project: BTProject,
  lineItems: BTBaselineLineItem[],
  claimedTotals: Map<string, number>
): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'VerifyTrade Baseline Tracker';

  const ws = wb.addWorksheet('Progress Summary');
  ws.columns = [
    { width: 10 }, { width: 15 }, { width: 40 }, { width: 18 }, { width: 8 },
    { width: 12 }, { width: 15 }, { width: 14 }, { width: 14 }, { width: 12 },
  ];
  addTitleBlock(ws, 'PROGRESS SUMMARY', `${project.project_name} | Generated: ${new Date().toLocaleDateString('en-NZ')}`, 10);

  const headers = ['Line No', 'WBS Code', 'Item Title', 'Location', 'Unit', 'Baseline Qty', 'Baseline $', 'Claimed to Date $', 'Remaining $', 'Progress %'];
  const hRow = ws.addRow(headers);
  hRow.eachCell((cell) => applyHeaderStyle(cell));
  hRow.height = 35;

  let totalBaseline = 0;
  let totalClaimed = 0;

  lineItems.forEach((item, idx) => {
    const claimed = claimedTotals.get(item.id) || 0;
    const remaining = item.baseline_amount - claimed;
    const progress = item.baseline_amount > 0 ? claimed / item.baseline_amount : 0;
    totalBaseline += item.baseline_amount;
    totalClaimed += claimed;

    const row = ws.addRow([
      item.line_number,
      item.work_breakdown_code || '',
      item.item_title,
      item.location || '',
      item.unit,
      item.baseline_quantity,
      item.baseline_amount,
      claimed,
      remaining,
      progress,
    ]);
    [6].forEach((c) => { row.getCell(c).numFmt = '#,##0.00'; });
    [7, 8, 9].forEach((c) => { row.getCell(c).numFmt = '"$"#,##0.00'; });
    row.getCell(10).numFmt = '0.0%';
    applyDataRowStyle(row, idx % 2 === 0);
  });

  const totRow = ws.addRow(['', '', 'TOTAL', '', '', '', totalBaseline, totalClaimed, totalBaseline - totalClaimed, totalBaseline > 0 ? totalClaimed / totalBaseline : 0]);
  totRow.getCell(3).font = { bold: true };
  [7, 8, 9].forEach((c) => { totRow.getCell(c).numFmt = '"$"#,##0.00'; totRow.getCell(c).font = { bold: true }; });
  totRow.getCell(10).numFmt = '0.0%';
  totRow.getCell(10).font = { bold: true };
  for (let c = 1; c <= 10; c++) {
    totRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
  }

  ws.views = [{ state: 'frozen', ySplit: 4 }];

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}
