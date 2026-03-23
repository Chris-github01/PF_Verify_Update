import ExcelJS from 'exceljs';
import { supabase } from '../supabase';
import { normaliseItem, buildItemKey, type RawQuoteItem } from '../comparison/normaliseItem';

interface Quote {
  id: string;
  supplier_name: string;
}

interface ComparisonEntry {
  description: string;
  size: string;
  unit: string;
  service: string;
  supplierRates: Record<string, number | null>;
}

const COLORS = {
  headerBg: 'FF1E3A8A',
  headerFg: 'FFFFFFFF',
  subHeaderBg: 'FFE0E7FF',
  subHeaderFg: 'FF1E3A8A',
  colHeaderBg: 'FFEFF6FF',
  colHeaderFg: 'FF1E40AF',
  green: 'FFD1FAE5',
  greenBorder: 'FF059669',
  red: 'FFFEE2E2',
  redBorder: 'FFDC2626',
  yellow: 'FFFEF9C3',
  yellowBorder: 'FFD97706',
  rowEven: 'FFF8FAFC',
  rowOdd: 'FFFFFFFF',
  border: 'FFE2E8F0',
  totalBg: 'FFF1F5F9',
};

function getSupplierColumnLetter(supplierIndex: number): string {
  const colNum = 5 + supplierIndex;
  if (colNum <= 26) {
    return String.fromCharCode(64 + colNum);
  }
  const first = String.fromCharCode(64 + Math.floor((colNum - 1) / 26));
  const second = String.fromCharCode(64 + ((colNum - 1) % 26) + 1);
  return first + second;
}

export async function exportScheduleComparison(
  projectId: string,
  projectName: string,
  trade?: string
): Promise<void> {
  try {
    console.log('[Schedule Comparison] Starting export for project:', projectId, 'trade:', trade);

    let quotesQuery = supabase
      .from('quotes')
      .select('id, supplier_name')
      .eq('project_id', projectId);

    if (trade) {
      quotesQuery = quotesQuery.eq('trade', trade);
    }

    const { data: quotes, error: quotesError } = await quotesQuery.order('supplier_name');

    if (quotesError) {
      console.error('[Schedule Comparison] Error fetching quotes:', quotesError);
      throw quotesError;
    }

    if (!quotes || quotes.length === 0) {
      throw new Error('No quotes found for this project');
    }

    console.log(`[Schedule Comparison] Found ${quotes.length} quotes`);

    const supplierNames = quotes.map((q: Quote) => q.supplier_name);

    const comparisonIndex: Record<string, ComparisonEntry> = {};

    for (const quote of quotes as Quote[]) {
      const { data: items, error: itemsError } = await supabase
        .from('quote_items')
        .select('id, description, service, material, unit, unit_price, size, frr')
        .eq('quote_id', quote.id)
        .order('description');

      if (itemsError) {
        console.error(`[Schedule Comparison] Error fetching items for ${quote.supplier_name}:`, itemsError);
        continue;
      }

      if (!items || items.length === 0) {
        console.log(`[Schedule Comparison] No items for quote ${quote.id}`);
        continue;
      }

      console.log(`[Schedule Comparison] Processing ${items.length} items for ${quote.supplier_name}`);

      for (const rawItem of items as RawQuoteItem[]) {
        const normalised = normaliseItem(rawItem);
        const key = buildItemKey(normalised);

        if (!comparisonIndex[key]) {
          comparisonIndex[key] = {
            description: rawItem.description || '',
            size: normalised.size,
            unit: rawItem.unit || '',
            service: rawItem.service || '',
            supplierRates: {},
          };
          for (const name of supplierNames) {
            comparisonIndex[key].supplierRates[name] = null;
          }
        }

        comparisonIndex[key].supplierRates[quote.supplier_name] = rawItem.unit_price ?? null;
      }
    }

    const dataset: ComparisonEntry[] = Object.values(comparisonIndex).sort((a, b) =>
      a.description.localeCompare(b.description)
    );

    console.log(`[Schedule Comparison] Comparison index built: ${dataset.length} unique items`);

    await buildComparisonWorkbook(dataset, supplierNames, projectName);

    console.log('[Schedule Comparison] Export complete');
  } catch (error) {
    console.error('[Schedule Comparison] Export error:', error);
    throw error;
  }
}

async function buildComparisonWorkbook(
  dataset: ComparisonEntry[],
  supplierNames: string[],
  projectName: string
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'VerifyTrade';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Comparison');

  const totalSuppliers = supplierNames.length;
  const minColIndex = 5;
  const maxSupplierColIndex = minColIndex + totalSuppliers - 1;
  const minColLetter = getSupplierColumnLetter(0);
  const minRangeStart = 'E';
  const maxRangeEnd = getSupplierColumnLetter(totalSuppliers - 1);
  const minColNum = maxSupplierColIndex + 1;
  const maxColNum = maxSupplierColIndex + 2;

  const fixedColumns: Partial<ExcelJS.Column>[] = [
    { key: 'description', width: 52 },
    { key: 'size', width: 14 },
    { key: 'unit', width: 10 },
    { key: 'service', width: 20 },
  ];

  const supplierColumns: Partial<ExcelJS.Column>[] = supplierNames.map((name) => ({
    key: name,
    width: Math.max(16, Math.min(name.length + 4, 28)),
  }));

  const summaryColumns: Partial<ExcelJS.Column>[] = [
    { key: 'min_rate', width: 14 },
    { key: 'max_rate', width: 14 },
  ];

  worksheet.columns = [...fixedColumns, ...supplierColumns, ...summaryColumns];

  const totalColCount = 4 + totalSuppliers + 2;
  const lastColLetter = getSupplierColumnLetter(totalSuppliers + 1);

  worksheet.mergeCells(`A1:${lastColLetter}1`);
  const titleCell = worksheet.getCell('A1');
  titleCell.value = 'SCHEDULE COMPARISON — SUPPLIER RATE ANALYSIS';
  titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: COLORS.headerFg } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };
  worksheet.getRow(1).height = 32;

  worksheet.mergeCells(`A2:${lastColLetter}2`);
  const projectCell = worksheet.getCell('A2');
  projectCell.value = `Project: ${projectName}   |   Generated: ${new Date().toLocaleDateString('en-NZ', { year: 'numeric', month: 'long', day: 'numeric' })}   |   Suppliers: ${supplierNames.length}   |   Items: ${dataset.length}`;
  projectCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: COLORS.subHeaderFg } };
  projectCell.alignment = { horizontal: 'center', vertical: 'middle' };
  projectCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.subHeaderBg } };
  worksheet.getRow(2).height = 22;

  worksheet.addRow([]);
  worksheet.getRow(3).height = 6;

  const headerRow = worksheet.getRow(4);
  const headers = ['Description', 'Size', 'Unit', 'Service', ...supplierNames, 'Min Rate', 'Max Rate'];
  headers.forEach((header, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = header;

    const isSupplier = idx >= 4 && idx < 4 + totalSuppliers;
    const isSummary = idx >= 4 + totalSuppliers;

    cell.font = {
      name: 'Calibri',
      size: isSupplier ? 10 : 11,
      bold: true,
      color: { argb: isSummary ? 'FF374151' : COLORS.colHeaderFg },
    };
    cell.alignment = { horizontal: isSupplier ? 'center' : 'left', vertical: 'middle', wrapText: true };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: isSupplier ? COLORS.colHeaderBg : isSummary ? COLORS.totalBg : COLORS.colHeaderBg },
    };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'medium', color: { argb: 'FF94A3B8' } },
      left: { style: 'thin', color: { argb: COLORS.border } },
      right: { style: 'thin', color: { argb: COLORS.border } },
    };
  });
  headerRow.height = 36;

  let dataRowNum = 5;

  dataset.forEach((entry, rowIdx) => {
    const row = worksheet.getRow(dataRowNum);
    const isEven = rowIdx % 2 === 0;
    const rowBg = isEven ? COLORS.rowEven : COLORS.rowOdd;

    const presentRates = supplierNames
      .map((n) => entry.supplierRates[n])
      .filter((v): v is number => v !== null && v !== undefined && v > 0);

    const minRate = presentRates.length > 0 ? Math.min(...presentRates) : null;
    const maxRate = presentRates.length > 0 ? Math.max(...presentRates) : null;

    const fixedValues = [entry.description, entry.size || '—', entry.unit || '—', entry.service || '—'];
    fixedValues.forEach((val, idx) => {
      const cell = row.getCell(idx + 1);
      cell.value = val;
      cell.font = { name: 'Calibri', size: 10 };
      cell.alignment = { horizontal: 'left', vertical: 'top', wrapText: idx === 0 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
      cell.border = {
        top: { style: 'thin', color: { argb: COLORS.border } },
        bottom: { style: 'thin', color: { argb: COLORS.border } },
        left: { style: 'thin', color: { argb: COLORS.border } },
        right: { style: 'thin', color: { argb: COLORS.border } },
      };
    });

    supplierNames.forEach((supplierName, sIdx) => {
      const colNum = minColIndex + sIdx;
      const cell = row.getCell(colNum);
      const rate = entry.supplierRates[supplierName];

      if (rate === null || rate === undefined) {
        cell.value = 'MISSING';
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.yellowBorder } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.yellow } };
        cell.border = {
          top: { style: 'thin', color: { argb: COLORS.yellowBorder } },
          bottom: { style: 'thin', color: { argb: COLORS.yellowBorder } },
          left: { style: 'thin', color: { argb: COLORS.yellowBorder } },
          right: { style: 'thin', color: { argb: COLORS.yellowBorder } },
        };
      } else if (minRate !== null && maxRate !== null && presentRates.length > 1) {
        cell.value = rate;
        cell.numFmt = '$#,##0.00';
        cell.alignment = { horizontal: 'right', vertical: 'middle' };

        if (rate === minRate) {
          cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.greenBorder } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.green } };
          cell.border = {
            top: { style: 'thin', color: { argb: COLORS.greenBorder } },
            bottom: { style: 'thin', color: { argb: COLORS.greenBorder } },
            left: { style: 'thin', color: { argb: COLORS.greenBorder } },
            right: { style: 'thin', color: { argb: COLORS.greenBorder } },
          };
        } else if (rate === maxRate) {
          cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.redBorder } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.red } };
          cell.border = {
            top: { style: 'thin', color: { argb: COLORS.redBorder } },
            bottom: { style: 'thin', color: { argb: COLORS.redBorder } },
            left: { style: 'thin', color: { argb: COLORS.redBorder } },
            right: { style: 'thin', color: { argb: COLORS.redBorder } },
          };
        } else {
          cell.font = { name: 'Calibri', size: 10 };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
          cell.border = {
            top: { style: 'thin', color: { argb: COLORS.border } },
            bottom: { style: 'thin', color: { argb: COLORS.border } },
            left: { style: 'thin', color: { argb: COLORS.border } },
            right: { style: 'thin', color: { argb: COLORS.border } },
          };
        }
      } else {
        cell.value = rate;
        cell.numFmt = '$#,##0.00';
        cell.font = { name: 'Calibri', size: 10 };
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
        cell.border = {
          top: { style: 'thin', color: { argb: COLORS.border } },
          bottom: { style: 'thin', color: { argb: COLORS.border } },
          left: { style: 'thin', color: { argb: COLORS.border } },
          right: { style: 'thin', color: { argb: COLORS.border } },
        };
      }
    });

    const minCell = row.getCell(minColNum);
    const maxCell = row.getCell(maxColNum);

    if (presentRates.length > 0) {
      const firstSupplierCol = getSupplierColumnLetter(0);
      const lastSupplierCol = getSupplierColumnLetter(totalSuppliers - 1);
      minCell.value = { formula: `MIN(${firstSupplierCol}${dataRowNum}:${lastSupplierCol}${dataRowNum})` };
      maxCell.value = { formula: `MAX(${firstSupplierCol}${dataRowNum}:${lastSupplierCol}${dataRowNum})` };
    } else {
      minCell.value = '—';
      maxCell.value = '—';
    }

    [minCell, maxCell].forEach((cell) => {
      cell.numFmt = '$#,##0.00';
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF374151' } };
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.totalBg } };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      };
    });

    row.height = entry.description.length > 60 ? 40 : 24;
    dataRowNum++;
  });

  worksheet.views = [{ state: 'frozen', xSplit: 4, ySplit: 4 }];

  worksheet.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: 4, column: totalColCount },
  };

  const legendRow = worksheet.getRow(dataRowNum + 1);
  worksheet.mergeCells(`A${dataRowNum + 1}:${lastColLetter}${dataRowNum + 1}`);
  const legendCell = legendRow.getCell(1);
  legendCell.value = 'Legend:  Green = Lowest rate   |   Red = Highest rate   |   Yellow = Item not quoted by this supplier   |   Min/Max columns use Excel MIN()/MAX() formulas across supplier columns';
  legendCell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF64748B' } };
  legendCell.alignment = { horizontal: 'left', vertical: 'middle' };
  legendCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
  legendRow.height = 20;

  const footerRow = worksheet.getRow(dataRowNum + 2);
  worksheet.mergeCells(`A${dataRowNum + 2}:${lastColLetter}${dataRowNum + 2}`);
  const footerCell = footerRow.getCell(1);
  footerCell.value = 'Generated by VerifyTrade — www.verifytrade.co.nz — Professional Tender Management';
  footerCell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF94A3B8' } };
  footerCell.alignment = { horizontal: 'center', vertical: 'middle' };
  footerRow.height = 18;

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  link.download = `${projectName.replace(/[^a-zA-Z0-9]/g, '_')}_Schedule_Comparison_${timestamp}.xlsx`;
  link.click();
  window.URL.revokeObjectURL(url);
}
