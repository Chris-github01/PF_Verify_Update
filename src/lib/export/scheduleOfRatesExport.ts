import ExcelJS from 'exceljs';
import { supabase } from '../supabase';

interface QuoteItem {
  id: string;
  description: string;
  service: string;
  mapped_service_type: string;
  material: string;
  unit: string;
  size: string;
  diameter: string;
  unit_price: number;
  scope_category: string;
}

interface Quote {
  id: string;
  supplier_name: string;
}

const SERVICE_TYPE_COLORS = {
  'Electrical': { bg: 'FFE7F3FF', header: 'FF1E88E5' }, // Blue
  'Plumbing': { bg: 'FFF3E5F5', header: 'FF9C27B0' },  // Purple
  'Fire': { bg: 'FFFFEBEE', header: 'FFF44336' },       // Red
  'Other': { bg: 'FFF1F8E9', header: 'FF8BC34A' },      // Green
  'HVAC': { bg: 'FFFFF3E0', header: 'FFFF9800' },       // Orange
  'Security': { bg: 'FFE3F2FD', header: 'FF2196F3' },   // Light Blue
  'Data': { bg: 'FFF3E5F5', header: 'FF673AB7' },       // Deep Purple
};

function categorizeServiceType(serviceType: string, category: string): string {
  const service = serviceType?.toLowerCase() || '';
  const cat = category?.toLowerCase() || '';

  if (service.includes('electric') || cat.includes('electric')) return 'Electrical';
  if (service.includes('plumb') || cat.includes('plumb') || service.includes('water') || service.includes('drain')) return 'Plumbing';
  if (service.includes('fire') || cat.includes('fire') || service.includes('sprinkler')) return 'Fire';
  if (service.includes('hvac') || service.includes('ventilation') || service.includes('air')) return 'HVAC';
  if (service.includes('security') || service.includes('alarm') || service.includes('cctv')) return 'Security';
  if (service.includes('data') || service.includes('network') || service.includes('comms')) return 'Data';

  return 'Other';
}

export async function exportScheduleOfRates(projectId: string, projectName: string): Promise<void> {
  try {
    console.log('[Schedule of Rates] Starting export for project:', projectId);

    // Fetch all quotes for the project
    const { data: quotes, error: quotesError } = await supabase
      .from('quotes')
      .select('id, supplier_name')
      .eq('project_id', projectId)
      .order('supplier_name');

    if (quotesError) {
      console.error('[Schedule of Rates] Error fetching quotes:', quotesError);
      throw quotesError;
    }

    if (!quotes || quotes.length === 0) {
      console.error('[Schedule of Rates] No quotes found');
      throw new Error('No quotes found for this project');
    }

    console.log(`[Schedule of Rates] Found ${quotes.length} quotes`);

    // Create workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'VerifyTrade';
    workbook.created = new Date();

    // Create a sheet for each supplier
    for (const quote of quotes) {
      console.log(`[Schedule of Rates] Creating sheet for supplier: ${quote.supplier_name}`);
      await createSupplierSheet(workbook, quote, projectName);
    }

    console.log('[Schedule of Rates] Generating Excel file...');

    // Generate file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `Schedule_of_Rates_${projectName.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}.xlsx`;
    link.download = filename;
    link.click();

    window.URL.revokeObjectURL(url);

    console.log('[Schedule of Rates] Export completed:', filename);
  } catch (error) {
    console.error('[Schedule of Rates] Export error:', error);
    throw error;
  }
}

async function createSupplierSheet(
  workbook: ExcelJS.Workbook,
  quote: Quote,
  projectName: string
): Promise<void> {
  // Fetch quote items - include size and frr columns
  const { data: items, error } = await supabase
    .from('quote_items')
    .select('id, description, service, material, unit, unit_price, size, frr')
    .eq('quote_id', quote.id)
    .order('description');

  if (error) {
    console.error('[Schedule of Rates] Error fetching quote items:', error);
    throw error;
  }

  if (!items || items.length === 0) {
    console.log(`[Schedule of Rates] No items found for quote ${quote.id}`);
    return;
  }

  console.log(`[Schedule of Rates] Fetched ${items.length} items for ${quote.supplier_name}`);
  console.log('[Schedule of Rates] Sample item data:', items[0]);

  // Create sheet
  const sheetName = quote.supplier_name.substring(0, 31).replace(/[\\\/\?\*\[\]]/g, '_');
  const worksheet = workbook.addWorksheet(sheetName);

  // Set column widths
  worksheet.columns = [
    { key: 'description', width: 50 },
    { key: 'material', width: 20 },
    { key: 'serviceType', width: 20 },
    { key: 'unit', width: 12 },
    { key: 'size', width: 15 },
    { key: 'rate', width: 15 },
  ];

  // Add title section
  worksheet.mergeCells('A1:F1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = 'SCHEDULE OF RATES';
  titleCell.font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FF1E3A8A' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E7FF' }
  };
  worksheet.getRow(1).height = 30;

  // Add project info
  worksheet.mergeCells('A2:F2');
  const projectCell = worksheet.getCell('A2');
  projectCell.value = `Project: ${projectName}`;
  projectCell.font = { name: 'Calibri', size: 12, bold: true };
  projectCell.alignment = { horizontal: 'center' };

  worksheet.mergeCells('A3:F3');
  const supplierCell = worksheet.getCell('A3');
  supplierCell.value = `Supplier: ${quote.supplier_name}`;
  supplierCell.font = { name: 'Calibri', size: 12, bold: true };
  supplierCell.alignment = { horizontal: 'center' };

  worksheet.mergeCells('A4:F4');
  const dateCell = worksheet.getCell('A4');
  dateCell.value = `Generated: ${new Date().toLocaleDateString('en-NZ', { year: 'numeric', month: 'long', day: 'numeric' })}`;
  dateCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF6B7280' } };
  dateCell.alignment = { horizontal: 'center' };

  // Add spacing
  worksheet.addRow([]);

  // Group items by service type
  const groupedItems: Record<string, QuoteItem[]> = {};

  items.forEach((item: any) => {
    const category = categorizeServiceType(item.service || '', '');
    if (!groupedItems[category]) {
      groupedItems[category] = [];
    }
    groupedItems[category].push(item);
  });

  let currentRow = 6;

  // Service types in order
  const serviceOrder = ['Electrical', 'Plumbing', 'Fire', 'HVAC', 'Security', 'Data', 'Other'];

  serviceOrder.forEach(serviceType => {
    if (!groupedItems[serviceType] || groupedItems[serviceType].length === 0) return;

    const serviceItems = groupedItems[serviceType];
    const colors = SERVICE_TYPE_COLORS[serviceType as keyof typeof SERVICE_TYPE_COLORS] || SERVICE_TYPE_COLORS['Other'];

    // Add service type header
    worksheet.mergeCells(`A${currentRow}:F${currentRow}`);
    const headerCell = worksheet.getCell(`A${currentRow}`);
    headerCell.value = serviceType.toUpperCase();
    headerCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    headerCell.alignment = { horizontal: 'left', vertical: 'middle' };
    headerCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: colors.header }
    };
    worksheet.getRow(currentRow).height = 25;
    currentRow++;

    // Add column headers
    const headerRow = worksheet.getRow(currentRow);
    const headers = ['Description', 'Material Type', 'Service Type', 'Unit', 'Diameter/Size', 'Rate per Unit'];
    headers.forEach((header, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = header;
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1F2937' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE5E7EB' }
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF9CA3AF' } },
        left: { style: 'thin', color: { argb: 'FF9CA3AF' } },
        bottom: { style: 'thin', color: { argb: 'FF9CA3AF' } },
        right: { style: 'thin', color: { argb: 'FF9CA3AF' } }
      };
    });
    headerRow.height = 35;
    currentRow++;

    // Add items
    serviceItems.forEach((item, idx) => {
      const row = worksheet.getRow(currentRow);
      const isEven = idx % 2 === 0;

      // Description
      const descCell = row.getCell(1);
      descCell.value = item.description || 'N/A';
      descCell.font = { name: 'Calibri', size: 10 };
      descCell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
      descCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isEven ? 'FFFFFFFF' : colors.bg }
      };

      // Material
      const matCell = row.getCell(2);
      matCell.value = item.material || 'N/A';
      matCell.font = { name: 'Calibri', size: 10 };
      matCell.alignment = { horizontal: 'left', vertical: 'middle' };
      matCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isEven ? 'FFFFFFFF' : colors.bg }
      };

      // Service Type
      const srvCell = row.getCell(3);
      srvCell.value = item.service || 'General';
      srvCell.font = { name: 'Calibri', size: 10 };
      srvCell.alignment = { horizontal: 'left', vertical: 'middle' };
      srvCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isEven ? 'FFFFFFFF' : colors.bg }
      };

      // Unit
      const unitCell = row.getCell(4);
      unitCell.value = item.unit || 'ea';
      unitCell.font = { name: 'Calibri', size: 10 };
      unitCell.alignment = { horizontal: 'center', vertical: 'middle' };
      unitCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isEven ? 'FFFFFFFF' : colors.bg }
      };

      // Size/Diameter - Use size column first, then extract from description, then show FRR if available
      const sizeCell = row.getCell(5);
      let sizeValue = 'N/A';
      let source = 'none';

      // Priority 1: Use the size column if populated
      if (item.size && item.size.trim() !== '') {
        sizeValue = item.size;
        source = 'size_column';
      }
      // Priority 2: Extract from description
      else {
        const sizeMatch = item.description?.match(/\d+\s*mm|\d+\s*"|\d+x\d+/i);
        if (sizeMatch) {
          sizeValue = sizeMatch[0];
          source = 'regex_extraction';
        }
        // Priority 3: Show FRR if available and no size found
        else if (item.frr && item.frr.trim() !== '') {
          sizeValue = item.frr;
          source = 'frr_column';
        }
      }

      // Debug log for first few items
      if (idx < 3) {
        console.log(`[Schedule of Rates] Item ${idx + 1} size extraction:`, {
          description: item.description?.substring(0, 50),
          size_column: item.size,
          frr_column: item.frr,
          extracted_value: sizeValue,
          source: source
        });
      }

      sizeCell.value = sizeValue;
      sizeCell.font = { name: 'Calibri', size: 10 };
      sizeCell.alignment = { horizontal: 'center', vertical: 'middle' };
      sizeCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isEven ? 'FFFFFFFF' : colors.bg }
      };

      // Rate
      const rateCell = row.getCell(6);
      rateCell.value = item.unit_price || 0;
      rateCell.numFmt = '$#,##0.00';
      rateCell.font = { name: 'Calibri', size: 10, bold: true };
      rateCell.alignment = { horizontal: 'right', vertical: 'middle' };
      rateCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isEven ? 'FFFFFFFF' : colors.bg }
      };

      // Add borders to all cells
      [1, 2, 3, 4, 5, 6].forEach(colNum => {
        const cell = row.getCell(colNum);
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
        };
      });

      row.height = 30;
      currentRow++;
    });

    // Add section summary
    const summaryRow = worksheet.getRow(currentRow);
    worksheet.mergeCells(`A${currentRow}:E${currentRow}`);
    const summaryCell = summaryRow.getCell(1);
    summaryCell.value = `Total ${serviceType} Items: ${serviceItems.length}`;
    summaryCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF374151' } };
    summaryCell.alignment = { horizontal: 'right', vertical: 'middle' };
    summaryCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF9FAFB' }
    };

    const totalCell = summaryRow.getCell(6);
    const totalFormula = serviceItems.reduce((sum, item) => sum + (item.unit_price || 0), 0);
    totalCell.value = totalFormula;
    totalCell.numFmt = '$#,##0.00';
    totalCell.font = { name: 'Calibri', size: 10, bold: true };
    totalCell.alignment = { horizontal: 'right', vertical: 'middle' };
    totalCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF9FAFB' }
    };

    [1, 2, 3, 4, 5, 6].forEach(colNum => {
      const cell = summaryRow.getCell(colNum);
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF9CA3AF' } },
        bottom: { style: 'medium', color: { argb: 'FF9CA3AF' } }
      };
    });

    summaryRow.height = 25;
    currentRow++;

    // Add spacing between sections
    currentRow++;
  });

  // Add footer
  currentRow++;
  worksheet.mergeCells(`A${currentRow}:F${currentRow}`);
  const footerCell = worksheet.getCell(`A${currentRow}`);
  footerCell.value = 'Generated by VerifyTrade www.verifytrade.co.nz - Professional Tender Management';
  footerCell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF9CA3AF' } };
  footerCell.alignment = { horizontal: 'center' };

  // Freeze panes
  worksheet.views = [
    { state: 'frozen', xSplit: 0, ySplit: 5 }
  ];
}
