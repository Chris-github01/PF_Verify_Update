/**
 * BASE TRACKER - SUPPLIER EXPORT
 *
 * External-facing export for sharing with subcontractors.
 * Shows contract details, progress, and payment information.
 * Excludes internal commercial data, risk flags, and sensitive information.
 */

import ExcelJS from 'exceljs';
import { supabase } from '../supabase';

interface SupplierExportOptions {
  projectId: string;
  projectName: string;
  awardApprovalId: string;
  format?: 'excel' | 'pdf' | 'csv';
}

export async function exportBaseTrackerForSupplier(options: SupplierExportOptions): Promise<Blob> {
  const { projectId, projectName, awardApprovalId, format = 'excel' } = options;

  // 1. Get award details
  const { data: award } = await supabase
    .from('award_approvals')
    .select('final_approved_supplier, final_approved_quote_id, approved_at')
    .eq('id', awardApprovalId)
    .single();

  if (!award) throw new Error('Award not found');

  // 2. Get project details
  const { data: project } = await supabase
    .from('projects')
    .select('name, organisation_id, trade')
    .eq('id', projectId)
    .single();

  // 3. Get organisation details for branding
  const { data: org } = await supabase
    .from('organisations')
    .select('name, logo_url')
    .eq('id', project?.organisation_id)
    .single();

  // 4. Get baseline items (ONLY awarded_item type - base contract)
  const { data: baselineItems } = await supabase
    .from('commercial_baseline_items')
    .select('*')
    .eq('award_approval_id', awardApprovalId)
    .eq('is_active', true)
    .eq('line_type', 'awarded_item')
    .order('line_number');

  if (!baselineItems || baselineItems.length === 0) {
    throw new Error('No baseline items found');
  }

  // 5. Get claims data if exists
  const { data: claims } = await supabase
    .from('base_tracker_claims')
    .select('*')
    .eq('project_id', projectId)
    .eq('award_approval_id', awardApprovalId)
    .order('period', { ascending: false });

  // Build claims map
  const claimsMap = new Map();
  if (claims) {
    claims.forEach(claim => {
      if (claim.line_items && Array.isArray(claim.line_items)) {
        (claim.line_items as any[]).forEach(item => {
          claimsMap.set(item.line_number, {
            certifiedQty: item.certified_qty || 0,
            certifiedValue: item.certified_amount || 0,
            lastCertified: claim.certification_date
          });
        });
      }
    });
  }

  // 6. Create workbook
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'VerifyTrade';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Contract Statement');

  // 7. Header Section
  worksheet.mergeCells('A1:K1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = org?.name || 'Contract Statement';
  titleCell.font = { size: 18, bold: true, color: { argb: 'FF1E40AF' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(1).height = 35;

  worksheet.mergeCells('A2:K2');
  const projectCell = worksheet.getCell('A2');
  projectCell.value = `Project: ${projectName}`;
  projectCell.font = { size: 14, bold: true };
  projectCell.alignment = { horizontal: 'center' };
  worksheet.getRow(2).height = 25;

  worksheet.mergeCells('A3:K3');
  const supplierCell = worksheet.getCell('A3');
  supplierCell.value = `Supplier: ${award.final_approved_supplier}`;
  supplierCell.font = { size: 12 };
  supplierCell.alignment = { horizontal: 'center' };

  worksheet.mergeCells('A4:K4');
  const dateCell = worksheet.getCell('A4');
  dateCell.value = `Statement Date: ${new Date().toLocaleDateString('en-NZ', {
    year: 'numeric', month: 'long', day: 'numeric'
  })}`;
  dateCell.font = { size: 10 };
  dateCell.alignment = { horizontal: 'center' };

  worksheet.addRow([]); // Spacing

  // 8. Column setup - SUPPLIER VERSION (simplified)
  worksheet.columns = [
    { key: 'line_no', header: 'Line No.', width: 12 },
    { key: 'description', header: 'Description', width: 45 },
    { key: 'system', header: 'System', width: 20 },
    { key: 'location', header: 'Location', width: 15 },
    { key: 'unit', header: 'Unit', width: 10 },
    { key: 'orig_qty', header: 'Contract Qty', width: 14 },
    { key: 'unit_rate', header: 'Rate', width: 13 },
    { key: 'contract_value', header: 'Contract Value', width: 16 },
    { key: 'cert_qty', header: 'Certified Qty', width: 14 },
    { key: 'cert_value', header: 'Certified Value', width: 16 },
    { key: 'remaining', header: 'Remaining', width: 16 }
  ];

  // 9. Format header row
  const headerRow = worksheet.getRow(6);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF2563EB' }
  };
  headerRow.height = 30;
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

  // 10. Add data rows
  let totalContractValue = 0;
  let totalCertifiedValue = 0;

  baselineItems.forEach((item: any) => {
    const claimData = claimsMap.get(item.line_number) || {};
    const contractQty = item.quantity || 0;
    const unitRate = item.unit_rate || 0;
    const contractValue = item.line_amount || 0;
    const certifiedQty = claimData.certifiedQty || 0;
    const certifiedValue = claimData.certifiedValue || 0;
    const remainingValue = contractValue - certifiedValue;

    totalContractValue += contractValue;
    totalCertifiedValue += certifiedValue;

    worksheet.addRow({
      line_no: item.line_number,
      description: item.description,
      system: item.system_category,
      location: item.location_zone,
      unit: item.unit,
      orig_qty: contractQty,
      unit_rate: unitRate,
      contract_value: contractValue,
      cert_qty: certifiedQty,
      cert_value: certifiedValue,
      remaining: remainingValue
    });
  });

  // 11. Format all data rows
  const startRow = 7;
  const endRow = startRow + baselineItems.length - 1;

  for (let rowNum = startRow; rowNum <= endRow; rowNum++) {
    const row = worksheet.getRow(rowNum);
    row.getCell(6).numFmt = '#,##0.00'; // Qty
    row.getCell(7).numFmt = '$#,##0.00'; // Rate
    row.getCell(8).numFmt = '$#,##0.00'; // Contract Value
    row.getCell(9).numFmt = '#,##0.00'; // Cert Qty
    row.getCell(10).numFmt = '$#,##0.00'; // Cert Value
    row.getCell(11).numFmt = '$#,##0.00'; // Remaining

    // Alternate row colors
    if ((rowNum - startRow) % 2 === 0) {
      for (let col = 1; col <= 11; col++) {
        row.getCell(col).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF9FAFB' }
        };
      }
    }

    // Borders
    for (let col = 1; col <= 11; col++) {
      row.getCell(col).border = {
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
      };
    }
  }

  // 12. Totals row
  const totalsRow = worksheet.addRow({
    line_no: '',
    description: '',
    system: '',
    location: '',
    unit: '',
    orig_qty: '',
    unit_rate: '',
    contract_value: totalContractValue,
    cert_qty: '',
    cert_value: totalCertifiedValue,
    remaining: totalContractValue - totalCertifiedValue
  });

  worksheet.mergeCells(totalsRow.number, 1, totalsRow.number, 7);
  totalsRow.getCell(1).value = 'TOTALS';
  totalsRow.font = { bold: true, size: 12 };
  totalsRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFDBEAFE' }
  };
  totalsRow.getCell(8).numFmt = '$#,##0.00';
  totalsRow.getCell(10).numFmt = '$#,##0.00';
  totalsRow.getCell(11).numFmt = '$#,##0.00';
  totalsRow.height = 30;

  // 13. Summary section
  worksheet.addRow([]);
  worksheet.addRow([]);

  const summaryStartRow = totalsRow.number + 3;
  worksheet.mergeCells(summaryStartRow, 1, summaryStartRow, 4);
  worksheet.getCell(summaryStartRow, 1).value = 'PAYMENT SUMMARY';
  worksheet.getCell(summaryStartRow, 1).font = { bold: true, size: 12 };

  const retentionRate = 0.05; // 5%
  const retentionAmount = totalCertifiedValue * retentionRate;
  const netPayment = totalCertifiedValue - retentionAmount;

  const summaryData = [
    ['Original Contract Value:', totalContractValue],
    ['Certified to Date:', totalCertifiedValue],
    ['Retention (5%):', -retentionAmount],
    ['Net Payment:', netPayment],
    ['Remaining Contract Value:', totalContractValue - totalCertifiedValue],
    ['% Complete:', totalContractValue > 0 ? (totalCertifiedValue / totalContractValue) : 0]
  ];

  summaryData.forEach((data, idx) => {
    const rowNum = summaryStartRow + idx + 1;
    worksheet.getCell(rowNum, 2).value = data[0];
    worksheet.getCell(rowNum, 2).font = { bold: true };
    worksheet.getCell(rowNum, 4).value = data[1];

    if (idx === summaryData.length - 1) {
      worksheet.getCell(rowNum, 4).numFmt = '0.0%';
    } else {
      worksheet.getCell(rowNum, 4).numFmt = '$#,##0.00';
    }

    if (idx === 3) { // Net Payment
      worksheet.getCell(rowNum, 2).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFDBEAFE' }
      };
      worksheet.getCell(rowNum, 4).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFDBEAFE' }
      };
      worksheet.getCell(rowNum, 4).font = { bold: true };
    }
  });

  // 14. Footer
  const footerRow = summaryStartRow + summaryData.length + 3;
  worksheet.mergeCells(footerRow, 1, footerRow, 11);
  const footer = worksheet.getCell(footerRow, 1);
  footer.value = 'This statement is for information purposes. All values subject to final certification and contract terms.';
  footer.font = { size: 9, italic: true, color: { argb: 'FF6B7280' } };
  footer.alignment = { horizontal: 'center' };

  // 15. Freeze panes
  worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 6 }];

  // 16. Generate file
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
}

/**
 * Download supplier export
 */
export async function downloadSupplierExport(options: SupplierExportOptions): Promise<void> {
  const blob = await exportBaseTrackerForSupplier(options);
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;

  const filename = `Contract_Statement_${options.projectName.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
  link.download = filename;
  link.click();

  window.URL.revokeObjectURL(url);
  console.log('[Supplier Export] Downloaded:', filename);
}
