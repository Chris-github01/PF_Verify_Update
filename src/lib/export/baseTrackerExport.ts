/**
 * BASE TRACKER EXCEL EXPORT (INDEPENDENT VERSION)
 *
 * Generates mandatory monthly progress claim tracker Excel file per awarded supplier/trade.
 * This file locks the commercial baseline and is used for all progress claims.
 *
 * KEY CHANGE: Now uses commercial_baseline_items instead of boq_lines.
 * Completely independent of BOQ Builder.
 *
 * CRITICAL: Column structure must match spec exactly. DO NOT CHANGE ORDER.
 */

import ExcelJS from 'exceljs';
import { supabase } from '../supabase';

interface BaseTrackerExportOptions {
  projectId: string;
  projectName: string;
  awardApprovalId: string;
  supplierName: string;
  period: string; // Format: YYYY-MM
  version?: number;
}

interface BaselineItem {
  line_number: string;
  line_type: string;
  description: string;
  location_zone: string | null;
  system_category: string | null;
  scope_category: string | null;
  unit: string;
  quantity: number;
  unit_rate: number;
  line_amount: number;
  notes: string | null;
}

export async function exportBaseTracker(options: BaseTrackerExportOptions): Promise<Blob> {
  const {
    projectId,
    projectName,
    awardApprovalId,
    supplierName,
    period,
    version = 1
  } = options;

  console.log('[Base Tracker] Starting INDEPENDENT export:', options);

  // 1. Get award details
  const { data: award, error: awardError } = await supabase
    .from('award_approvals')
    .select('id, final_approved_supplier, final_approved_quote_id')
    .eq('id', awardApprovalId)
    .single();

  if (awardError || !award) {
    throw new Error(`Award not found: ${awardApprovalId}`);
  }

  // 2. Fetch commercial baseline items (NOT boq_lines!)
  const { data: baselineItems, error: baselineError } = await supabase
    .from('commercial_baseline_items')
    .select('*')
    .eq('award_approval_id', awardApprovalId)
    .eq('is_active', true)
    .order('line_number');

  if (baselineError) {
    console.error('[Base Tracker] Error fetching baseline:', baselineError);
    throw baselineError;
  }

  if (!baselineItems || baselineItems.length === 0) {
    throw new Error(`No commercial baseline found for award ${awardApprovalId}. Generate baseline first.`);
  }

  console.log(`[Base Tracker] Found ${baselineItems.length} baseline items (independent of BOQ Builder)`);

  // 3. Check for previous period claims (to populate Qty_Claimed_Previous)
  const previousPeriod = getPreviousPeriod(period);
  const { data: previousClaim } = await supabase
    .from('base_tracker_claims')
    .select('line_items')
    .eq('project_id', projectId)
    .eq('base_tracker_id', awardApprovalId)
    .eq('period', previousPeriod)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const previousClaimedMap = new Map<string, number>();
  if (previousClaim?.line_items) {
    (previousClaim.line_items as any[]).forEach(item => {
      previousClaimedMap.set(item.line_number, item.qty_claimed_to_date || 0);
    });
  }

  // 3. Create workbook
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'VerifyTrade Commercial Control';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('BASE_TRACKER');

  // 4. Set up columns - EXACT ORDER AS PER SPEC
  worksheet.columns = [
    // SECTION A - CONTRACT BASELINE (LOCKED)
    { key: 'boq_line_id', width: 15 },
    { key: 'trade', width: 15 },
    { key: 'system_description', width: 40 },
    { key: 'location_zone', width: 20 },
    { key: 'spec_or_drawing_ref', width: 20 },
    { key: 'unit', width: 10 },
    { key: 'contract_qty', width: 12 },
    { key: 'contract_rate', width: 15 },
    { key: 'contract_amount', width: 15 },
    { key: 'allowance_type', width: 15 },
    { key: 'scope_assumptions', width: 30 },
    { key: 'scope_exclusions', width: 30 },
    // SECTION B - SUPPLIER INPUT (UNLOCKED)
    { key: 'qty_claimed_previous', width: 15 },
    { key: 'qty_claimed_this_period', width: 18 },
    // SECTION C - AUTO CALCULATED (LOCKED)
    { key: 'qty_claimed_total', width: 15 },
    { key: 'percent_complete', width: 15 },
    { key: 'amount_claimed_to_date', width: 20 },
    { key: 'this_period_amount', width: 18 },
    { key: 'qty_remaining', width: 15 },
    { key: 'amount_remaining', width: 18 },
    { key: 'over_claim_flag', width: 12 },
    { key: 'under_claim_flag', width: 15 },
    { key: 'completion_risk', width: 15 },
    // SECTION D - QS ASSESSMENT (LOCKED)
    { key: 'qs_assessed_qty', width: 15 },
    { key: 'qs_assessed_amount', width: 18 },
    { key: 'assessment_status', width: 15 },
    { key: 'adjustment_reason', width: 30 },
    { key: 'variation_required', width: 15 },
    { key: 'vo_reference', width: 15 },
    { key: 'qs_notes', width: 30 },
    // SECTION E - CERTIFICATION (LOCKED)
    { key: 'supplier_rep_name', width: 20 },
    { key: 'supplier_declaration', width: 30 },
    { key: 'submission_date', width: 15 },
    { key: 'mc_rep_name', width: 20 },
    { key: 'certification_date', width: 15 },
    { key: 'certified_amount_this_period', width: 22 }
  ];

  // 5. Add title and header notice
  worksheet.mergeCells('A1:AJ1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = `BASE TRACKER - ${projectName}`;
  titleCell.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(1).height = 30;

  worksheet.mergeCells('A2:AJ2');
  const infoCell = worksheet.getCell('A2');
  infoCell.value = `Supplier: ${supplierName} | Trade: ${tradeKey.toUpperCase()} | Period: ${period} | Version: ${version}`;
  infoCell.font = { size: 12, bold: true };
  infoCell.alignment = { horizontal: 'center' };
  worksheet.getRow(2).height = 25;

  worksheet.mergeCells('A3:AJ3');
  const noticeCell = worksheet.getCell('A3');
  noticeCell.value = '⚠️ CONTRACTUAL NOTICE: This tracker forms part of the Contract. Variations must be raised separately via VO Tracker. Only columns M & N may be edited by supplier.';
  noticeCell.font = { size: 10, bold: true, color: { argb: 'FFB91C1C' } };
  noticeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF2F2' } };
  noticeCell.alignment = { horizontal: 'center', wrapText: true };
  worksheet.getRow(3).height = 35;

  worksheet.addRow([]); // Spacing

  // 6. Add column headers with section colors
  const headerRow = worksheet.getRow(5);
  const headers = [
    // SECTION A - Blue (CONTRACT BASELINE)
    'BOQ_Line_ID', 'Trade', 'System_Description', 'Location_Zone', 'Spec_or_Drawing_Ref',
    'Unit', 'Contract_Qty', 'Contract_Rate', 'Contract_Amount', 'Allowance_Type',
    'Scope_Assumptions', 'Scope_Exclusions',
    // SECTION B - Green (SUPPLIER INPUT)
    'Qty_Claimed_Previous', 'Qty_Claimed_This_Period',
    // SECTION C - Yellow (AUTO CALCULATED)
    'Qty_Claimed_Total', 'Percent_Complete', 'Amount_Claimed_To_Date', 'This_Period_Amount',
    'Qty_Remaining', 'Amount_Remaining', 'Over_Claim_Flag', 'Under_Claim_Flag', 'Completion_Risk',
    // SECTION D - Orange (QS ASSESSMENT)
    'QS_Assessed_Qty', 'QS_Assessed_Amount', 'Assessment_Status', 'Adjustment_Reason',
    'Variation_Required', 'VO_Reference', 'QS_Notes',
    // SECTION E - Red (CERTIFICATION)
    'Supplier_Rep_Name', 'Supplier_Declaration', 'Submission_Date', 'MC_Rep_Name',
    'Certification_Date', 'Certified_Amount_This_Period'
  ];

  // Section colors
  const sectionColors = {
    A: 'FFD1E7FF', // Blue - Locked
    B: 'FFD1FAE5', // Green - Editable
    C: 'FFFEF3C7', // Yellow - Calculated
    D: 'FFFED7AA', // Orange - QS
    E: 'FFFECACA'  // Red - Certification
  };

  headers.forEach((header, idx) => {
    const colNum = idx + 1;
    const cell = headerRow.getCell(colNum);
    cell.value = header;
    cell.font = { size: 11, bold: true, color: { argb: 'FF1F2937' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

    // Apply section colors
    let bgColor = sectionColors.A; // Default
    if (colNum >= 1 && colNum <= 12) bgColor = sectionColors.A;      // A-L: Contract
    else if (colNum >= 13 && colNum <= 14) bgColor = sectionColors.B; // M-N: Input
    else if (colNum >= 15 && colNum <= 23) bgColor = sectionColors.C; // O-W: Calculated
    else if (colNum >= 24 && colNum <= 30) bgColor = sectionColors.D; // X-AD: QS
    else if (colNum >= 31 && colNum <= 36) bgColor = sectionColors.E; // AE-AJ: Cert

    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF374151' } },
      bottom: { style: 'medium', color: { argb: 'FF374151' } },
      left: { style: 'thin', color: { argb: 'FF9CA3AF' } },
      right: { style: 'thin', color: { argb: 'FF9CA3AF' } }
    };
  });
  worksheet.getRow(5).height = 40;

  // 7. Add baseline data rows (from commercial_baseline_items)
  let currentRow = 6;
  baselineItems.forEach((item: any) => {
    const row = worksheet.getRow(currentRow);

    const contractQty = item.quantity || 0;
    const contractRate = item.unit_rate || 0;
    const contractAmount = item.line_amount || 0;
    const previousQty = previousClaimedMap.get(item.line_number) || 0;

    // SECTION A - Contract Baseline (LOCKED)
    row.getCell(1).value = item.line_number;
    row.getCell(2).value = item.line_type.toUpperCase();
    row.getCell(3).value = item.description || '';
    row.getCell(4).value = item.location_zone || '';
    row.getCell(5).value = item.system_category || '';
    row.getCell(6).value = item.unit || 'ea';
    row.getCell(7).value = contractQty;
    row.getCell(8).value = contractRate;
    row.getCell(9).value = contractAmount;
    row.getCell(10).value = item.line_type || '';
    row.getCell(11).value = item.scope_category || '';
    row.getCell(12).value = item.notes || '';

    // SECTION B - Supplier Input (UNLOCKED)
    row.getCell(13).value = previousQty; // Qty_Claimed_Previous
    row.getCell(14).value = 0; // Qty_Claimed_This_Period - Supplier fills

    // SECTION C - Auto Calculated (LOCKED - Formulas)
    const rowNum = currentRow;
    row.getCell(15).value = { formula: `=M${rowNum}+N${rowNum}` }; // Qty_Claimed_Total
    row.getCell(16).value = { formula: `=IF(G${rowNum}>0,O${rowNum}/G${rowNum},0)` }; // Percent_Complete
    row.getCell(17).value = { formula: `=O${rowNum}*H${rowNum}` }; // Amount_Claimed_To_Date
    row.getCell(18).value = { formula: `=N${rowNum}*H${rowNum}` }; // This_Period_Amount
    row.getCell(19).value = { formula: `=G${rowNum}-O${rowNum}` }; // Qty_Remaining
    row.getCell(20).value = { formula: `=S${rowNum}*H${rowNum}` }; // Amount_Remaining
    row.getCell(21).value = { formula: `=IF(O${rowNum}>G${rowNum},"YES","NO")` }; // Over_Claim_Flag
    row.getCell(22).value = { formula: `=IF(AND(P${rowNum}<0.5,G${rowNum}>0),"RISK","OK")` }; // Under_Claim_Flag
    row.getCell(23).value = { formula: `=IF(S${rowNum}<0,"COMPLETE",IF(P${rowNum}>0.8,"NEARLY DONE","ON TRACK"))` }; // Completion_Risk

    // SECTION D - QS Assessment (LOCKED - QS fills later)
    row.getCell(24).value = ''; // QS_Assessed_Qty
    row.getCell(25).value = ''; // QS_Assessed_Amount
    row.getCell(26).value = 'Pending'; // Assessment_Status
    row.getCell(27).value = ''; // Adjustment_Reason
    row.getCell(28).value = ''; // Variation_Required
    row.getCell(29).value = ''; // VO_Reference
    row.getCell(30).value = ''; // QS_Notes

    // SECTION E - Certification (LOCKED)
    row.getCell(31).value = ''; // Supplier_Rep_Name
    row.getCell(32).value = ''; // Supplier_Declaration
    row.getCell(33).value = ''; // Submission_Date
    row.getCell(34).value = ''; // MC_Rep_Name
    row.getCell(35).value = ''; // Certification_Date
    row.getCell(36).value = ''; // Certified_Amount_This_Period

    // Apply formatting
    row.getCell(7).numFmt = '#,##0.00';
    row.getCell(8).numFmt = '$#,##0.00';
    row.getCell(9).numFmt = '$#,##0.00';
    row.getCell(13).numFmt = '#,##0.00';
    row.getCell(14).numFmt = '#,##0.00';
    row.getCell(15).numFmt = '#,##0.00';
    row.getCell(16).numFmt = '0.0%';
    row.getCell(17).numFmt = '$#,##0.00';
    row.getCell(18).numFmt = '$#,##0.00';
    row.getCell(19).numFmt = '#,##0.00';
    row.getCell(20).numFmt = '$#,##0.00';
    row.getCell(24).numFmt = '#,##0.00';
    row.getCell(25).numFmt = '$#,##0.00';
    row.getCell(36).numFmt = '$#,##0.00';

    // Apply borders
    for (let col = 1; col <= 36; col++) {
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

  // 8. Apply protection - Lock all except columns M & N
  await worksheet.protect('verifytrade-commercial-2026', {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: false,
    formatColumns: false,
    formatRows: false,
    insertRows: false,
    insertColumns: false,
    insertHyperlinks: false,
    deleteRows: false,
    deleteColumns: false,
    sort: false,
    autoFilter: false,
    pivotTables: false
  });

  // Unlock only columns M and N (Qty_Claimed_Previous and Qty_Claimed_This_Period)
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber > 5) { // Skip headers
      row.getCell(13).protection = { locked: false }; // M
      row.getCell(14).protection = { locked: false }; // N
    }
  });

  // 9. Add conditional formatting for Over_Claim_Flag
  worksheet.addConditionalFormatting({
    ref: `U6:U${currentRow - 1}`,
    rules: [
      {
        type: 'containsText',
        operator: 'containsText',
        text: 'YES',
        style: {
          fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFDC2626' } },
          font: { bold: true, color: { argb: 'FFFFFFFF' } }
        }
      }
    ]
  });

  // 10. Freeze panes
  worksheet.views = [{ state: 'frozen', xSplit: 3, ySplit: 5 }];

  // 11. Add footer
  currentRow += 2;
  worksheet.mergeCells(`A${currentRow}:AJ${currentRow}`);
  const footerCell = worksheet.getCell(`A${currentRow}`);
  footerCell.value = `Generated by VerifyTrade Commercial Control | ${new Date().toLocaleDateString('en-NZ')} | This is a controlled document`;
  footerCell.font = { size: 9, italic: true, color: { argb: 'FF6B7280' } };
  footerCell.alignment = { horizontal: 'center' };

  // 12. Save export record to database
  const { data: exportRecord, error: exportError } = await supabase
    .from('base_tracker_exports')
    .insert({
      project_id: projectId,
      trade_key: tradeKey,
      supplier_id: supplierId,
      period,
      version,
      generated_by_user_id: (await supabase.auth.getUser()).data.user?.id,
      baseline_snapshot: JSON.stringify(awardedBOQ),
      notes: `Generated base tracker for ${supplierName} - ${period}`
    })
    .select()
    .single();

  if (exportError) {
    console.error('[Base Tracker] Error saving export record:', exportError);
  }

  // 13. Log to audit trail
  if (exportRecord) {
    await supabase.rpc('log_commercial_action', {
      p_project_id: projectId,
      p_action_type: 'tracker_generated',
      p_entity_type: 'base_tracker',
      p_entity_id: exportRecord.id,
      p_details: {
        supplier_name: supplierName,
        trade: tradeKey,
        period,
        version,
        line_count: awardedBOQ.length
      }
    });
  }

  // 14. Generate file
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/**
 * Helper function to get previous period (YYYY-MM)
 */
function getPreviousPeriod(period: string): string {
  const [year, month] = period.split('-').map(Number);
  const date = new Date(year, month - 1, 1);
  date.setMonth(date.getMonth() - 1);
  const prevYear = date.getFullYear();
  const prevMonth = String(date.getMonth() + 1).padStart(2, '0');
  return `${prevYear}-${prevMonth}`;
}

/**
 * Download Base Tracker file
 */
export async function downloadBaseTracker(options: BaseTrackerExportOptions): Promise<void> {
  const blob = await exportBaseTracker(options);
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;

  const filename = `BASE_TRACKER_${options.projectName.replace(/[^a-zA-Z0-9]/g, '_')}_${options.supplierName.replace(/[^a-zA-Z0-9]/g, '_')}_${options.period}_v${options.version || 1}.xlsx`;
  link.download = filename;
  link.click();

  window.URL.revokeObjectURL(url);
  console.log('[Base Tracker] Export completed:', filename);
}
