/**
 * VO TRACKER EXCEL EXPORT
 *
 * Generates Variation Order (VO) Tracker Excel file per project/trade/supplier.
 * Tracks all scope changes separately from the Base Tracker to prevent baseline contamination.
 */

import ExcelJS from 'exceljs';
import { supabase } from '../supabase';

interface VOTrackerExportOptions {
  projectId: string;
  projectName: string;
  tradeKey?: string; // Optional - can export all trades
  supplierId?: string; // Optional - can export all suppliers
  supplierName?: string;
}

interface VariationOrder {
  id: string;
  vo_number: string;
  linked_boq_line_id: string | null;
  description: string;
  instruction_ref: string | null;
  reason: string | null;
  qty: number | null;
  unit: string | null;
  rate: number | null;
  amount: number | null;
  status: string;
  submitted_at: string | null;
  approved_at: string | null;
  approved_by_user_id: string | null;
  certified_this_period: boolean;
  certification_period: string | null;
  notes: string | null;
  suppliers?: { name: string };
}

export async function exportVOTracker(options: VOTrackerExportOptions): Promise<Blob> {
  const {
    projectId,
    projectName,
    tradeKey,
    supplierId,
    supplierName
  } = options;

  console.log('[VO Tracker] Starting export:', options);

  // 1. Build query for variations
  let query = supabase
    .from('variation_register')
    .select(`
      *,
      suppliers (
        name
      )
    `)
    .eq('project_id', projectId)
    .order('vo_number');

  if (tradeKey) {
    query = query.eq('trade_key', tradeKey);
  }

  if (supplierId) {
    query = query.eq('supplier_id', supplierId);
  }

  const { data: variations, error: voError } = await query;

  if (voError) {
    console.error('[VO Tracker] Error fetching variations:', voError);
    throw voError;
  }

  console.log(`[VO Tracker] Found ${variations?.length || 0} variations`);

  // 2. Create workbook
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'VerifyTrade Commercial Control';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('VO_REGISTER');

  // 3. Set up columns
  worksheet.columns = [
    { key: 'vo_id', width: 15 },
    { key: 'linked_boq_line_id', width: 15 },
    { key: 'supplier', width: 25 },
    { key: 'trade', width: 15 },
    { key: 'description', width: 40 },
    { key: 'instruction_ref', width: 20 },
    { key: 'reason', width: 20 },
    { key: 'qty', width: 12 },
    { key: 'unit', width: 10 },
    { key: 'rate', width: 15 },
    { key: 'amount', width: 15 },
    { key: 'status', width: 12 },
    { key: 'submitted_at', width: 15 },
    { key: 'approved_by', width: 20 },
    { key: 'approved_date', width: 15 },
    { key: 'certified_this_period', width: 18 },
    { key: 'certification_period', width: 18 },
    { key: 'notes', width: 30 }
  ];

  // 4. Add title
  worksheet.mergeCells('A1:R1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = `VARIATION ORDER (VO) TRACKER - ${projectName}`;
  titleCell.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(1).height = 30;

  // 5. Add subtitle
  worksheet.mergeCells('A2:R2');
  const infoCell = worksheet.getCell('A2');
  let subtitle = '';
  if (supplierName) subtitle = `Supplier: ${supplierName}`;
  if (tradeKey) subtitle += (subtitle ? ' | ' : '') + `Trade: ${tradeKey.toUpperCase()}`;
  if (!subtitle) subtitle = 'All Suppliers & Trades';
  subtitle += ` | Generated: ${new Date().toLocaleDateString('en-NZ')}`;
  infoCell.value = subtitle;
  infoCell.font = { size: 12, bold: true };
  infoCell.alignment = { horizontal: 'center' };
  worksheet.getRow(2).height = 25;

  // 6. Add notice
  worksheet.mergeCells('A3:R3');
  const noticeCell = worksheet.getCell('A3');
  noticeCell.value = '⚠️ CONTRACTUAL NOTICE: All variations must be approved before certification. Base Tracker quantities never change due to VOs.';
  noticeCell.font = { size: 10, bold: true, color: { argb: 'FFB91C1C' } };
  noticeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF2F2' } };
  noticeCell.alignment = { horizontal: 'center', wrapText: true };
  worksheet.getRow(3).height = 30;

  worksheet.addRow([]); // Spacing

  // 7. Add column headers
  const headerRow = worksheet.getRow(5);
  const headers = [
    'VO_ID',
    'Linked_BOQ_Line_ID',
    'Supplier',
    'Trade',
    'Description',
    'Instruction_Ref',
    'Reason',
    'Qty',
    'Unit',
    'Rate',
    'Amount',
    'Status',
    'Submitted_At',
    'Approved_By',
    'Approved_Date',
    'Certified_This_Period',
    'Certification_Period',
    'Notes'
  ];

  headers.forEach((header, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = header;
    cell.font = { size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF374151' } },
      bottom: { style: 'medium', color: { argb: 'FF374151' } },
      left: { style: 'thin', color: { argb: 'FF9CA3AF' } },
      right: { style: 'thin', color: { argb: 'FF9CA3AF' } }
    };
  });
  worksheet.getRow(5).height = 35;

  // 8. Add variation data rows
  let currentRow = 6;
  let totalAmount = 0;
  const statusCounts = { Draft: 0, Submitted: 0, Approved: 0, Rejected: 0 };

  (variations || []).forEach((vo: any) => {
    const row = worksheet.getRow(currentRow);

    row.getCell(1).value = vo.vo_number;
    row.getCell(2).value = vo.linked_boq_line_id || '';
    row.getCell(3).value = vo.suppliers?.name || 'N/A';
    row.getCell(4).value = vo.trade_key || '';
    row.getCell(5).value = vo.description || '';
    row.getCell(6).value = vo.instruction_ref || '';
    row.getCell(7).value = vo.reason || '';
    row.getCell(8).value = vo.qty || 0;
    row.getCell(9).value = vo.unit || 'ea';
    row.getCell(10).value = vo.rate || 0;
    row.getCell(11).value = vo.amount || 0;
    row.getCell(12).value = vo.status || 'Draft';
    row.getCell(13).value = vo.submitted_at ? new Date(vo.submitted_at).toLocaleDateString('en-NZ') : '';
    row.getCell(14).value = ''; // TODO: Fetch user name
    row.getCell(15).value = vo.approved_at ? new Date(vo.approved_at).toLocaleDateString('en-NZ') : '';
    row.getCell(16).value = vo.certified_this_period ? 'YES' : 'NO';
    row.getCell(17).value = vo.certification_period || '';
    row.getCell(18).value = vo.notes || '';

    // Apply formatting
    row.getCell(8).numFmt = '#,##0.00';
    row.getCell(10).numFmt = '$#,##0.00';
    row.getCell(11).numFmt = '$#,##0.00';

    // Status-based highlighting
    const statusCell = row.getCell(12);
    switch (vo.status) {
      case 'Approved':
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
        statusCell.font = { bold: true, color: { argb: 'FF065F46' } };
        totalAmount += vo.amount || 0;
        break;
      case 'Rejected':
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFECACA' } };
        statusCell.font = { bold: true, color: { argb: 'FFB91C1C' } };
        break;
      case 'Submitted':
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
        statusCell.font = { bold: true, color: { argb: 'FF92400E' } };
        break;
      default:
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
    }

    // Update status counts
    statusCounts[vo.status as keyof typeof statusCounts] = (statusCounts[vo.status as keyof typeof statusCounts] || 0) + 1;

    // Apply borders
    for (let col = 1; col <= 18; col++) {
      row.getCell(col).border = {
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
      };
    }

    row.height = 25;
    currentRow++;
  });

  // 9. Add summary section
  currentRow += 2;
  worksheet.mergeCells(`A${currentRow}:J${currentRow}`);
  const summaryTitleCell = worksheet.getCell(`A${currentRow}`);
  summaryTitleCell.value = 'VARIATION SUMMARY';
  summaryTitleCell.font = { size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
  summaryTitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } };
  summaryTitleCell.alignment = { horizontal: 'center' };
  worksheet.getRow(currentRow).height = 25;
  currentRow++;

  const summaryData = [
    ['Total Variations:', (variations?.length || 0).toString()],
    ['Approved VOs:', statusCounts.Approved.toString()],
    ['Pending VOs:', statusCounts.Submitted.toString()],
    ['Draft VOs:', statusCounts.Draft.toString()],
    ['Rejected VOs:', statusCounts.Rejected.toString()],
    ['Total Approved Amount:', `$${totalAmount.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]
  ];

  summaryData.forEach(([label, value]) => {
    const row = worksheet.getRow(currentRow);
    row.getCell(1).value = label;
    row.getCell(1).font = { bold: true };
    row.getCell(2).value = value;
    row.getCell(2).font = { size: 11 };
    currentRow++;
  });

  // 10. Freeze panes
  worksheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 5 }];

  // 11. Add footer
  currentRow += 2;
  worksheet.mergeCells(`A${currentRow}:R${currentRow}`);
  const footerCell = worksheet.getCell(`A${currentRow}`);
  footerCell.value = `Generated by VerifyTrade Commercial Control | ${new Date().toLocaleDateString('en-NZ')} | This is a controlled document`;
  footerCell.font = { size: 9, italic: true, color: { argb: 'FF6B7280' } };
  footerCell.alignment = { horizontal: 'center' };

  // 12. Log to audit trail
  await supabase.rpc('log_commercial_action', {
    p_project_id: projectId,
    p_action_type: 'vo_tracker_exported',
    p_entity_type: 'variation',
    p_entity_id: projectId, // Use project ID as entity
    p_details: {
      trade: tradeKey || 'all',
      supplier: supplierName || 'all',
      vo_count: variations?.length || 0,
      total_approved_amount: totalAmount
    }
  });

  // 13. Generate file
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/**
 * Download VO Tracker file
 */
export async function downloadVOTracker(options: VOTrackerExportOptions): Promise<void> {
  const blob = await exportVOTracker(options);
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;

  let filename = `VO_TRACKER_${options.projectName.replace(/[^a-zA-Z0-9]/g, '_')}`;
  if (options.tradeKey) filename += `_${options.tradeKey.toUpperCase()}`;
  if (options.supplierName) filename += `_${options.supplierName.replace(/[^a-zA-Z0-9]/g, '_')}`;
  filename += `_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.xlsx`;

  link.download = filename;
  link.click();

  window.URL.revokeObjectURL(url);
  console.log('[VO Tracker] Export completed:', filename);
}
