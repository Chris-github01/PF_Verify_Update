import ExcelJS from 'exceljs';
import { supabase } from '../supabase';

interface Quote {
  id: string;
  supplier_name: string;
}

interface RawItem {
  id: string;
  description: string;
  service: string | null;
  material: string | null;
  unit: string | null;
  unit_price: number | null;
  quantity: number | null;
  size: string | null;
  frr: string | null;
  total_price: number | null;
}

interface SupplierData {
  unitPrice: number | null;
  quantity: number | null;
  total: number | null;
  unit: string;
  material: string;
  associatedMaterials: string;
  originalDescription: string;
  frr: string;
  size: string;
  hasData: boolean;
}

/**
 * A comparison group is keyed by service + diameter + frr.
 * Material is intentionally NOT part of the key — it lives at supplier level
 * so that cross-material comparisons appear on the same row (apples-to-apples).
 */
interface ComparisonGroup {
  serviceType: string;
  diameter: string;
  frr: string;
  canonicalDescription: string;
  suppliers: Record<string, SupplierData>;
}

const COLORS = {
  headerBg: 'FF0F2D5A',
  headerFg: 'FFFFFFFF',
  subHeaderBg: 'FFE8F0FE',
  subHeaderFg: 'FF0F2D5A',
  specHeaderBg: 'FF1B4D3E',
  specHeaderFg: 'FFFFFFFF',
  colHeaderBg: 'FFE8F4FD',
  colHeaderFg: 'FF0D4A7D',
  specBg: 'FFEBF5F0',
  specFg: 'FF1B4D3E',
  green: 'FFD4EDDA',
  greenFont: 'FF155724',
  greenBorder: 'FF28A745',
  red: 'FFF8D7DA',
  redFont: 'FF721C24',
  redBorder: 'FFDC3545',
  yellow: 'FFFFF3CD',
  yellowFont: 'FF856404',
  yellowBorder: 'FFFFC107',
  amber: 'FFFEF3C7',
  amberFont: 'FF92400E',
  amberBorder: 'FFD97706',
  orange: 'FFFFEDD5',
  orangeFont: 'FF7C2D12',
  orangeBorder: 'FFEA580C',
  rowEven: 'FFF8FAFC',
  rowOdd: 'FFFFFFFF',
  border: 'FFD1D5DB',
  totalBg: 'FFF1F5F9',
  sectionBg: 'FF334155',
  sectionFont: 'FFFFFFFF',
  materialBg: 'FFFAF5FF',
  materialFont: 'FF6B21A8',
};

const ASSOC_MATERIAL_KEYWORDS: Record<string, string[]> = {
  Sealant: ['sealant', 'mastic', 'silicone', 'intumescent sealant', 'fire sealant', 'acoustic sealant'],
  Fitting: ['elbow', 'tee', 'reducer', 'coupling', 'socket', 'bend', 'union', 'adapter', 'fitting', 'connector'],
  Collar: ['collar', 'pipe collar', 'fire collar', 'intumescent collar'],
  Sleeve: ['sleeve', 'pipe sleeve', 'wall sleeve'],
  Wrap: ['wrap', 'pipe wrap', 'intumescent wrap', 'fire wrap'],
  Insulation: ['insulation', 'lagging', 'armaflex', 'rockwool', 'glasswool'],
  Bracket: ['bracket', 'hanger', 'support', 'clip', 'clamp', 'restraint'],
  Valve: ['valve', 'gate valve', 'ball valve', 'check valve', 'butterfly valve', 'strainer'],
  Joint: ['joint', 'gasket', 'o-ring', 'flange', 'weld', 'solvent cement'],
  Penetration: ['penetration', 'fire stop', 'firestop', 'through-wall', 'through wall', 'sealing system'],
};

/**
 * For passive fire descriptions like "Cable Bundle 25mm -/30/30 GIB Wall ..."
 * the diameter appears immediately after the item type name.
 * We prefer the database column if populated, else parse the description.
 */
function extractDiameter(size: string | null, description: string): string {
  if (size && size.trim()) return normaliseDiameter(size.trim());
  const desc = description || '';
  const mmMatch = desc.match(/\b(\d+)\s*mm\b/i);
  if (mmMatch) return `${mmMatch[1]}mm`;
  const inchMatch = desc.match(/(\d+(?:\.\d+)?)\s*["']/);
  if (inchMatch) return `${inchMatch[1]}"`;
  const dnMatch = desc.match(/\bDN\s*(\d+)/i);
  if (dnMatch) return `DN${dnMatch[1]}`;
  const nbMatch = desc.match(/\bNB\s*(\d+)/i);
  if (nbMatch) return `NB${nbMatch[1]}`;
  return '';
}

/**
 * Passive fire items embed FRR in the description: "... -/30/30 ..." or "-/-/-"
 * Extract that pattern directly from description when the db column is empty.
 */
function extractFrrFromDescription(description: string): string {
  const desc = description || '';
  const frrMatch = desc.match(/(-?\/\d+\/\d+|-?\/-\/-|-\/\d+\/-|-\/-\/\d+)/);
  if (frrMatch) return frrMatch[1];
  return '';
}

/**
 * Passive fire items start with the service/item type before the diameter.
 * e.g. "Cable Bundle (Alarm) 15mm -/30/30 ..." → service = "Electrical" (from db)
 * or we extract item type prefix as the grouping label.
 */
function extractServiceType(service: string | null, description: string): string {
  if (service && service.trim()) return service.trim();
  const desc = description || '';
  const prefixMatch = desc.match(/^([A-Za-z][A-Za-z\s\(\)\/\*]+?)\s*\d+\s*mm/i);
  if (prefixMatch) {
    return prefixMatch[1].trim().replace(/\s+/g, ' ');
  }
  const firstWords = desc.split(/\s+/).slice(0, 3).join(' ');
  return firstWords || 'Unclassified';
}

function normaliseDiameter(d: string): string {
  const clean = d.trim();
  const mmMatch = clean.match(/^(\d+)\s*mm$/i);
  if (mmMatch) return `${mmMatch[1]}mm`;
  const inchMatch = clean.match(/^(\d+(?:\.\d+)?)\s*["']$/);
  if (inchMatch) return `${inchMatch[1]}"`;
  return clean;
}

function normaliseFrr(frr: string | null): string {
  if (!frr || !frr.trim()) return '';
  const clean = frr.trim().toUpperCase().replace(/\s+/g, '');
  if (clean === '-/-/-' || clean === '/-/-') return '-/-/-';
  if (clean.match(/^-\/\d+\/\d+$/)) return clean;
  if (clean.match(/^\/\d+\/\d+$/)) return `-${clean}`;
  const slashNums = clean.match(/(\d+)\/(\d+)/);
  if (slashNums) return `-/${slashNums[1]}/${slashNums[2]}`;
  const nums = clean.match(/\d+/g);
  if (nums && nums.length >= 2) return `-/${nums[0]}/${nums[1]}`;
  if (nums && nums.length === 1) return `-/${nums[0]}/${nums[0]}`;
  return clean;
}

function extractMaterial(material: string | null, description: string): string {
  if (material && material.trim()) return material.trim();
  const desc = description || '';
  const patterns: [RegExp, string][] = [
    [/\bCPVC\b/i, 'CPVC'],
    [/\buPVC\b/i, 'uPVC'],
    [/\bPVC\b/i, 'PVC'],
    [/\bHDPE\b/i, 'HDPE'],
    [/\bcopper\b/i, 'Copper'],
    [/\bstainless\s*steel\b/i, 'Stainless Steel'],
    [/\bgalvanise[d]?\s*steel\b/i, 'Galvanised Steel'],
    [/\bgalvanize[d]?\s*steel\b/i, 'Galvanised Steel'],
    [/\bgalvanise[d]?\b/i, 'Galvanised Steel'],
    [/\bgalvanize[d]?\b/i, 'Galvanised Steel'],
    [/\bblack\s*steel\b/i, 'Black Steel'],
    [/\bcast\s*iron\b/i, 'Cast Iron'],
    [/\bductile\s*iron\b/i, 'Ductile Iron'],
    [/\bpolypropylene\b/i, 'Polypropylene'],
    [/\bpolyethylene\b/i, 'Polyethylene'],
    [/\bpolythene\b/i, 'Polyethylene'],
    [/\bABS\b/i, 'ABS'],
    [/\bGRP\b/i, 'GRP'],
    [/\bfibreglass\b/i, 'Fibreglass'],
    [/\bfiberglass\b/i, 'Fibreglass'],
    [/\bsteel\b/i, 'Steel'],
  ];
  for (const [pattern, name] of patterns) {
    if (pattern.test(desc)) return name;
  }
  return '';
}

function extractAssociatedMaterials(description: string): string {
  const desc = (description || '').toLowerCase();
  const found: string[] = [];
  for (const [category, keywords] of Object.entries(ASSOC_MATERIAL_KEYWORDS)) {
    if (keywords.some((kw) => desc.includes(kw))) {
      found.push(category);
    }
  }
  return found.join(', ');
}

function buildGroupKey(serviceType: string, diameter: string, frr: string): string {
  return [
    (serviceType || '').toLowerCase().trim(),
    (diameter || '').toLowerCase().trim(),
    (frr || '').toLowerCase().trim(),
  ].join('||');
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
    indent?: number;
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
    indent: options.indent ?? 0,
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

function emptySupplierData(): SupplierData {
  return {
    unitPrice: null,
    quantity: null,
    total: null,
    unit: '',
    material: '',
    associatedMaterials: '',
    originalDescription: '',
    frr: '',
    size: '',
    hasData: false,
  };
}

export async function exportSupplierComparison(
  projectId: string,
  projectName: string,
  trade?: string
): Promise<void> {
  const quotesQuery = trade
    ? supabase
        .from('quotes')
        .select('id, supplier_name')
        .eq('project_id', projectId)
        .eq('trade', trade)
        .order('supplier_name')
    : supabase
        .from('quotes')
        .select('id, supplier_name')
        .eq('project_id', projectId)
        .order('supplier_name');

  const { data: quotes, error: quotesError } = await quotesQuery;
  if (quotesError) throw quotesError;
  if (!quotes || quotes.length === 0) throw new Error('No quotes found for this project');

  const supplierNames: string[] = (quotes as Quote[]).map((q) => q.supplier_name);
  const groupIndex: Record<string, ComparisonGroup> = {};

  for (const quote of quotes as Quote[]) {
    const { data: items, error } = await supabase
      .from('quote_items')
      .select('id, description, service, material, unit, unit_price, quantity, size, frr, total_price')
      .eq('quote_id', quote.id)
      .order('description');

    if (error || !items) continue;

    for (const raw of items as RawItem[]) {
      const desc = raw.description || '';

      const diameter = extractDiameter(raw.size, desc);
      const frrFromCol = normaliseFrr(raw.frr);
      const frrFromDesc = normaliseFrr(extractFrrFromDescription(desc));
      const frr = frrFromCol || frrFromDesc;
      const serviceType = extractServiceType(raw.service, desc);
      const material = extractMaterial(raw.material, desc);
      const associatedMaterials = extractAssociatedMaterials(desc);

      const key = buildGroupKey(serviceType, diameter, frr);

      if (!groupIndex[key]) {
        groupIndex[key] = {
          serviceType,
          diameter,
          frr,
          canonicalDescription: desc,
          suppliers: Object.fromEntries(supplierNames.map((n) => [n, emptySupplierData()])),
        };
      }

      const incomingTotal =
        raw.total_price != null
          ? Number(raw.total_price)
          : raw.unit_price != null && raw.quantity != null
          ? Number(raw.unit_price) * Number(raw.quantity)
          : null;

      const existing = groupIndex[key].suppliers[quote.supplier_name];
      const existingTotal = existing?.total ?? null;

      const shouldReplace =
        !existing?.hasData ||
        (incomingTotal !== null && existingTotal === null) ||
        (incomingTotal !== null && existingTotal !== null && incomingTotal > existingTotal);

      if (shouldReplace) {
        groupIndex[key].suppliers[quote.supplier_name] = {
          unitPrice: raw.unit_price != null ? Number(raw.unit_price) : null,
          quantity: raw.quantity != null ? Number(raw.quantity) : null,
          total: incomingTotal,
          unit: raw.unit || '',
          material,
          associatedMaterials,
          originalDescription: desc,
          frr,
          size: diameter,
          hasData: true,
        };

        if (!groupIndex[key].canonicalDescription) {
          groupIndex[key].canonicalDescription = raw.description || '';
        }
      }
    }
  }

  const groups = Object.values(groupIndex)
    .filter((g) => Object.values(g.suppliers).some((s) => s.hasData))
    .sort((a, b) => {
      const svcCmp = a.serviceType.localeCompare(b.serviceType);
      if (svcCmp !== 0) return svcCmp;
      const diaCmp = a.diameter.localeCompare(b.diameter, undefined, { numeric: true });
      if (diaCmp !== 0) return diaCmp;
      return a.frr.localeCompare(b.frr);
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
  await buildSummaryTotalsSheet(workbook, groups, supplierNames, projectName);

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

/**
 * Column layout for the main comparison sheet:
 *
 * Fixed spec columns (cols 1-4):
 *   1: Service Type
 *   2: Diameter
 *   3: FRR
 *   4: Item Description (canonical)
 *
 * Per-supplier block (cols 5 + s*5 ... each supplier has 5 cols):
 *   +0: Material
 *   +1: Assoc. Materials
 *   +2: Qty
 *   +3: Unit Rate
 *   +4: Total
 *
 * Summary trailing cols (3):
 *   Min Total, Max Total, Variance %
 */
async function buildComparisonSheet(
  workbook: ExcelJS.Workbook,
  groups: ComparisonGroup[],
  supplierNames: string[],
  projectName: string,
  trade?: string
): Promise<void> {
  const ws = workbook.addWorksheet('Apples-to-Apples Comparison');

  const SPEC_COLS = 4;
  const PER_SUPPLIER_COLS = 5;
  const SUMMARY_COLS = 3;
  const totalCols = SPEC_COLS + supplierNames.length * PER_SUPPLIER_COLS + SUMMARY_COLS;
  const lastCol = getColLetter(totalCols);

  ws.getColumn(1).width = 22;
  ws.getColumn(2).width = 12;
  ws.getColumn(3).width = 12;
  ws.getColumn(4).width = 36;
  for (let s = 0; s < supplierNames.length; s++) {
    const base = SPEC_COLS + 1 + s * PER_SUPPLIER_COLS;
    ws.getColumn(base).width = 16;
    ws.getColumn(base + 1).width = 20;
    ws.getColumn(base + 2).width = 8;
    ws.getColumn(base + 3).width = 12;
    ws.getColumn(base + 4).width = 14;
  }
  const sumBase = SPEC_COLS + supplierNames.length * PER_SUPPLIER_COLS + 1;
  ws.getColumn(sumBase).width = 14;
  ws.getColumn(sumBase + 1).width = 14;
  ws.getColumn(sumBase + 2).width = 12;

  ws.mergeCells(`A1:${lastCol}1`);
  styleCell(ws.getCell('A1'), {
    value: 'SUPPLIER COMPARISON — APPLES-TO-APPLES COST ANALYSIS',
    bold: true,
    size: 15,
    fgColor: COLORS.headerBg,
    fontColor: COLORS.headerFg,
    align: 'center',
  });
  ws.getRow(1).height = 32;

  ws.mergeCells(`A2:${lastCol}2`);
  const tradeLabel = trade
    ? `  |  Trade: ${trade.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}`
    : '';
  styleCell(ws.getCell('A2'), {
    value: `Project: ${projectName}${tradeLabel}  |  Generated: ${new Date().toLocaleDateString('en-NZ', { year: 'numeric', month: 'long', day: 'numeric' })}  |  Suppliers: ${supplierNames.length}  |  Specification Groups: ${groups.length}`,
    italic: true,
    size: 10,
    fgColor: COLORS.subHeaderBg,
    fontColor: COLORS.subHeaderFg,
    align: 'center',
  });
  ws.getRow(2).height = 20;

  ws.mergeCells(`A3:${lastCol}3`);
  styleCell(ws.getCell('A3'), {
    value: 'Groups matched by: Service Type + Diameter + FRR. Material shown per-supplier to reveal substitutions on the same row. Green = lowest | Red = highest | Yellow = not quoted | Orange = material differs from most common.',
    italic: true,
    size: 9,
    fgColor: COLORS.orange,
    fontColor: COLORS.orangeFont,
    align: 'center',
  });
  ws.getRow(3).height = 18;

  ws.addRow([]);
  ws.getRow(4).height = 5;

  const hdrRow1 = ws.getRow(5);
  const specHdrs = ['Service Type', 'Diameter', 'FRR', 'Item Description'];
  specHdrs.forEach((h, i) => {
    styleCell(hdrRow1.getCell(i + 1), {
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
    styleCell(hdrRow1.getCell(base), {
      value: supplierNames[s].toUpperCase(),
      bold: true,
      size: 10,
      fgColor: s % 2 === 0 ? COLORS.colHeaderBg : 'FFD6EAF8',
      fontColor: COLORS.colHeaderFg,
      align: 'center',
    });
  }
  ws.mergeCells(5, sumBase, 5, sumBase + SUMMARY_COLS - 1);
  styleCell(hdrRow1.getCell(sumBase), {
    value: 'SUMMARY',
    bold: true,
    size: 10,
    fgColor: COLORS.totalBg,
    fontColor: COLORS.sectionBg,
    align: 'center',
  });
  ws.getRow(5).height = 28;

  const hdrRow2 = ws.getRow(6);
  specHdrs.forEach((_, i) => {
    styleCell(hdrRow2.getCell(i + 1), {
      value: '',
      fgColor: COLORS.specHeaderBg,
    });
  });
  for (let s = 0; s < supplierNames.length; s++) {
    const base = SPEC_COLS + 1 + s * PER_SUPPLIER_COLS;
    const subHdrs = ['Material', 'Assoc. Materials', 'Qty', 'Unit Rate', 'Total'];
    const colBg = s % 2 === 0 ? COLORS.colHeaderBg : 'FFD6EAF8';
    subHdrs.forEach((sub, si) => {
      styleCell(hdrRow2.getCell(base + si), {
        value: sub,
        bold: true,
        size: 9,
        fgColor: colBg,
        fontColor: COLORS.colHeaderFg,
        align: si >= 2 ? 'right' : 'left',
      });
    });
  }
  const sumHdrs = ['Min Total', 'Max Total', 'Variance %'];
  sumHdrs.forEach((h, i) => {
    styleCell(hdrRow2.getCell(sumBase + i), {
      value: h,
      bold: true,
      size: 9,
      fgColor: COLORS.totalBg,
      fontColor: COLORS.sectionBg,
      align: 'right',
    });
  });
  ws.getRow(6).height = 22;

  let rowNum = 7;
  let lastServiceType = '';

  groups.forEach((group, gIdx) => {
    if (group.serviceType !== lastServiceType) {
      lastServiceType = group.serviceType;
      ws.mergeCells(rowNum, 1, rowNum, totalCols);
      styleCell(ws.getRow(rowNum).getCell(1), {
        value: `  SERVICE TYPE: ${(group.serviceType || 'Unclassified').toUpperCase()}`,
        bold: true,
        size: 11,
        fgColor: COLORS.sectionBg,
        fontColor: COLORS.sectionFont,
        align: 'left',
      });
      ws.getRow(rowNum).height = 22;
      rowNum++;
    }

    const isEven = gIdx % 2 === 0;
    const rowBg = isEven ? COLORS.rowEven : COLORS.rowOdd;
    const dataRow = ws.getRow(rowNum);

    styleCell(dataRow.getCell(1), {
      value: group.serviceType || '—',
      size: 10,
      fgColor: COLORS.specBg,
      fontColor: COLORS.specFg,
      bold: true,
    });
    styleCell(dataRow.getCell(2), {
      value: group.diameter || '—',
      size: 10,
      fgColor: COLORS.specBg,
      fontColor: COLORS.specFg,
      align: 'center',
    });
    styleCell(dataRow.getCell(3), {
      value: group.frr || '—',
      size: 10,
      fgColor: COLORS.specBg,
      fontColor: COLORS.specFg,
      align: 'center',
    });
    styleCell(dataRow.getCell(4), {
      value: group.canonicalDescription || '—',
      size: 9,
      fgColor: rowBg,
      fontColor: 'FF374151',
      wrap: true,
    });

    const presentTotals = supplierNames
      .map((n) => group.suppliers[n]?.total)
      .filter((t): t is number => t != null && t > 0);
    const minTotal = presentTotals.length > 0 ? Math.min(...presentTotals) : null;
    const maxTotal = presentTotals.length > 0 ? Math.max(...presentTotals) : null;

    const presentMaterials = supplierNames
      .map((n) => group.suppliers[n]?.material)
      .filter(Boolean);
    const materialFreq: Record<string, number> = {};
    for (const m of presentMaterials) {
      materialFreq[m] = (materialFreq[m] || 0) + 1;
    }
    const canonicalMaterial =
      Object.entries(materialFreq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';

    for (let s = 0; s < supplierNames.length; s++) {
      const base = SPEC_COLS + 1 + s * PER_SUPPLIER_COLS;
      const sd = group.suppliers[supplierNames[s]];
      const colBg = s % 2 === 0 ? rowBg : (isEven ? 'FFF0F4F8' : 'FFF7F9FC');

      if (!sd || !sd.hasData) {
        ['Material', 'Assoc. Materials', 'Qty', 'NOT QUOTED', 'Total'].forEach((label, ci) => {
          styleCell(dataRow.getCell(base + ci), {
            value: ci === 3 ? 'NOT QUOTED' : '—',
            bold: ci === 3,
            size: 9,
            fgColor: COLORS.yellow,
            fontColor: COLORS.yellowFont,
            align: ci >= 2 ? 'center' : 'left',
            borderColor: COLORS.yellowBorder,
          });
        });
        continue;
      }

      const isMin = sd.total !== null && sd.total === minTotal && presentTotals.length > 1;
      const isMax = sd.total !== null && sd.total === maxTotal && presentTotals.length > 1;
      const isMaterialVariant =
        canonicalMaterial &&
        sd.material &&
        sd.material.toLowerCase() !== canonicalMaterial.toLowerCase();

      let priceBg = colBg;
      let priceFont = 'FF1F2937';
      let borderCol = COLORS.border;

      if (isMin) {
        priceBg = COLORS.green;
        priceFont = COLORS.greenFont;
        borderCol = COLORS.greenBorder;
      } else if (isMax) {
        priceBg = COLORS.red;
        priceFont = COLORS.redFont;
        borderCol = COLORS.redBorder;
      }

      const matBg = isMaterialVariant ? COLORS.orange : (isMin ? COLORS.green : isMax ? COLORS.red : COLORS.materialBg);
      const matFont = isMaterialVariant ? COLORS.orangeFont : (isMin ? COLORS.greenFont : isMax ? COLORS.redFont : COLORS.materialFont);

      styleCell(dataRow.getCell(base), {
        value: sd.material || '—',
        size: 9,
        fgColor: matBg,
        fontColor: matFont,
        bold: isMaterialVariant,
        borderColor: isMaterialVariant ? COLORS.orangeBorder : COLORS.border,
      });

      styleCell(dataRow.getCell(base + 1), {
        value: sd.associatedMaterials || '—',
        size: 8,
        italic: true,
        fgColor: colBg,
        fontColor: 'FF6B7280',
        wrap: true,
      });

      styleCell(dataRow.getCell(base + 2), {
        value: sd.quantity ?? '—',
        size: 9,
        fgColor: priceBg,
        fontColor: priceFont,
        align: 'center',
        borderColor: borderCol,
        numFmt: sd.quantity != null ? '#,##0.00' : undefined,
      });

      styleCell(dataRow.getCell(base + 3), {
        value: sd.unitPrice ?? null,
        size: 9,
        fgColor: priceBg,
        fontColor: priceFont,
        align: 'right',
        borderColor: borderCol,
        numFmt: '$#,##0.00',
      });

      styleCell(dataRow.getCell(base + 4), {
        value: sd.total ?? null,
        size: 9,
        bold: isMin || isMax,
        fgColor: priceBg,
        fontColor: priceFont,
        align: 'right',
        borderColor: borderCol,
        numFmt: '$#,##0.00',
      });
    }

    styleCell(dataRow.getCell(sumBase), {
      value: minTotal,
      size: 9,
      bold: true,
      fgColor: COLORS.green,
      fontColor: COLORS.greenFont,
      align: 'right',
      numFmt: '$#,##0.00',
      borderColor: COLORS.greenBorder,
    });

    styleCell(dataRow.getCell(sumBase + 1), {
      value: maxTotal,
      size: 9,
      bold: true,
      fgColor: COLORS.red,
      fontColor: COLORS.redFont,
      align: 'right',
      numFmt: '$#,##0.00',
      borderColor: COLORS.redBorder,
    });

    const variancePct =
      minTotal !== null && maxTotal !== null && minTotal > 0
        ? ((maxTotal - minTotal) / minTotal) * 100
        : null;

    const varBg =
      variancePct === null
        ? COLORS.totalBg
        : variancePct > 50
        ? COLORS.red
        : variancePct > 20
        ? COLORS.amber
        : COLORS.totalBg;
    const varFont =
      variancePct !== null && variancePct > 50
        ? COLORS.redFont
        : variancePct !== null && variancePct > 20
        ? COLORS.amberFont
        : COLORS.sectionBg;

    styleCell(dataRow.getCell(sumBase + 2), {
      value: variancePct !== null ? `${variancePct.toFixed(1)}%` : '—',
      size: 9,
      bold: variancePct !== null && variancePct > 20,
      fgColor: varBg,
      fontColor: varFont,
      align: 'center',
    });

    ws.getRow(rowNum).height = 20;
    rowNum++;
  });

  ws.views = [{ state: 'frozen', xSplit: SPEC_COLS, ySplit: 6 }];
  ws.autoFilter = {
    from: { row: 6, column: 1 },
    to: { row: 6, column: totalCols },
  };

  ws.mergeCells(rowNum + 1, 1, rowNum + 1, totalCols);
  styleCell(ws.getRow(rowNum + 1).getCell(1), {
    value: 'Legend:  Green = Lowest total for this spec group  |  Red = Highest total  |  Yellow = Not quoted  |  Orange = Material substitution (supplier used different material from most common)  |  Purple cell = Material identifier  |  Variance % triggers: >20% Amber, >50% Red',
    italic: true,
    size: 9,
    fgColor: 'FFF8FAFC',
    fontColor: 'FF64748B',
    align: 'left',
  });
  ws.getRow(rowNum + 1).height = 20;

  ws.mergeCells(rowNum + 2, 1, rowNum + 2, totalCols);
  styleCell(ws.getRow(rowNum + 2).getCell(1), {
    value: 'Generated by VerifyTrade — Professional Tender Management',
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

  ws.mergeCells('A1:I1');
  styleCell(ws.getCell('A1'), {
    value: 'MATERIAL SUBSTITUTION ANALYSIS',
    bold: true,
    size: 14,
    fgColor: COLORS.headerBg,
    fontColor: COLORS.headerFg,
    align: 'center',
  });
  ws.getRow(1).height = 30;

  ws.mergeCells('A2:I2');
  styleCell(ws.getCell('A2'), {
    value: 'Items where suppliers quoted different materials for the same specification group (same service + diameter + FRR). Review each for specification compliance and value engineering potential.',
    italic: true,
    size: 10,
    fgColor: COLORS.amber,
    fontColor: COLORS.amberFont,
    align: 'left',
    wrap: true,
  });
  ws.getRow(2).height = 22;

  ws.addRow([]);
  ws.getRow(3).height = 6;

  const headers = [
    'Service Type', 'Diameter', 'FRR', 'Item Description',
    'Canonical Material', 'Supplier', 'Quoted Material', 'Unit Rate', 'Assessment',
  ];
  const widths = [20, 12, 12, 32, 18, 22, 18, 12, 36];
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
  let substitutionsFound = 0;

  for (const group of groups) {
    const presentMaterials = supplierNames
      .map((n) => group.suppliers[n]?.material)
      .filter(Boolean);
    const materialFreq: Record<string, number> = {};
    for (const m of presentMaterials) {
      materialFreq[m] = (materialFreq[m] || 0) + 1;
    }
    const uniqueMaterials = Object.keys(materialFreq);
    if (uniqueMaterials.length <= 1) continue;

    const canonicalMat =
      Object.entries(materialFreq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '(unspecified)';

    for (const name of supplierNames) {
      const sd = group.suppliers[name];
      if (!sd?.hasData) continue;

      const isSubstitution =
        sd.material &&
        canonicalMat &&
        sd.material.toLowerCase() !== canonicalMat.toLowerCase();

      if (!isSubstitution && !sd.material) continue;

      substitutionsFound++;
      const row = ws.getRow(rowNum);
      const rowBg = isSubstitution ? COLORS.orange : COLORS.rowEven;

      const assessment = isSubstitution
        ? `SUBSTITUTION: ${name} quoted ${sd.material} instead of ${canonicalMat}. Verify performance equivalence and spec compliance before acceptance.`
        : `MATCHES canonical material (${canonicalMat}).`;

      [
        group.serviceType || '—',
        group.diameter || '—',
        group.frr || '—',
        group.canonicalDescription || '—',
        canonicalMat,
        name,
        sd.material || '—',
        sd.unitPrice,
        assessment,
      ].forEach((val, i) => {
        styleCell(row.getCell(i + 1), {
          value: typeof val === 'number' ? val : (val ?? '—'),
          size: i === 8 ? 9 : 10,
          fgColor: rowBg,
          align: i === 7 ? 'right' : 'left',
          numFmt: i === 7 ? '$#,##0.00' : undefined,
          bold: isSubstitution && i === 6,
          italic: i === 8,
          fontColor: isSubstitution && i === 6 ? COLORS.orangeFont : 'FF1F2937',
          wrap: i === 8 || i === 3,
          borderColor: isSubstitution ? COLORS.orangeBorder : COLORS.border,
        });
      });
      ws.getRow(rowNum).height = isSubstitution ? 30 : 20;
      rowNum++;
    }
  }

  if (substitutionsFound === 0) {
    ws.mergeCells('A5:I5');
    styleCell(ws.getCell('A5'), {
      value: 'No material substitutions detected — all suppliers quoted the same materials within each specification group.',
      italic: true,
      size: 10,
      fgColor: COLORS.green,
      fontColor: COLORS.greenFont,
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

  ws.mergeCells('A1:H1');
  styleCell(ws.getCell('A1'), {
    value: 'VALUE ENGINEERING OPPORTUNITIES',
    bold: true,
    size: 14,
    fgColor: COLORS.specHeaderBg,
    fontColor: COLORS.specHeaderFg,
    align: 'center',
  });
  ws.getRow(1).height = 30;

  ws.mergeCells('A2:H2');
  styleCell(ws.getCell('A2'), {
    value: 'Specification groups with >20% variance between lowest and highest supplier total. Flagged for tender negotiation, scope clarification, or value engineering review.',
    italic: true,
    size: 10,
    fgColor: COLORS.specBg,
    fontColor: COLORS.specFg,
    align: 'left',
    wrap: true,
  });
  ws.getRow(2).height = 22;

  ws.addRow([]);
  ws.getRow(3).height = 6;

  const headers = [
    'Service Type', 'Diameter', 'FRR', 'Item Description',
    'Min Total', 'Max Total', 'Variance %', 'VE Recommendation',
  ];
  const widths = [20, 12, 12, 34, 14, 14, 12, 40];
  headers.forEach((h, i) => {
    ws.getColumn(i + 1).width = widths[i];
    styleCell(ws.getRow(4).getCell(i + 1), {
      value: h,
      bold: true,
      size: 10,
      fgColor: COLORS.colHeaderBg,
      fontColor: COLORS.colHeaderFg,
      align: i >= 4 ? 'right' : 'center',
    });
  });
  ws.getRow(4).height = 26;

  type VEItem = {
    group: ComparisonGroup;
    minT: number;
    maxT: number;
    variance: number;
    lowestSupplier: string;
    highestSupplier: string;
    lowestMaterial: string;
    highestMaterial: string;
  };

  const veItems: VEItem[] = [];

  for (const group of groups) {
    const supplierTotals = supplierNames
      .map((n) => ({ name: n, sd: group.suppliers[n] }))
      .filter((x) => x.sd?.hasData && x.sd.total != null && x.sd.total > 0);

    if (supplierTotals.length < 2) continue;

    const sorted = supplierTotals.sort((a, b) => (a.sd.total ?? 0) - (b.sd.total ?? 0));
    const minEntry = sorted[0];
    const maxEntry = sorted[sorted.length - 1];
    const minT = minEntry.sd.total ?? 0;
    const maxT = maxEntry.sd.total ?? 0;
    const variance = minT > 0 ? ((maxT - minT) / minT) * 100 : 0;

    if (variance > 20) {
      veItems.push({
        group,
        minT,
        maxT,
        variance,
        lowestSupplier: minEntry.name,
        highestSupplier: maxEntry.name,
        lowestMaterial: minEntry.sd.material || '—',
        highestMaterial: maxEntry.sd.material || '—',
      });
    }
  }

  veItems.sort((a, b) => b.variance - a.variance);

  let rowNum = 5;
  for (const item of veItems) {
    const { group, minT, maxT, variance, lowestSupplier, highestSupplier, lowestMaterial, highestMaterial } = item;
    const isCritical = variance > 50;
    const rowBg = isCritical ? COLORS.red : COLORS.amber;
    const borderCol = isCritical ? COLORS.redBorder : COLORS.amberBorder;

    const materialNote =
      lowestMaterial !== highestMaterial && lowestMaterial !== '—' && highestMaterial !== '—'
        ? ` Note: ${lowestSupplier} quoted ${lowestMaterial}; ${highestSupplier} quoted ${highestMaterial} — material substitution may explain variance.`
        : '';

    const recommendation = `Award to ${lowestSupplier} ($${minT.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}) — saving $${(maxT - minT).toLocaleString('en-NZ', { minimumFractionDigits: 2 })} vs ${highestSupplier}.${materialNote}`;

    const row = ws.getRow(rowNum);
    [
      group.serviceType || '—',
      group.diameter || '—',
      group.frr || '—',
      group.canonicalDescription || '—',
      minT,
      maxT,
      `${variance.toFixed(1)}%`,
      recommendation,
    ].forEach((val, i) => {
      styleCell(row.getCell(i + 1), {
        value: typeof val === 'number' ? val : (val ?? '—'),
        size: i === 7 ? 9 : 10,
        fgColor: i >= 4 ? rowBg : COLORS.rowEven,
        fontColor: i >= 4 ? (isCritical ? COLORS.redFont : COLORS.amberFont) : 'FF1F2937',
        bold: i === 4 || i === 5 || i === 6,
        italic: i === 7,
        align: i >= 4 && i <= 6 ? 'right' : 'left',
        numFmt: i === 4 || i === 5 ? '$#,##0.00' : undefined,
        wrap: i === 7 || i === 3,
        borderColor: i >= 4 ? borderCol : COLORS.border,
      });
    });
    ws.getRow(rowNum).height = 32;
    rowNum++;
  }

  if (veItems.length === 0) {
    ws.mergeCells('A5:H5');
    styleCell(ws.getCell('A5'), {
      value: 'No significant value engineering opportunities detected — all specification group variances are within 20%.',
      italic: true,
      size: 10,
      fgColor: COLORS.green,
      fontColor: COLORS.greenFont,
      align: 'center',
    });
    ws.getRow(5).height = 24;
  } else {
    const totalSaving = veItems.reduce((acc, v) => acc + (v.maxT - v.minT), 0);
    ws.mergeCells(`A${rowNum + 1}:H${rowNum + 1}`);
    styleCell(ws.getRow(rowNum + 1).getCell(1), {
      value: `${veItems.length} specification group(s) flagged. Maximum potential saving if all awarded at lowest price: $${totalSaving.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      bold: true,
      size: 11,
      fgColor: COLORS.specBg,
      fontColor: COLORS.specFg,
      align: 'left',
    });
    ws.getRow(rowNum + 1).height = 26;
  }
}

async function buildSummaryTotalsSheet(
  workbook: ExcelJS.Workbook,
  groups: ComparisonGroup[],
  supplierNames: string[],
  projectName: string
): Promise<void> {
  const ws = workbook.addWorksheet('Summary Totals');

  ws.mergeCells(`A1:${getColLetter(supplierNames.length + 2)}1`);
  styleCell(ws.getCell('A1'), {
    value: `TENDER SUMMARY — ${projectName.toUpperCase()}`,
    bold: true,
    size: 14,
    fgColor: COLORS.headerBg,
    fontColor: COLORS.headerFg,
    align: 'center',
  });
  ws.getRow(1).height = 30;

  ws.mergeCells(`A2:${getColLetter(supplierNames.length + 2)}2`);
  styleCell(ws.getCell('A2'), {
    value: `Total tender value by supplier across all specification groups. Materials and scope may differ between suppliers — see Apples-to-Apples tab for detail.`,
    italic: true,
    size: 10,
    fgColor: COLORS.subHeaderBg,
    fontColor: COLORS.subHeaderFg,
    align: 'left',
  });
  ws.getRow(2).height = 20;

  ws.addRow([]);
  ws.getRow(3).height = 6;

  ws.getColumn(1).width = 22;
  supplierNames.forEach((_, i) => {
    ws.getColumn(i + 2).width = 18;
  });
  ws.getColumn(supplierNames.length + 2).width = 16;

  const hdrRow = ws.getRow(4);
  styleCell(hdrRow.getCell(1), {
    value: 'Service Type',
    bold: true,
    size: 10,
    fgColor: COLORS.specHeaderBg,
    fontColor: COLORS.specHeaderFg,
    align: 'center',
  });
  supplierNames.forEach((name, i) => {
    styleCell(hdrRow.getCell(i + 2), {
      value: name,
      bold: true,
      size: 10,
      fgColor: COLORS.colHeaderBg,
      fontColor: COLORS.colHeaderFg,
      align: 'center',
    });
  });
  styleCell(hdrRow.getCell(supplierNames.length + 2), {
    value: 'Lowest Total',
    bold: true,
    size: 10,
    fgColor: COLORS.green,
    fontColor: COLORS.greenFont,
    align: 'center',
  });
  ws.getRow(4).height = 26;

  const serviceGroups: Record<string, ComparisonGroup[]> = {};
  for (const g of groups) {
    const svc = g.serviceType || 'Unclassified';
    if (!serviceGroups[svc]) serviceGroups[svc] = [];
    serviceGroups[svc].push(g);
  }

  let rowNum = 5;
  const grandTotals: Record<string, number> = Object.fromEntries(supplierNames.map((n) => [n, 0]));

  for (const [svc, svcGroups] of Object.entries(serviceGroups)) {
    const svcTotals: Record<string, number> = Object.fromEntries(supplierNames.map((n) => [n, 0]));
    let allHaveData = false;

    for (const group of svcGroups) {
      for (const name of supplierNames) {
        const sd = group.suppliers[name];
        if (sd?.hasData && sd.total != null) {
          svcTotals[name] += sd.total;
          allHaveData = true;
        }
      }
    }

    if (!allHaveData) continue;

    const row = ws.getRow(rowNum);
    styleCell(row.getCell(1), {
      value: svc,
      bold: true,
      size: 10,
      fgColor: COLORS.specBg,
      fontColor: COLORS.specFg,
    });

    const presentTotals = supplierNames.map((n) => svcTotals[n]).filter((t) => t > 0);
    const minTotal = presentTotals.length > 0 ? Math.min(...presentTotals) : null;
    const maxTotal = presentTotals.length > 0 ? Math.max(...presentTotals) : null;

    supplierNames.forEach((name, i) => {
      const total = svcTotals[name];
      const isMin = total > 0 && total === minTotal && presentTotals.length > 1;
      const isMax = total > 0 && total === maxTotal && presentTotals.length > 1;
      styleCell(row.getCell(i + 2), {
        value: total > 0 ? total : null,
        size: 10,
        fgColor: isMin ? COLORS.green : isMax ? COLORS.red : COLORS.rowEven,
        fontColor: isMin ? COLORS.greenFont : isMax ? COLORS.redFont : 'FF374151',
        bold: isMin || isMax,
        align: 'right',
        numFmt: '$#,##0.00',
        borderColor: isMin ? COLORS.greenBorder : isMax ? COLORS.redBorder : COLORS.border,
      });
      if (total > 0) grandTotals[name] += total;
    });

    styleCell(row.getCell(supplierNames.length + 2), {
      value: minTotal,
      size: 10,
      bold: true,
      fgColor: COLORS.green,
      fontColor: COLORS.greenFont,
      align: 'right',
      numFmt: '$#,##0.00',
      borderColor: COLORS.greenBorder,
    });

    ws.getRow(rowNum).height = 22;
    rowNum++;
  }

  ws.mergeCells(rowNum, 1, rowNum, 1);
  const totalRow = ws.getRow(rowNum);
  styleCell(totalRow.getCell(1), {
    value: 'TOTAL TENDER VALUE',
    bold: true,
    size: 11,
    fgColor: COLORS.sectionBg,
    fontColor: COLORS.sectionFont,
  });

  const grandValues = supplierNames.map((n) => grandTotals[n]).filter((t) => t > 0);
  const grandMin = grandValues.length > 0 ? Math.min(...grandValues) : null;
  const grandMax = grandValues.length > 0 ? Math.max(...grandValues) : null;

  supplierNames.forEach((name, i) => {
    const total = grandTotals[name];
    const isMin = total > 0 && total === grandMin && grandValues.length > 1;
    const isMax = total > 0 && total === grandMax && grandValues.length > 1;
    styleCell(totalRow.getCell(i + 2), {
      value: total > 0 ? total : null,
      size: 11,
      bold: true,
      fgColor: isMin ? COLORS.green : isMax ? COLORS.red : COLORS.totalBg,
      fontColor: isMin ? COLORS.greenFont : isMax ? COLORS.redFont : COLORS.sectionBg,
      align: 'right',
      numFmt: '$#,##0.00',
      borderColor: isMin ? COLORS.greenBorder : isMax ? COLORS.redBorder : COLORS.border,
      borderStyle: 'medium',
    });
  });

  styleCell(totalRow.getCell(supplierNames.length + 2), {
    value: grandMin,
    size: 11,
    bold: true,
    fgColor: COLORS.green,
    fontColor: COLORS.greenFont,
    align: 'right',
    numFmt: '$#,##0.00',
    borderColor: COLORS.greenBorder,
    borderStyle: 'medium',
  });

  ws.getRow(rowNum).height = 28;

  if (grandMin !== null && grandMax !== null && grandMin > 0) {
    const saving = grandMax - grandMin;
    const savingPct = (saving / grandMax) * 100;
    ws.mergeCells(`A${rowNum + 2}:${getColLetter(supplierNames.length + 2)}${rowNum + 2}`);
    styleCell(ws.getRow(rowNum + 2).getCell(1), {
      value: `Potential saving by selecting lowest tender: $${saving.toLocaleString('en-NZ', { minimumFractionDigits: 2 })} (${savingPct.toFixed(1)}% below highest tender)`,
      bold: true,
      size: 11,
      fgColor: COLORS.green,
      fontColor: COLORS.greenFont,
      align: 'center',
    });
    ws.getRow(rowNum + 2).height = 26;
  }
}
