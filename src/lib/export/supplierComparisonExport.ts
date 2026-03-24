import ExcelJS from 'exceljs';
import { supabase } from '../supabase';

interface Quote {
  id: string;
  supplier_name: string;
}

interface RawItem {
  id: string;
  description: string;
  service: string;
  material: string;
  unit: string;
  unit_price: number | null;
  quantity: number | null;
  size: string;
  frr: string;
  total: number | null;
}

interface SupplierData {
  unitPrice: number | null;
  quantity: number | null;
  total: number | null;
  unit: string;
  material: string;
  originalDescription: string;
  frr: string;
  size: string;
}

interface ComparisonGroup {
  serviceType: string;
  diameter: string;
  material: string;
  frr: string;
  associatedMaterials: string;
  canonicalDescription: string;
  suppliers: Record<string, SupplierData>;
}

const COLORS = {
  headerBg: 'FF1E3A8A',
  headerFg: 'FFFFFFFF',
  subHeaderBg: 'FFE8F0FE',
  subHeaderFg: 'FF1E3A8A',
  specHeaderBg: 'FF1E5C3A',
  specHeaderFg: 'FFFFFFFF',
  colHeaderBg: 'FFEFF6FF',
  colHeaderFg: 'FF1E40AF',
  specBg: 'FFECFDF5',
  specFg: 'FF065F46',
  green: 'FFD1FAE5',
  greenBorder: 'FF059669',
  red: 'FFFEE2E2',
  redBorder: 'FFDC2626',
  yellow: 'FFFEF9C3',
  yellowBorder: 'FFD97706',
  amber: 'FFFEF3C7',
  amberBorder: 'FFD97706',
  rowEven: 'FFF8FAFC',
  rowOdd: 'FFFFFFFF',
  border: 'FFE2E8F0',
  totalBg: 'FFF1F5F9',
  variantBg: 'FFFFF7ED',
  variantBorder: 'FFFBBF24',
};

function extractDiameter(size: string, description: string): string {
  if (size && size.trim()) return size.trim();
  const mmMatch = description?.match(/(\d+)\s*mm/i);
  if (mmMatch) return `${mmMatch[1]}mm`;
  const inchMatch = description?.match(/(\d+(?:\.\d+)?)\s*["']/);
  if (inchMatch) return `${inchMatch[1]}"`;
  const dnMatch = description?.match(/DN\s*(\d+)/i);
  if (dnMatch) return `DN${dnMatch[1]}`;
  return '';
}

function normaliseFrr(frr: string): string {
  if (!frr || !frr.trim()) return '';
  const clean = frr.trim().toUpperCase();
  if (clean.match(/^-?\/\d+\/\d+$/)) return clean.startsWith('-') ? clean : `-${clean}`;
  const nums = clean.match(/\d+/g);
  if (nums && nums.length >= 2) return `-/${nums[0]}/${nums[1]}`;
  if (nums && nums.length === 1) return `-/${nums[0]}/${nums[0]}`;
  return clean;
}

function extractMaterial(material: string, description: string): string {
  if (material && material.trim()) return material.trim();
  const matPatterns = [
    /CPVC/i, /uPVC/i, /PVC/i, /HDPE/i, /copper/i, /steel/i, /galvanised/i,
    /galvanized/i, /stainless/i, /cast iron/i, /ductile/i, /polypropylene/i,
    /polythene/i, /polyethylene/i, /ABS/i, /GRP/i, /fibreglass/i,
  ];
  for (const pattern of matPatterns) {
    const match = description?.match(pattern);
    if (match) return match[0];
  }
  return '';
}

function buildSpecKey(serviceType: string, diameter: string, material: string, frr: string): string {
  return [
    serviceType.toLowerCase().trim(),
    diameter.toLowerCase().trim(),
    material.toLowerCase().trim(),
    frr.toLowerCase().trim(),
  ].join('|');
}

function getColLetter(colNum: number): string {
  if (colNum <= 26) return String.fromCharCode(64 + colNum);
  const first = String.fromCharCode(64 + Math.floor((colNum - 1) / 26));
  const second = String.fromCharCode(64 + ((colNum - 1) % 26) + 1);
  return first + second;
}

function styleCell(
  cell: ExcelJS.Cell,
  options: {
    value?: ExcelJS.CellValue;
    bold?: boolean;
    italic?: boolean;
    size?: number;
    fgColor?: string;
    fontColor?: string;
    align?: ExcelJS.Alignment['horizontal'];
    wrap?: boolean;
    numFmt?: string;
    borderColor?: string;
    borderStyle?: ExcelJS.BorderStyle;
  }
) {
  if (options.value !== undefined) cell.value = options.value;
  cell.font = {
    name: 'Calibri',
    size: options.size ?? 10,
    bold: options.bold ?? false,
    italic: options.italic ?? false,
    color: { argb: options.fontColor ?? 'FF1F2937' },
  };
  cell.alignment = {
    horizontal: options.align ?? 'left',
    vertical: 'middle',
    wrapText: options.wrap ?? false,
  };
  if (options.fgColor) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: options.fgColor } };
  }
  if (options.numFmt) cell.numFmt = options.numFmt;
  const bs: ExcelJS.BorderStyle = options.borderStyle ?? 'thin';
  const bc = options.borderColor ?? COLORS.border;
  cell.border = {
    top: { style: bs, color: { argb: bc } },
    bottom: { style: bs, color: { argb: bc } },
    left: { style: bs, color: { argb: bc } },
    right: { style: bs, color: { argb: bc } },
  };
}

export async function exportSupplierComparison(
  projectId: string,
  projectName: string,
  trade?: string
): Promise<void> {
  const quotesQuery = trade
    ? supabase.from('quotes').select('id, supplier_name').eq('project_id', projectId).eq('trade', trade).order('supplier_name')
    : supabase.from('quotes').select('id, supplier_name').eq('project_id', projectId).order('supplier_name');

  const { data: quotes, error: quotesError } = await quotesQuery;
  if (quotesError) throw quotesError;
  if (!quotes || quotes.length === 0) throw new Error('No quotes found for this project');

  const supplierNames: string[] = quotes.map((q: Quote) => q.supplier_name);
  const groupIndex: Record<string, ComparisonGroup> = {};

  for (const quote of quotes as Quote[]) {
    const { data: items, error } = await supabase
      .from('quote_items')
      .select('id, description, service, material, unit, unit_price, quantity, size, frr, total')
      .eq('quote_id', quote.id)
      .order('service')
      .order('description');

    if (error || !items) continue;

    for (const raw of items as RawItem[]) {
      const serviceType = raw.service || '';
      const diameter = extractDiameter(raw.size, raw.description);
      const material = extractMaterial(raw.material, raw.description);
      const frr = normaliseFrr(raw.frr);
      const associatedMaterials = '';

      const key = buildSpecKey(serviceType, diameter, material, frr);

      if (!groupIndex[key]) {
        groupIndex[key] = {
          serviceType,
          diameter,
          material,
          frr,
          associatedMaterials,
          canonicalDescription: raw.description || '',
          suppliers: {},
        };
        for (const name of supplierNames) {
          groupIndex[key].suppliers[name] = {
            unitPrice: null,
            quantity: null,
            total: null,
            unit: '',
            material: '',
            originalDescription: '',
            frr: '',
            size: '',
          };
        }
      }

      const existing = groupIndex[key].suppliers[quote.supplier_name];
      const incomingTotal = raw.total ?? (raw.unit_price != null && raw.quantity != null ? raw.unit_price * raw.quantity : null);

      if (existing.total === null || (incomingTotal !== null && incomingTotal > (existing.total ?? 0))) {
        groupIndex[key].suppliers[quote.supplier_name] = {
          unitPrice: raw.unit_price ?? null,
          quantity: raw.quantity ?? null,
          total: incomingTotal,
          unit: raw.unit || '',
          material: material,
          originalDescription: raw.description || '',
          frr: frr,
          size: diameter,
        };
        if (!groupIndex[key].canonicalDescription) {
          groupIndex[key].canonicalDescription = raw.description || '';
        }
      }

      if (material && !groupIndex[key].associatedMaterials) {
        const suppliersWithDiffMaterial = Object.values(groupIndex[key].suppliers)
          .filter((s) => s.material && s.material !== material);
        if (suppliersWithDiffMaterial.length > 0) {
          groupIndex[key].associatedMaterials = suppliersWithDiffMaterial
            .map((s) => s.material)
            .filter((v, i, a) => a.indexOf(v) === i)
            .join(', ');
        }
      }
    }
  }

  const groups = Object.values(groupIndex).sort((a, b) => {
    const svcCompare = a.serviceType.localeCompare(b.serviceType);
    if (svcCompare !== 0) return svcCompare;
    const diaCompare = a.diameter.localeCompare(b.diameter);
    if (diaCompare !== 0) return diaCompare;
    return a.material.localeCompare(b.material);
  });

  await buildWorkbook(groups, supplierNames, projectName, trade);
}

async function buildWorkbook(
  groups: ComparisonGroup[],
  supplierNames: string[],
  projectName: string,
  trade?: string
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'VerifyTrade';
  workbook.created = new Date();

  await buildComparisonSheet(workbook, groups, supplierNames, projectName, trade);
  await buildMaterialSubstitutionsSheet(workbook, groups, supplierNames);
  await buildValueEngineeringSheet(workbook, groups, supplierNames);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const tradeSuffix = trade ? `_${trade.replace(/[^a-zA-Z0-9]/g, '_')}` : '';
  link.download = `${projectName.replace(/[^a-zA-Z0-9]/g, '_')}_Supplier_Comparison${tradeSuffix}_${timestamp}.xlsx`;
  link.click();
  window.URL.revokeObjectURL(url);
}

async function buildComparisonSheet(
  workbook: ExcelJS.Workbook,
  groups: ComparisonGroup[],
  supplierNames: string[],
  projectName: string,
  trade?: string
): Promise<void> {
  const ws = workbook.addWorksheet('Apples-to-Apples Comparison');

  const SPEC_COLS = 5;
  const PER_SUPPLIER_COLS = 3;
  const totalCols = SPEC_COLS + supplierNames.length * PER_SUPPLIER_COLS + 3;
  const lastCol = getColLetter(totalCols);

  ws.getColumn(1).width = 26;
  ws.getColumn(2).width = 14;
  ws.getColumn(3).width = 16;
  ws.getColumn(4).width = 12;
  ws.getColumn(5).width = 20;
  for (let s = 0; s < supplierNames.length; s++) {
    const base = SPEC_COLS + 1 + s * PER_SUPPLIER_COLS;
    ws.getColumn(base).width = 10;
    ws.getColumn(base + 1).width = 12;
    ws.getColumn(base + 2).width = 14;
  }
  ws.getColumn(SPEC_COLS + supplierNames.length * PER_SUPPLIER_COLS + 1).width = 14;
  ws.getColumn(SPEC_COLS + supplierNames.length * PER_SUPPLIER_COLS + 2).width = 14;
  ws.getColumn(SPEC_COLS + supplierNames.length * PER_SUPPLIER_COLS + 3).width = 12;

  ws.mergeCells(`A1:${lastCol}1`);
  styleCell(ws.getCell('A1'), {
    value: 'SUPPLIER COMPARISON — APPLES-TO-APPLES COST ANALYSIS',
    bold: true,
    size: 16,
    fgColor: COLORS.headerBg,
    fontColor: COLORS.headerFg,
    align: 'center',
  });
  ws.getRow(1).height = 34;

  ws.mergeCells(`A2:${lastCol}2`);
  const tradeLabel = trade ? `  |  Trade: ${trade.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}` : '';
  styleCell(ws.getCell('A2'), {
    value: `Project: ${projectName}${tradeLabel}  |  Generated: ${new Date().toLocaleDateString('en-NZ', { year: 'numeric', month: 'long', day: 'numeric' })}  |  Suppliers: ${supplierNames.length}  |  Item Groups: ${groups.length}`,
    italic: true,
    size: 10,
    fgColor: COLORS.subHeaderBg,
    fontColor: COLORS.subHeaderFg,
    align: 'center',
  });
  ws.getRow(2).height = 22;

  ws.mergeCells(`A3:${lastCol}3`);
  styleCell(ws.getCell('A3'), {
    value: 'Specifications are matched across suppliers by: Service Type + Diameter + Material + FRR. Green = lowest cost | Red = highest cost | Yellow = not quoted | Orange = material substitution detected.',
    italic: true,
    size: 9,
    fgColor: 'FFFFF7ED',
    fontColor: 'FF92400E',
    align: 'center',
  });
  ws.getRow(3).height = 20;

  ws.addRow([]);
  ws.getRow(4).height = 6;

  const hdrGroup = ws.getRow(5);
  const specHeaders = ['Service Type', 'Diameter', 'Material', 'FRR', 'Associated Materials'];
  specHeaders.forEach((h, i) => {
    const cell = hdrGroup.getCell(i + 1);
    styleCell(cell, {
      value: h,
      bold: true,
      size: 10,
      fgColor: COLORS.specHeaderBg,
      fontColor: COLORS.specHeaderFg,
      align: 'center',
    });
  });
  for (let s = 0; s < supplierNames.length; s++) {
    const base = SPEC_COLS + 1 + s * PER_SUPPLIER_COLS;
    ws.mergeCells(5, base, 5, base + PER_SUPPLIER_COLS - 1);
    const cell = hdrGroup.getCell(base);
    styleCell(cell, {
      value: supplierNames[s],
      bold: true,
      size: 10,
      fgColor: COLORS.colHeaderBg,
      fontColor: COLORS.colHeaderFg,
      align: 'center',
    });
  }
  const summaryBase = SPEC_COLS + supplierNames.length * PER_SUPPLIER_COLS + 1;
  ws.mergeCells(5, summaryBase, 5, summaryBase + 2);
  const summaryCell = hdrGroup.getCell(summaryBase);
  styleCell(summaryCell, {
    value: 'SUMMARY',
    bold: true,
    size: 10,
    fgColor: COLORS.totalBg,
    fontColor: '00374151',
    align: 'center',
  });
  ws.getRow(5).height = 28;

  const hdrDetail = ws.getRow(6);
  specHeaders.forEach((_, i) => {
    styleCell(hdrDetail.getCell(i + 1), {
      value: '',
      fgColor: COLORS.specHeaderBg,
      fontColor: COLORS.specHeaderFg,
    });
  });
  for (let s = 0; s < supplierNames.length; s++) {
    const base = SPEC_COLS + 1 + s * PER_SUPPLIER_COLS;
    ['Qty', 'Unit Rate', 'Total'].forEach((sub, si) => {
      styleCell(hdrDetail.getCell(base + si), {
        value: sub,
        bold: true,
        size: 9,
        fgColor: COLORS.colHeaderBg,
        fontColor: COLORS.colHeaderFg,
        align: 'center',
      });
    });
  }
  ['Min Total', 'Max Total', 'Variance %'].forEach((h, i) => {
    styleCell(hdrDetail.getCell(summaryBase + i), {
      value: h,
      bold: true,
      size: 9,
      fgColor: COLORS.totalBg,
      fontColor: '00374151',
      align: 'center',
    });
  });
  ws.getRow(6).height = 24;

  let rowNum = 7;
  let lastServiceType = '';

  groups.forEach((group, gIdx) => {
    if (group.serviceType !== lastServiceType) {
      lastServiceType = group.serviceType;
      const svcRow = ws.getRow(rowNum);
      ws.mergeCells(rowNum, 1, rowNum, totalCols);
      styleCell(svcRow.getCell(1), {
        value: `SERVICE: ${group.serviceType || '(Unclassified)'}`,
        bold: true,
        size: 11,
        fgColor: '00334155',
        fontColor: COLORS.headerFg,
        align: 'left',
      });
      ws.getRow(rowNum).height = 22;
      rowNum++;
    }

    const isEven = gIdx % 2 === 0;
    const rowBg = isEven ? COLORS.rowEven : COLORS.rowOdd;
    const dataRow = ws.getRow(rowNum);

    const specValues = [
      group.serviceType || '—',
      group.diameter || '—',
      group.material || '—',
      group.frr || '—',
      group.associatedMaterials || '—',
    ];
    specValues.forEach((val, i) => {
      styleCell(dataRow.getCell(i + 1), {
        value: val,
        size: 10,
        fgColor: COLORS.specBg,
        fontColor: COLORS.specFg,
        bold: i === 0,
        align: i === 0 ? 'left' : 'center',
      });
    });

    const presentTotals: number[] = [];
    for (const name of supplierNames) {
      const sd = group.suppliers[name];
      if (sd?.total != null && sd.total > 0) presentTotals.push(sd.total);
    }
    const minTotal = presentTotals.length > 0 ? Math.min(...presentTotals) : null;
    const maxTotal = presentTotals.length > 0 ? Math.max(...presentTotals) : null;

    const hasMaterialVariations = (() => {
      const mats = supplierNames
        .map((n) => group.suppliers[n]?.material)
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i);
      return mats.length > 1;
    })();

    for (let s = 0; s < supplierNames.length; s++) {
      const base = SPEC_COLS + 1 + s * PER_SUPPLIER_COLS;
      const sd = group.suppliers[supplierNames[s]];

      if (!sd || (sd.unitPrice === null && sd.total === null)) {
        ['Qty', 'Rate', 'Total'].forEach((_, ci) => {
          const cell = dataRow.getCell(base + ci);
          if (ci === 1) {
            styleCell(cell, {
              value: 'MISSING',
              bold: true,
              size: 9,
              fgColor: COLORS.yellow,
              fontColor: COLORS.yellowBorder,
              align: 'center',
              borderColor: COLORS.yellowBorder,
            });
          } else {
            styleCell(cell, { value: '—', size: 9, fgColor: COLORS.yellow, fontColor: 'FFCA8A04', align: 'center', borderColor: COLORS.yellowBorder });
          }
        });
        continue;
      }

      const isMin = sd.total !== null && sd.total === minTotal && presentTotals.length > 1;
      const isMax = sd.total !== null && sd.total === maxTotal && presentTotals.length > 1;
      const isMaterialVariant = hasMaterialVariations && sd.material !== group.material;

      let cellBg = rowBg;
      let cellFontColor = 'FF1F2937';
      let borderColor = COLORS.border;

      if (isMin) { cellBg = COLORS.green; cellFontColor = COLORS.greenBorder; borderColor = COLORS.greenBorder; }
      else if (isMax) { cellBg = COLORS.red; cellFontColor = COLORS.redBorder; borderColor = COLORS.redBorder; }
      else if (isMaterialVariant) { cellBg = COLORS.amber; borderColor = COLORS.amberBorder; }

      styleCell(dataRow.getCell(base), {
        value: sd.quantity ?? '—',
        size: 9,
        fgColor: cellBg,
        fontColor: cellFontColor,
        align: 'center',
        borderColor,
        numFmt: sd.quantity != null ? '#,##0.00' : undefined,
      });

      styleCell(dataRow.getCell(base + 1), {
        value: sd.unitPrice ?? null,
        size: 9,
        bold: isMin || isMax,
        fgColor: cellBg,
        fontColor: cellFontColor,
        align: 'right',
        borderColor,
        numFmt: '$#,##0.00',
      });

      styleCell(dataRow.getCell(base + 2), {
        value: sd.total ?? null,
        size: 9,
        bold: isMin || isMax,
        fgColor: cellBg,
        fontColor: cellFontColor,
        align: 'right',
        borderColor,
        numFmt: '$#,##0.00',
      });
    }

    styleCell(dataRow.getCell(summaryBase), {
      value: minTotal,
      size: 9,
      bold: true,
      fgColor: COLORS.green,
      fontColor: COLORS.greenBorder,
      align: 'right',
      numFmt: '$#,##0.00',
      borderColor: COLORS.greenBorder,
    });

    styleCell(dataRow.getCell(summaryBase + 1), {
      value: maxTotal,
      size: 9,
      bold: true,
      fgColor: COLORS.red,
      fontColor: COLORS.redBorder,
      align: 'right',
      numFmt: '$#,##0.00',
      borderColor: COLORS.redBorder,
    });

    const variancePct =
      minTotal !== null && maxTotal !== null && minTotal > 0
        ? ((maxTotal - minTotal) / minTotal) * 100
        : null;
    const varCell = dataRow.getCell(summaryBase + 2);
    styleCell(varCell, {
      value: variancePct !== null ? `${variancePct.toFixed(1)}%` : '—',
      size: 9,
      bold: variancePct !== null && variancePct > 20,
      fgColor: variancePct !== null && variancePct > 20 ? COLORS.red : variancePct !== null && variancePct > 10 ? COLORS.amber : COLORS.totalBg,
      fontColor: variancePct !== null && variancePct > 20 ? COLORS.redBorder : 'FF374151',
      align: 'center',
      borderColor: COLORS.border,
    });

    ws.getRow(rowNum).height = 22;
    rowNum++;
  });

  ws.views = [{ state: 'frozen', xSplit: SPEC_COLS, ySplit: 6 }];
  ws.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6, column: totalCols } };

  const legendRow = ws.getRow(rowNum + 1);
  ws.mergeCells(rowNum + 1, 1, rowNum + 1, totalCols);
  styleCell(legendRow.getCell(1), {
    value: 'Legend:  Green = Lowest total  |  Red = Highest total  |  Yellow = Not quoted by this supplier  |  Orange = Material substitution (different material from canonical group spec)  |  Variance % = (Max-Min)/Min',
    italic: true,
    size: 9,
    fgColor: 'FFF8FAFC',
    fontColor: 'FF64748B',
    align: 'left',
  });
  ws.getRow(rowNum + 1).height = 20;

  ws.mergeCells(rowNum + 2, 1, rowNum + 2, totalCols);
  styleCell(ws.getRow(rowNum + 2).getCell(1), {
    value: 'Generated by VerifyTrade — www.verifytrade.co.nz — Professional Tender Management',
    italic: true,
    size: 9,
    fgColor: 'FFF8FAFC',
    fontColor: 'FF94A3B8',
    align: 'center',
  });
  ws.getRow(rowNum + 2).height = 18;
}

async function buildMaterialSubstitutionsSheet(
  workbook: ExcelJS.Workbook,
  groups: ComparisonGroup[],
  supplierNames: string[]
): Promise<void> {
  const ws = workbook.addWorksheet('Material Substitutions');

  const substitutions = groups.filter((g) => {
    const mats = supplierNames
      .map((n) => g.suppliers[n]?.material)
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i);
    return mats.length > 1;
  });

  ws.mergeCells(`A1:H1`);
  styleCell(ws.getCell('A1'), {
    value: 'MATERIAL SUBSTITUTION ANALYSIS',
    bold: true,
    size: 14,
    fgColor: COLORS.headerBg,
    fontColor: COLORS.headerFg,
    align: 'center',
  });
  ws.getRow(1).height = 30;

  ws.mergeCells(`A2:H2`);
  styleCell(ws.getCell('A2'), {
    value: `Items where suppliers have quoted different materials for the same specification group. Review for value engineering and compliance implications.`,
    italic: true,
    size: 10,
    fgColor: COLORS.amber,
    fontColor: '00854D0E',
    align: 'left',
  });
  ws.getRow(2).height = 20;

  ws.addRow([]);
  ws.getRow(3).height = 8;

  const headers = ['Service Type', 'Diameter', 'FRR', 'Canonical Material', 'Supplier', 'Supplier Material', 'Unit Rate', 'Variance Note'];
  const widths = [20, 14, 14, 20, 22, 20, 14, 32];
  headers.forEach((h, i) => {
    ws.getColumn(i + 1).width = widths[i];
    styleCell(ws.getRow(4).getCell(i + 1), {
      value: h,
      bold: true,
      size: 10,
      fgColor: COLORS.colHeaderBg,
      fontColor: COLORS.colHeaderFg,
      align: 'center',
    });
  });
  ws.getRow(4).height = 26;

  let rowNum = 5;
  for (const group of substitutions) {
    const canonicalMat = group.material || '(not specified)';
    for (const name of supplierNames) {
      const sd = group.suppliers[name];
      if (!sd || !sd.material) continue;
      const isSubstitution = sd.material.toLowerCase() !== canonicalMat.toLowerCase();
      const row = ws.getRow(rowNum);
      const rowBg = isSubstitution ? COLORS.amber : COLORS.rowEven;

      [
        group.serviceType || '—',
        group.diameter || '—',
        group.frr || '—',
        canonicalMat,
        name,
        sd.material,
        sd.unitPrice,
        isSubstitution ? `${name} substituted ${sd.material} for ${canonicalMat} — verify specification compliance` : 'Matches canonical material',
      ].forEach((val, i) => {
        styleCell(row.getCell(i + 1), {
          value: typeof val === 'number' ? val : (val ?? '—'),
          size: 10,
          fgColor: rowBg,
          align: i === 6 ? 'right' : 'left',
          numFmt: i === 6 ? '$#,##0.00' : undefined,
          bold: isSubstitution && i === 5,
          fontColor: isSubstitution && i === 5 ? COLORS.amberBorder : 'FF1F2937',
          wrap: i === 7,
        });
      });
      ws.getRow(rowNum).height = 20;
      rowNum++;
    }
  }

  if (substitutions.length === 0) {
    ws.mergeCells(`A5:H5`);
    styleCell(ws.getCell('A5'), {
      value: 'No material substitutions detected — all suppliers quoted matching materials for each specification group.',
      italic: true,
      size: 10,
      fgColor: COLORS.green,
      fontColor: COLORS.greenBorder,
      align: 'center',
    });
    ws.getRow(5).height = 24;
  }
}

async function buildValueEngineeringSheet(
  workbook: ExcelJS.Workbook,
  groups: ComparisonGroup[],
  supplierNames: string[]
): Promise<void> {
  const ws = workbook.addWorksheet('Value Engineering');

  ws.mergeCells(`A1:G1`);
  styleCell(ws.getCell('A1'), {
    value: 'VALUE ENGINEERING OPPORTUNITIES',
    bold: true,
    size: 14,
    fgColor: COLORS.specHeaderBg,
    fontColor: COLORS.specHeaderFg,
    align: 'center',
  });
  ws.getRow(1).height = 30;

  ws.mergeCells(`A2:G2`);
  styleCell(ws.getCell('A2'), {
    value: 'Items with >20% variance between lowest and highest supplier total — flagged for tender negotiation or scope clarification.',
    italic: true,
    size: 10,
    fgColor: COLORS.specBg,
    fontColor: COLORS.specFg,
    align: 'left',
  });
  ws.getRow(2).height = 20;

  ws.addRow([]);
  ws.getRow(3).height = 8;

  const headers = ['Service Type', 'Diameter', 'Material', 'FRR', 'Min Total', 'Max Total', 'Variance %'];
  const widths = [22, 14, 18, 14, 16, 16, 14];
  headers.forEach((h, i) => {
    ws.getColumn(i + 1).width = widths[i];
    styleCell(ws.getRow(4).getCell(i + 1), {
      value: h,
      bold: true,
      size: 10,
      fgColor: COLORS.colHeaderBg,
      fontColor: COLORS.colHeaderFg,
      align: 'center',
    });
  });
  ws.getRow(4).height = 26;

  const highVariance = groups
    .map((g) => {
      const totals = supplierNames.map((n) => g.suppliers[n]?.total).filter((t): t is number => t != null && t > 0);
      if (totals.length < 2) return null;
      const minT = Math.min(...totals);
      const maxT = Math.max(...totals);
      const variance = ((maxT - minT) / minT) * 100;
      return { group: g, minT, maxT, variance };
    })
    .filter((v): v is { group: ComparisonGroup; minT: number; maxT: number; variance: number } => v !== null && v.variance > 20)
    .sort((a, b) => b.variance - a.variance);

  let rowNum = 5;
  for (const item of highVariance) {
    const { group, minT, maxT, variance } = item;
    const isHighVariance = variance > 50;
    const row = ws.getRow(rowNum);
    const rowBg = isHighVariance ? COLORS.red : COLORS.amber;
    const fontColor = isHighVariance ? COLORS.redBorder : COLORS.amberBorder;

    [
      group.serviceType || '—',
      group.diameter || '—',
      group.material || '—',
      group.frr || '—',
      minT,
      maxT,
      `${variance.toFixed(1)}%`,
    ].forEach((val, i) => {
      styleCell(row.getCell(i + 1), {
        value: typeof val === 'number' ? val : (val ?? '—'),
        size: 10,
        fgColor: rowBg,
        fontColor: i >= 4 ? fontColor : 'FF1F2937',
        bold: i >= 4,
        align: i >= 4 ? 'right' : 'left',
        numFmt: i === 4 || i === 5 ? '$#,##0.00' : undefined,
        borderColor: isHighVariance ? COLORS.redBorder : COLORS.amberBorder,
      });
    });
    ws.getRow(rowNum).height = 20;
    rowNum++;
  }

  if (highVariance.length === 0) {
    ws.mergeCells(`A5:G5`);
    styleCell(ws.getCell('A5'), {
      value: 'No significant value engineering opportunities detected (all variances <20%).',
      italic: true,
      size: 10,
      fgColor: COLORS.green,
      fontColor: COLORS.greenBorder,
      align: 'center',
    });
    ws.getRow(5).height = 24;
  } else {
    ws.mergeCells(`A${rowNum + 1}:G${rowNum + 1}`);
    styleCell(ws.getRow(rowNum + 1).getCell(1), {
      value: `${highVariance.length} item group(s) flagged for negotiation. Total potential saving if all items awarded at minimum rate: $${highVariance.reduce((acc, v) => acc + (v.maxT - v.minT), 0).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      bold: true,
      size: 10,
      fgColor: COLORS.specBg,
      fontColor: COLORS.specFg,
      align: 'left',
    });
    ws.getRow(rowNum + 1).height = 22;
  }
}
