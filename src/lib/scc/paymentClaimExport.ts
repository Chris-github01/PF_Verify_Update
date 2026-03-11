import ExcelJS from 'exceljs';
import { LEGAL_NOTICE } from './paymentClaimCalculations';
import type { ClaimLine, ClaimTotals } from './paymentClaimCalculations';

export interface ClaimHeader {
  claim_number: string;
  our_ref: string;
  internal_reference: string;
  trade: string;
  project_name: string;
  site_location: string;
  claim_period: string;
  claim_period_start: string | null;
  claim_period_end: string | null;
  submission_date: string | null;
  last_date_for_submitting: string | null;
  due_date: string | null;
  payer_company: string;
  payer_attention: string;
  payer_address: string;
  payee_company: string;
  payee_contact: string;
  payee_address: string;
  bank_name: string;
  account_name: string;
  account_number: string;
  payment_notes: string;
  retention_rate_tier1: number;
  retention_rate_tier2: number;
  retention_rate_tier3: number;
  retention_released: number;
  previous_net_claimed: number;
  net_payment_certified: number;
  status: string;
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' });
}

function pct(r: number): string {
  return `${(r * 100).toFixed(2)}%`;
}

const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E2A3A' } };
const SUBHEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
const TOTAL_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF164E63' } };
const HIGHLIGHT_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF083344' } };
const WHITE_FONT: Partial<ExcelJS.Font> = { color: { argb: 'FFFFFFFF' }, bold: true };
const CYAN_FONT: Partial<ExcelJS.Font> = { color: { argb: 'FF22D3EE' }, bold: true };
const CURRENCY_FMT = '#,##0.00';
const PCT_FMT = '0.00%';

export async function exportPaymentClaimExcel(
  claim: ClaimHeader,
  lines: ClaimLine[],
  totals: ClaimTotals
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'VerifyTrade';
  wb.created = new Date();

  buildSummarySheet(wb, claim, totals);
  buildBaseContractSheet(wb, lines.filter(l => l.line_type === 'base'), totals);
  buildVariationsSheet(wb, lines.filter(l => l.line_type === 'variation'), totals);
  buildNoticeSheet(wb);

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeName = (claim.project_name || 'Project').replace(/[^a-zA-Z0-9\-_ ]/g, '').trim().replace(/ /g, '_');
  a.download = `${safeName}_PaymentClaim_${claim.claim_number || 'draft'}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function addRow(ws: ExcelJS.Worksheet, label: string, value: string | number, opts?: {
  labelFill?: ExcelJS.Fill;
  valueFill?: ExcelJS.Fill;
  labelFont?: Partial<ExcelJS.Font>;
  valueFont?: Partial<ExcelJS.Font>;
  numFmt?: string;
  border?: boolean;
}): ExcelJS.Row {
  const row = ws.addRow([label, value]);
  const labelCell = row.getCell(1);
  const valueCell = row.getCell(2);
  labelCell.font = opts?.labelFont ?? { color: { argb: 'FF94A3B8' }, size: 10 };
  valueCell.font = opts?.valueFont ?? { color: { argb: 'FFFFFFFF' }, size: 10 };
  if (opts?.labelFill) labelCell.fill = opts.labelFill;
  if (opts?.valueFill) valueCell.fill = opts.valueFill;
  if (opts?.numFmt) valueCell.numFmt = opts.numFmt;
  labelCell.alignment = { vertical: 'middle' };
  valueCell.alignment = { vertical: 'middle' };
  return row;
}

function buildSummarySheet(wb: ExcelJS.Workbook, claim: ClaimHeader, totals: ClaimTotals) {
  const ws = wb.addWorksheet('Claim Summary');
  ws.properties.defaultColWidth = 30;

  ws.getColumn(1).width = 38;
  ws.getColumn(2).width = 28;

  const titleRow = ws.addRow(['PAYMENT CLAIM', `No. ${claim.claim_number || '—'}`]);
  titleRow.height = 30;
  titleRow.getCell(1).font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  titleRow.getCell(1).fill = HEADER_FILL;
  titleRow.getCell(2).font = { bold: true, size: 14, color: { argb: 'FF22D3EE' } };
  titleRow.getCell(2).fill = HEADER_FILL;

  ws.addRow(['Construction Contracts Act 2002 — Form 1', '']).getCell(1).font = { italic: true, color: { argb: 'FF64748B' }, size: 9 };
  ws.addRow([]);

  const sectionHeader = (label: string) => {
    const r = ws.addRow([label, '']);
    ws.mergeCells(`A${r.number}:B${r.number}`);
    r.getCell(1).font = WHITE_FONT;
    r.getCell(1).fill = SUBHEADER_FILL;
    r.height = 18;
  };

  sectionHeader('CLAIM DETAILS');
  addRow(ws, 'Our Reference', claim.our_ref || claim.internal_reference || '');
  addRow(ws, 'Trade', claim.trade || '');
  addRow(ws, 'Project', claim.project_name || '');
  addRow(ws, 'Site Location', claim.site_location || '');
  addRow(ws, 'Claim Period', claim.claim_period || '');
  addRow(ws, 'Submission Date', fmtDate(claim.submission_date || claim.last_date_for_submitting));
  addRow(ws, 'Due Date for Payment', fmtDate(claim.due_date));
  ws.addRow([]);

  sectionHeader('TO — PAYER');
  addRow(ws, 'Company', claim.payer_company || '');
  addRow(ws, 'Attention', claim.payer_attention || '');
  addRow(ws, 'Address', claim.payer_address || '');
  ws.addRow([]);

  sectionHeader('FROM — PAYEE');
  addRow(ws, 'Company', claim.payee_company || '');
  addRow(ws, 'Contact', claim.payee_contact || '');
  addRow(ws, 'Address', claim.payee_address || '');
  ws.addRow([]);

  sectionHeader('FINANCIAL SUMMARY');
  addRow(ws, 'Total Base Contract (A)', totals.baseTotal, { numFmt: CURRENCY_FMT, valueFont: { color: { argb: 'FFFFFFFF' }, size: 11 } });
  addRow(ws, 'Total Variations (B)', totals.variationsTotal, { numFmt: CURRENCY_FMT, valueFont: { color: { argb: 'FFFFFFFF' }, size: 11 } });
  addRow(ws, 'Total (A + B) = C', totals.totalC, { numFmt: CURRENCY_FMT, valueFont: WHITE_FONT });
  addRow(ws, `Retention (${pct(claim.retention_rate_tier1)} / ${pct(claim.retention_rate_tier2)} / ${pct(claim.retention_rate_tier3)})`, totals.retentionAmount, { numFmt: CURRENCY_FMT, valueFont: { color: { argb: 'FFEF4444' }, bold: true } });
  addRow(ws, 'Add: Retentions Released', claim.retention_released, { numFmt: CURRENCY_FMT, valueFont: { color: { argb: 'FF22C55E' }, bold: true } });
  addRow(ws, 'Net Claim to Date (E)', totals.netClaimToDateE, { numFmt: CURRENCY_FMT, labelFill: TOTAL_FILL, valueFill: TOTAL_FILL, labelFont: WHITE_FONT, valueFont: WHITE_FONT });
  addRow(ws, 'Less Previous Net Claimed (F)', claim.previous_net_claimed, { numFmt: CURRENCY_FMT, valueFont: { color: { argb: 'FFEF4444' }, bold: true } });

  const thisClaimRow = ws.addRow(['Claimed This Period (excl. GST)', totals.claimedThisPeriodExGst]);
  thisClaimRow.height = 22;
  thisClaimRow.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
  thisClaimRow.getCell(1).fill = HIGHLIGHT_FILL;
  thisClaimRow.getCell(2).font = { bold: true, color: { argb: 'FF22D3EE' }, size: 12 };
  thisClaimRow.getCell(2).fill = HIGHLIGHT_FILL;
  thisClaimRow.getCell(2).numFmt = CURRENCY_FMT;

  addRow(ws, 'GST (15%)', totals.gstAmount, { numFmt: CURRENCY_FMT });

  const inclGstRow = ws.addRow(['Claimed This Period (incl. GST)', totals.claimedThisPeriodIncGst]);
  inclGstRow.height = 26;
  inclGstRow.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 14 };
  inclGstRow.getCell(1).fill = HEADER_FILL;
  inclGstRow.getCell(2).font = { bold: true, color: { argb: 'FF22D3EE' }, size: 14 };
  inclGstRow.getCell(2).fill = HEADER_FILL;
  inclGstRow.getCell(2).numFmt = CURRENCY_FMT;

  ws.addRow([]);
  sectionHeader('DIRECT CREDIT DETAILS');
  addRow(ws, 'Bank Name', claim.bank_name || '');
  addRow(ws, 'Account Name', claim.account_name || '');
  addRow(ws, 'Account Number', claim.account_number || '');
  if (claim.payment_notes) addRow(ws, 'Payment Notes', claim.payment_notes);
}

function buildBaseContractSheet(wb: ExcelJS.Workbook, lines: ClaimLine[], _totals: ClaimTotals) {
  const ws = wb.addWorksheet('Base Contract');

  const headers = ['Item No', 'Description', 'Qty', 'Unit', 'Rate', 'Total Contract', 'Claim %', 'Claim to Date $', 'Previous Claimed', 'This Claim $', 'Notes'];
  const widths = [10, 40, 10, 10, 15, 18, 10, 18, 18, 18, 30];

  headers.forEach((h, i) => {
    ws.getColumn(i + 1).width = widths[i];
  });

  const headerRow = ws.addRow(headers);
  headerRow.eachCell(cell => {
    cell.fill = HEADER_FILL;
    cell.font = WHITE_FONT;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF22D3EE' } } };
  });
  headerRow.height = 24;
  ws.getRow(1).frozen = { xSplit: 0, ySplit: 1 };

  let baseTotal = 0;
  let claimToDateTotal = 0;
  let prevClaimedTotal = 0;
  let thisClaimTotal = 0;

  lines.forEach(l => {
    const thisClaimVal = l.claim_to_date_amount - (l.previous_claimed_value || 0);
    baseTotal += l.total || 0;
    claimToDateTotal += l.claim_to_date_amount || 0;
    prevClaimedTotal += l.previous_claimed_value || 0;
    thisClaimTotal += thisClaimVal;

    const row = ws.addRow([
      l.item_no,
      l.description,
      l.qty,
      l.unit,
      l.rate,
      l.total,
      (l.claim_to_date_pct || 0) / 100,
      l.claim_to_date_amount,
      l.previous_claimed_value || 0,
      thisClaimVal,
      '',
    ]);
    row.getCell(5).numFmt = CURRENCY_FMT;
    row.getCell(6).numFmt = CURRENCY_FMT;
    row.getCell(7).numFmt = PCT_FMT;
    row.getCell(8).numFmt = CURRENCY_FMT;
    row.getCell(9).numFmt = CURRENCY_FMT;
    row.getCell(10).numFmt = CURRENCY_FMT;
    row.getCell(10).font = CYAN_FONT;
    row.getCell(2).font = { color: { argb: 'FFFFFFFF' } };
  });

  ws.addRow([]);
  const totalRow = ws.addRow(['', 'TOTAL BASE CONTRACT', '', '', '', baseTotal, '', claimToDateTotal, prevClaimedTotal, thisClaimTotal, '']);
  totalRow.eachCell(cell => {
    cell.fill = TOTAL_FILL;
    cell.font = WHITE_FONT;
  });
  [6, 8, 9, 10].forEach(c => { totalRow.getCell(c).numFmt = CURRENCY_FMT; totalRow.getCell(c).font = CYAN_FONT; });
}

function buildVariationsSheet(wb: ExcelJS.Workbook, lines: ClaimLine[], _totals: ClaimTotals) {
  const ws = wb.addWorksheet('Variations');

  const headers = ['Var No', 'Description', 'Qty', 'Unit', 'Rate', 'Variation Amount', 'Claim to Date $', 'Notes'];
  const widths = [10, 45, 10, 10, 15, 20, 20, 30];

  headers.forEach((h, i) => {
    ws.getColumn(i + 1).width = widths[i];
  });

  const headerRow = ws.addRow(headers);
  headerRow.eachCell(cell => {
    cell.fill = HEADER_FILL;
    cell.font = WHITE_FONT;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF22D3EE' } } };
  });
  headerRow.height = 24;
  ws.getRow(1).frozen = { xSplit: 0, ySplit: 1 };

  let varTotal = 0;
  let claimTotal = 0;

  lines.forEach(l => {
    varTotal += l.total || 0;
    claimTotal += l.claim_to_date_amount || 0;

    const row = ws.addRow([
      l.item_no,
      l.description,
      l.qty,
      l.unit,
      l.rate,
      l.total,
      l.claim_to_date_amount,
      '',
    ]);
    row.getCell(5).numFmt = CURRENCY_FMT;
    row.getCell(6).numFmt = CURRENCY_FMT;
    row.getCell(7).numFmt = CURRENCY_FMT;
    row.getCell(7).font = CYAN_FONT;
    row.getCell(2).font = { color: { argb: 'FFFFFFFF' } };
  });

  if (lines.length === 0) {
    const emptyRow = ws.addRow(['', 'No variations claimed this period.', '', '', '', '', '', '']);
    emptyRow.getCell(2).font = { italic: true, color: { argb: 'FF64748B' } };
  }

  ws.addRow([]);
  const totalRow = ws.addRow(['', 'TOTAL VARIATIONS', '', '', '', varTotal, claimTotal, '']);
  totalRow.eachCell(cell => { cell.fill = TOTAL_FILL; cell.font = WHITE_FONT; });
  [6, 7].forEach(c => { totalRow.getCell(c).numFmt = CURRENCY_FMT; totalRow.getCell(c).font = CYAN_FONT; });
}

function buildNoticeSheet(wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet('Section 20 Notice');
  ws.getColumn(1).width = 100;

  const titleRow = ws.addRow(['STATUTORY NOTICE — CONSTRUCTION CONTRACTS ACT 2002']);
  ws.mergeCells(`A${titleRow.number}:A${titleRow.number}`);
  titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  titleRow.getCell(1).fill = HEADER_FILL;
  titleRow.height = 24;

  ws.addRow([]);

  LEGAL_NOTICE.split('\n').forEach(line => {
    const row = ws.addRow([line]);
    row.getCell(1).font = { size: 10, color: { argb: 'FFE2E8F0' } };
    row.getCell(1).alignment = { wrapText: true, vertical: 'top' };
    if (line.trim().length > 0 && !line.startsWith('(')) {
      if (line === line.toUpperCase() && line.trim().length > 5) {
        row.getCell(1).font = { bold: true, size: 11, color: { argb: 'FF22D3EE' } };
        row.height = 20;
      }
    }
  });
}
