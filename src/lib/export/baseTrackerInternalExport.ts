/**
 * BASE TRACKER - INTERNAL EXPORT
 *
 * Comprehensive commercial control export for internal teams.
 * Includes ALL data: claims vs certified, risk flags, variance analysis,
 * internal notes, payment reconciliation, and executive summary.
 *
 * MARKED: COMMERCIAL IN CONFIDENCE
 */

import ExcelJS from 'exceljs';
import { supabase } from '../supabase';

interface InternalExportOptions {
  projectId: string;
  projectName: string;
  awardApprovalId: string;
  includeDashboard?: boolean;
  includeRiskRegister?: boolean;
  includePaymentReconciliation?: boolean;
}

export async function exportBaseTrackerInternal(options: InternalExportOptions): Promise<Blob> {
  const {
    projectId,
    projectName,
    awardApprovalId,
    includeDashboard = true,
    includeRiskRegister = true,
    includePaymentReconciliation = true
  } = options;

  // 1. Get award details
  const { data: award } = await supabase
    .from('award_approvals')
    .select('final_approved_supplier, final_approved_quote_id, approved_at, metadata_json')
    .eq('id', awardApprovalId)
    .single();

  if (!award) throw new Error('Award not found');

  // 2. Get project details
  const { data: project } = await supabase
    .from('projects')
    .select('name, organisation_id, trade')
    .eq('id', projectId)
    .single();

  // 3. Get organisation
  const { data: org } = await supabase
    .from('organisations')
    .select('name')
    .eq('id', project?.organisation_id)
    .single();

  // 4. Get ALL baseline items (including allowances)
  const { data: allBaselineItems } = await supabase
    .from('commercial_baseline_items')
    .select('*')
    .eq('award_approval_id', awardApprovalId)
    .eq('is_active', true)
    .order('line_number');

  if (!allBaselineItems || allBaselineItems.length === 0) {
    throw new Error('No baseline items found');
  }

  // Separate awarded items from allowances/retention
  const awardedItems = allBaselineItems.filter((item: any) => item.line_type === 'awarded_item');
  const allowanceItems = allBaselineItems.filter((item: any) =>
    ['allowance', 'retention', 'provisional_sum'].includes(item.line_type)
  );

  // 5. Get claims data
  const { data: claims } = await supabase
    .from('base_tracker_claims')
    .select('*')
    .eq('project_id', projectId)
    .eq('award_approval_id', awardApprovalId)
    .order('period', { ascending: false });

  // Build claims map with claimed vs certified
  const claimsMap = new Map();
  if (claims) {
    claims.forEach(claim => {
      if (claim.line_items && Array.isArray(claim.line_items)) {
        (claim.line_items as any[]).forEach(item => {
          claimsMap.set(item.line_number, {
            claimedQty: item.claimed_qty || 0,
            claimedValue: item.claimed_amount || 0,
            certifiedQty: item.certified_qty || 0,
            certifiedValue: item.certified_amount || 0,
            variance: (item.claimed_amount || 0) - (item.certified_amount || 0),
            lastClaim: claim.submission_date,
            lastCertified: claim.certification_date,
            status: claim.status
          });
        });
      }
    });
  }

  // 6. Get variations
  const { data: variations } = await supabase
    .from('variation_register')
    .select('*')
    .eq('project_id', projectId);

  // 7. Create workbook with multiple sheets
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'VerifyTrade';
  workbook.created = new Date();

  // SHEET 1: Executive Dashboard
  if (includeDashboard) {
    await createExecutiveDashboard(workbook, {
      projectName,
      supplierName: award.final_approved_supplier,
      awardedItems,
      allowanceItems,
      claimsMap,
      variations: variations || []
    });
  }

  // SHEET 2: Full Base Tracker
  await createFullBaseTracker(workbook, {
    projectName,
    supplierName: award.final_approved_supplier,
    baselineItems: awardedItems,
    claimsMap,
    orgName: org?.name || 'Organisation'
  });

  // SHEET 3: Risk Register
  if (includeRiskRegister) {
    await createRiskRegister(workbook, {
      baselineItems: awardedItems,
      claimsMap
    });
  }

  // SHEET 4: Payment Reconciliation
  if (includePaymentReconciliation) {
    await createPaymentReconciliation(workbook, {
      projectName,
      supplierName: award.final_approved_supplier,
      claims: claims || []
    });
  }

  // SHEET 5: Allowances & Adjustments
  await createAllowancesSheet(workbook, {
    allowanceItems,
    awardedItems
  });

  // 8. Generate file
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
}

// Helper function: Create Executive Dashboard Sheet
async function createExecutiveDashboard(workbook: ExcelJS.Workbook, data: any) {
  const sheet = workbook.addWorksheet('Executive Dashboard');

  // Calculate totals
  const baseContractValue = data.awardedItems.reduce((sum: number, item: any) =>
    sum + (item.line_amount || 0), 0);

  const allowancesTotal = data.allowanceItems.reduce((sum: number, item: any) =>
    sum + (item.line_amount || 0), 0);

  let totalClaimed = 0;
  let totalCertified = 0;
  let totalVariance = 0;

  data.awardedItems.forEach((item: any) => {
    const claim = data.claimsMap.get(item.line_number) || {};
    totalClaimed += claim.claimedValue || 0;
    totalCertified += claim.certifiedValue || 0;
    totalVariance += claim.variance || 0;
  });

  const approvedVOs = data.variations
    .filter((v: any) => v.status === 'Approved')
    .reduce((sum: number, v: any) => sum + (v.amount || 0), 0);

  const pendingVOs = data.variations
    .filter((v: any) => v.status === 'Submitted')
    .reduce((sum: number, v: any) => sum + (v.amount || 0), 0);

  // Title
  sheet.mergeCells('A1:F1');
  const title = sheet.getCell('A1');
  title.value = 'COMMERCIAL IN CONFIDENCE';
  title.font = { size: 18, bold: true, color: { argb: 'FFDC2626' } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF2F2' } };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 40;

  sheet.mergeCells('A2:F2');
  const subtitle = sheet.getCell('A2');
  subtitle.value = `Commercial Dashboard: ${data.projectName} - ${data.supplierName}`;
  subtitle.font = { size: 14, bold: true };
  subtitle.alignment = { horizontal: 'center' };
  sheet.getRow(2).height = 30;

  sheet.addRow([]);

  // Key Metrics
  const metrics = [
    ['METRIC', 'VALUE', '', '', '', ''],
    ['Base Contract Value', baseContractValue, '', '', '', ''],
    ['Allowances & Adjustments', allowancesTotal, '', '', '', ''],
    ['Total Contract Value', baseContractValue + allowancesTotal, '', '', '', ''],
    ['', '', '', '', '', ''],
    ['Claimed to Date', totalClaimed, '', '', '', ''],
    ['Certified to Date', totalCertified, '', '', '', ''],
    ['Variance (Claimed - Certified)', totalVariance, '', '', '', ''],
    ['', '', '', '', '', ''],
    ['Retention Held (5%)', totalCertified * 0.05, '', '', '', ''],
    ['Net Payment Due', totalCertified * 0.95, '', '', '', ''],
    ['', '', '', '', '', ''],
    ['Variations Approved', approvedVOs, '', '', '', ''],
    ['Variations Pending', pendingVOs, '', '', '', ''],
    ['Net Forecast Final Cost', baseContractValue + allowancesTotal + approvedVOs + (pendingVOs * 0.7), '', '', '', ''],
    ['', '', '', '', '', ''],
    ['Remaining Exposure', baseContractValue + allowancesTotal - totalCertified, '', '', '', ''],
    ['% Complete', totalCertified / (baseContractValue + allowancesTotal), '', '', '', '']
  ];

  metrics.forEach((row, idx) => {
    const rowNum = 4 + idx;
    sheet.getRow(rowNum).values = row;

    if (idx === 0) {
      // Header row
      sheet.getRow(rowNum).font = { bold: true, size: 12 };
      sheet.getRow(rowNum).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2563EB' }
      };
      sheet.getRow(rowNum).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    } else if (row[0] !== '') {
      // Data rows
      sheet.getCell(rowNum, 1).font = { bold: true };

      if (row[1] !== '') {
        const valueCell = sheet.getCell(rowNum, 2);
        if (idx === metrics.length - 1) {
          valueCell.numFmt = '0.0%';
        } else {
          valueCell.numFmt = '$#,##0.00';
        }

        // Highlight important rows
        if (['Total Contract Value', 'Net Payment Due', 'Net Forecast Final Cost'].includes(row[0])) {
          sheet.getCell(rowNum, 1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFDBEAFE' }
          };
          valueCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFDBEAFE' }
          };
          valueCell.font = { bold: true };
        }

        // Highlight variances
        if (row[0] === 'Variance (Claimed - Certified)' && row[1] > 0) {
          valueCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFEF2F2' }
          };
          valueCell.font = { color: { argb: 'FFDC2626' } };
        }
      }
    }
  });

  sheet.columns = [
    { width: 35 },
    { width: 20 },
    { width: 15 },
    { width: 15 },
    { width: 15 },
    { width: 15 }
  ];

  // Footer
  const footerRow = 4 + metrics.length + 2;
  sheet.mergeCells(footerRow, 1, footerRow, 6);
  const footer = sheet.getCell(footerRow, 1);
  footer.value = `Generated: ${new Date().toLocaleString('en-NZ')} | Internal Use Only`;
  footer.font = { size: 9, italic: true, color: { argb: 'FF6B7280' } };
  footer.alignment = { horizontal: 'center' };
}

// Helper function: Create Full Base Tracker Sheet
async function createFullBaseTracker(workbook: ExcelJS.Workbook, data: any) {
  const sheet = workbook.addWorksheet('Base Tracker (Full)');

  // Header
  sheet.mergeCells('A1:N1');
  const title = sheet.getCell('A1');
  title.value = 'BASE TRACKER - FULL COMMERCIAL VIEW';
  title.font = { size: 14, bold: true };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
  title.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  title.alignment = { horizontal: 'center' };
  sheet.getRow(1).height = 30;

  // Columns
  sheet.columns = [
    { key: 'line_no', header: 'Line No.', width: 12 },
    { key: 'description', header: 'Description', width: 40 },
    { key: 'system', header: 'System', width: 18 },
    { key: 'location', header: 'Location', width: 15 },
    { key: 'unit', header: 'Unit', width: 10 },
    { key: 'qty', header: 'Contract Qty', width: 13 },
    { key: 'rate', header: 'Rate', width: 12 },
    { key: 'value', header: 'Contract Value', width: 15 },
    { key: 'claimed_qty', header: 'Claimed Qty', width: 13 },
    { key: 'claimed_val', header: 'Claimed Value', width: 15 },
    { key: 'cert_qty', header: 'Certified Qty', width: 13 },
    { key: 'cert_val', header: 'Certified Value', width: 15 },
    { key: 'variance', header: 'Variance', width: 14 },
    { key: 'flag', header: 'Risk Flag', width: 12 }
  ];

  // Header row
  const headerRow = sheet.getRow(2);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF2563EB' }
  };
  headerRow.height = 25;
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

  // Data rows
  data.baselineItems.forEach((item: any) => {
    const claim = data.claimsMap.get(item.line_number) || {};
    const variance = (claim.claimedValue || 0) - (claim.certifiedValue || 0);

    let flag = '';
    if (claim.claimedQty > item.quantity) {
      flag = 'OVER-CLAIM';
    } else if (variance > 1000) {
      flag = 'HIGH VARIANCE';
    } else if (variance < 0) {
      flag = 'UNDER-CERTIFIED';
    }

    sheet.addRow({
      line_no: item.line_number,
      description: item.description,
      system: item.system_category,
      location: item.location_zone,
      unit: item.unit,
      qty: item.quantity,
      rate: item.unit_rate,
      value: item.line_amount,
      claimed_qty: claim.claimedQty || 0,
      claimed_val: claim.claimedValue || 0,
      cert_qty: claim.certifiedQty || 0,
      cert_val: claim.certifiedValue || 0,
      variance: variance,
      flag: flag
    });
  });

  // Format numbers
  const startRow = 3;
  const endRow = startRow + data.baselineItems.length - 1;

  for (let rowNum = startRow; rowNum <= endRow; rowNum++) {
    const row = sheet.getRow(rowNum);
    row.getCell(6).numFmt = '#,##0.00';
    row.getCell(7).numFmt = '$#,##0.00';
    row.getCell(8).numFmt = '$#,##0.00';
    row.getCell(9).numFmt = '#,##0.00';
    row.getCell(10).numFmt = '$#,##0.00';
    row.getCell(11).numFmt = '#,##0.00';
    row.getCell(12).numFmt = '$#,##0.00';
    row.getCell(13).numFmt = '$#,##0.00';

    // Highlight risk flags
    const flagCell = row.getCell(14);
    if (flagCell.value && flagCell.value !== '') {
      flagCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFEF2F2' }
      };
      flagCell.font = { bold: true, color: { argb: 'FFDC2626' } };
    }
  }

  sheet.views = [{ state: 'frozen', xSplit: 2, ySplit: 2 }];
}

// Helper function: Create Risk Register
async function createRiskRegister(workbook: ExcelJS.Workbook, data: any) {
  const sheet = workbook.addWorksheet('Risk Register');

  // Title
  sheet.mergeCells('A1:G1');
  const title = sheet.getCell('A1');
  title.value = 'COMMERCIAL RISK REGISTER';
  title.font = { size: 14, bold: true };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
  title.font = { color: { argb: 'FFFFFFFF' } };
  title.alignment = { horizontal: 'center' };
  sheet.getRow(1).height = 30;

  // Columns
  sheet.columns = [
    { key: 'line_no', header: 'Line No.', width: 12 },
    { key: 'description', header: 'Description', width: 40 },
    { key: 'risk_type', header: 'Risk Type', width: 18 },
    { key: 'value', header: 'Contract Value', width: 15 },
    { key: 'variance', header: 'Variance', width: 15 },
    { key: 'severity', header: 'Severity', width: 12 },
    { key: 'action', header: 'Recommended Action', width: 30 }
  ];

  // Header
  const headerRow = sheet.getRow(2);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFDC2626' }
  };
  headerRow.height = 25;

  // Identify risks
  const risks: any[] = [];

  data.baselineItems.forEach((item: any) => {
    const claim = data.claimsMap.get(item.line_number) || {};
    const variance = (claim.claimedValue || 0) - (claim.certifiedValue || 0);

    if (claim.claimedQty > item.quantity) {
      risks.push({
        line_no: item.line_number,
        description: item.description,
        risk_type: 'OVER-CLAIM',
        value: item.line_amount,
        variance: variance,
        severity: 'HIGH',
        action: 'Investigation required - Potential variation or measurement error'
      });
    } else if (variance > item.line_amount * 0.05) {
      risks.push({
        line_no: item.line_number,
        description: item.description,
        risk_type: 'HIGH VARIANCE',
        value: item.line_amount,
        variance: variance,
        severity: 'MEDIUM',
        action: 'Review certification reasons and justification'
      });
    }
  });

  // Add risk rows
  risks.forEach(risk => {
    sheet.addRow(risk);
  });

  // Format
  const startRow = 3;
  const endRow = startRow + risks.length - 1;

  for (let rowNum = startRow; rowNum <= endRow; rowNum++) {
    const row = sheet.getRow(rowNum);
    row.getCell(4).numFmt = '$#,##0.00';
    row.getCell(5).numFmt = '$#,##0.00';

    const severityCell = row.getCell(6);
    if (severityCell.value === 'HIGH') {
      severityCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFDC2626' }
      };
      severityCell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    } else if (severityCell.value === 'MEDIUM') {
      severityCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF59E0B' }
      };
      severityCell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    }
  }

  if (risks.length === 0) {
    sheet.addRow(['No high-priority risks identified']);
    sheet.mergeCells(3, 1, 3, 7);
    sheet.getCell(3, 1).alignment = { horizontal: 'center' };
    sheet.getCell(3, 1).font = { italic: true };
  }
}

// Helper function: Create Payment Reconciliation
async function createPaymentReconciliation(workbook: ExcelJS.Workbook, data: any) {
  const sheet = workbook.addWorksheet('Payment Reconciliation');

  // Title
  sheet.mergeCells('A1:H1');
  const title = sheet.getCell('A1');
  title.value = `PAYMENT RECONCILIATION - ${data.supplierName}`;
  title.font = { size: 14, bold: true };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
  title.font = { color: { argb: 'FFFFFFFF' } };
  title.alignment = { horizontal: 'center' };
  sheet.getRow(1).height = 30;

  // Columns
  sheet.columns = [
    { key: 'period', header: 'Period', width: 12 },
    { key: 'claimed', header: 'Claimed', width: 15 },
    { key: 'certified', header: 'Certified', width: 15 },
    { key: 'retention', header: 'Retention (5%)', width: 15 },
    { key: 'net_payment', header: 'Net Payment', width: 15 },
    { key: 'paid', header: 'Paid', width: 15 },
    { key: 'outstanding', header: 'Outstanding', width: 15 },
    { key: 'status', header: 'Status', width: 15 }
  ];

  // Header
  const headerRow = sheet.getRow(2);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF059669' }
  };
  headerRow.height = 25;

  // Add claim history
  data.claims.forEach((claim: any) => {
    const totalCertified = claim.certified_amount || 0;
    const retention = totalCertified * 0.05;
    const netPayment = totalCertified - retention;
    const paid = claim.payment_amount || 0;
    const outstanding = netPayment - paid;

    sheet.addRow({
      period: claim.period,
      claimed: claim.total_claimed_to_date,
      certified: totalCertified,
      retention: retention,
      net_payment: netPayment,
      paid: paid,
      outstanding: outstanding,
      status: claim.status
    });
  });

  // Format numbers
  const startRow = 3;
  const endRow = startRow + data.claims.length - 1;

  for (let rowNum = startRow; rowNum <= endRow; rowNum++) {
    const row = sheet.getRow(rowNum);
    for (let col = 2; col <= 7; col++) {
      row.getCell(col).numFmt = '$#,##0.00';
    }
  }
}

// Helper function: Create Allowances Sheet
async function createAllowancesSheet(workbook: ExcelJS.Workbook, data: any) {
  const sheet = workbook.addWorksheet('Allowances');

  // Title
  sheet.mergeCells('A1:E1');
  const title = sheet.getCell('A1');
  title.value = 'ALLOWANCES & COMMERCIAL ADJUSTMENTS';
  title.font = { size: 14, bold: true };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } };
  title.font = { color: { argb: 'FFFFFFFF' } };
  title.alignment = { horizontal: 'center' };
  sheet.getRow(1).height = 30;

  // Columns
  sheet.columns = [
    { key: 'line_no', header: 'Line No.', width: 15 },
    { key: 'type', header: 'Type', width: 20 },
    { key: 'description', header: 'Description', width: 40 },
    { key: 'calculation', header: 'Calculation', width: 25 },
    { key: 'amount', header: 'Amount', width: 18 }
  ];

  // Header
  const headerRow = sheet.getRow(2);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF7C3AED' }
  };
  headerRow.height = 25;

  // Calculate base for percentages
  const baseValue = data.awardedItems.reduce((sum: number, item: any) =>
    sum + (item.line_amount || 0), 0);

  // Add allowance rows
  data.allowanceItems.forEach((item: any) => {
    let calculation = '';
    if (item.line_type === 'allowance') {
      const percentage = ((item.line_amount / baseValue) * 100).toFixed(2);
      calculation = `${percentage}% of base`;
    } else if (item.line_type === 'retention') {
      calculation = `${item.quantity}% retention`;
    }

    sheet.addRow({
      line_no: item.line_number,
      type: item.line_type.toUpperCase(),
      description: item.description,
      calculation: calculation,
      amount: item.line_amount
    });
  });

  // Format
  const startRow = 3;
  const endRow = startRow + data.allowanceItems.length - 1;

  for (let rowNum = startRow; rowNum <= endRow; rowNum++) {
    const row = sheet.getRow(rowNum);
    row.getCell(5).numFmt = '$#,##0.00';
  }

  // Total
  const totalRow = sheet.addRow({
    line_no: '',
    type: '',
    description: '',
    calculation: 'TOTAL ALLOWANCES',
    amount: data.allowanceItems.reduce((sum: number, item: any) => sum + (item.line_amount || 0), 0)
  });

  totalRow.font = { bold: true };
  totalRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFDDD6FE' }
  };
  totalRow.getCell(5).numFmt = '$#,##0.00';
}

/**
 * Download internal export
 */
export async function downloadInternalExport(options: InternalExportOptions): Promise<void> {
  const blob = await exportBaseTrackerInternal(options);
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;

  const filename = `COMMERCIAL_INTERNAL_${options.projectName.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
  link.download = filename;
  link.click();

  window.URL.revokeObjectURL(url);
  console.log('[Internal Export] Downloaded:', filename);
}
