import ExcelJS from 'exceljs';
import type { QuantityIntelligenceResult } from './quantityScoring';
import type { MatchedLineGroup } from './lineMatcher';
import type { ReferenceQuantityResult } from './referenceQuantityEngine';
import type { ScoredSupplier } from './quantityScoring';

function fmtCurrency(v: number | null | undefined): string {
  if (v == null) return '';
  return v.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtQty(v: number | null | undefined): string | number {
  if (v == null) return '';
  return v % 1 === 0 ? v : parseFloat(v.toFixed(3));
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return '';
  return `${v.toFixed(1)}%`;
}

function referenceMethodLabel(m: string): string {
  const labels: Record<string, string> = {
    median_supplier_qty: 'Median of all suppliers',
    highest_supplier_qty: 'Highest of 2 suppliers',
    benchmark_qty: 'Benchmark reference',
    manual_override: 'Manual override',
    inconclusive: 'Inconclusive — review required',
  };
  return labels[m] ?? m;
}

function commercialRecommendation(s: ScoredSupplier, allSuppliers: ScoredSupplier[]): string {
  const recommendations: string[] = [];

  if (s.rawRank === 1 && s.normalizedRank === 1) {
    recommendations.push('Cheapest on both raw and normalized comparison');
  } else if (s.rawRank === 1) {
    recommendations.push('Cheapest on raw total only');
  } else if (s.normalizedRank === 1) {
    recommendations.push('Cheapest on normalized (equal-quantity) comparison');
  }

  if (s.underallowanceFlag) {
    recommendations.push('Under-allowed quantities detected — review before award');
  }

  if (s.normalizedRank < s.rawRank) {
    recommendations.push(`Rises ${s.rawRank - s.normalizedRank} place(s) after quantity normalization`);
  } else if (s.normalizedRank > s.rawRank) {
    recommendations.push(`Drops ${s.normalizedRank - s.rawRank} place(s) after quantity normalization`);
  }

  if (s.completenessScore < 70) {
    recommendations.push('Low completeness score — significant scope gaps likely');
  }

  if (recommendations.length === 0) return 'No specific flags';
  return recommendations.join('; ');
}

function styleHeader(row: ExcelJS.Row, bgColor = 'FF1F2937') {
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FF374151' } },
    };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  row.height = 32;
}

function styleSubHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111827' } };
    cell.font = { bold: true, color: { argb: 'FF9CA3AF' }, size: 9 };
  });
  row.height = 22;
}

function flagCell(cell: ExcelJS.Cell, severity: 'red' | 'amber' | 'green' | 'blue' | 'none') {
  const colors: Record<string, string> = {
    red: 'FFFEF2F2',
    amber: 'FFFEFCE8',
    green: 'FFF0FDF4',
    blue: 'FFEFF6FF',
    none: 'FFFFFFFF',
  };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors[severity] } };
}

export async function exportQuantityIntelligenceExcel(
  result: QuantityIntelligenceResult,
  filename?: string,
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'VerifyPlus';
  wb.created = new Date();

  const suppliers = result.suppliers;
  const groups: MatchedLineGroup[] = Array.isArray(result.matchedGroups) ? result.matchedGroups : [];
  const refs = result.referenceResults instanceof Map ? result.referenceResults : new Map<string, ReferenceQuantityResult>();

  const rawCheapest = [...suppliers].sort((a, b) => a.rawRank - b.rawRank)[0];
  const normCheapest = [...suppliers].sort((a, b) => a.normalizedRank - b.normalizedRank)[0];
  const underallowed = suppliers.filter((s) => s.underallowanceFlag);

  const inconclusiveCount = [...refs.values()].filter((r) => r.referenceMethod === 'inconclusive').length;
  const majorVarianceLines = [...refs.values()].filter((r) => (r.quantitySpreadPercent ?? 0) >= 30);

  const DISCLAIMER = 'Reference quantities are for fair commercial comparison only and do not modify supplier submissions.';

  buildSheet1(wb, suppliers, refs, groups, rawCheapest, normCheapest, underallowed, inconclusiveCount, majorVarianceLines.length, DISCLAIMER);
  buildSheet2(wb, groups, refs, suppliers, DISCLAIMER);
  buildSheet3(wb, groups, refs, suppliers, DISCLAIMER);
  buildSheet4(wb, groups, refs, suppliers, DISCLAIMER);

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  a.download = filename ?? `Quantity_Intelligence_Comparison_${date}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function buildSheet1(
  wb: ExcelJS.Workbook,
  suppliers: ScoredSupplier[],
  refs: Map<string, ReferenceQuantityResult>,
  groups: MatchedLineGroup[],
  rawCheapest: ScoredSupplier | undefined,
  normCheapest: ScoredSupplier | undefined,
  underallowed: ScoredSupplier[],
  inconclusiveCount: number,
  majorVarianceCount: number,
  disclaimer: string,
) {
  const ws = wb.addWorksheet('Executive Summary', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1 };

  ws.columns = [
    { key: 'label', width: 32 },
    { key: 'val', width: 48 },
  ];

  const titleRow = ws.addRow(['QUANTITY INTELLIGENCE — EXECUTIVE SUMMARY', '']);
  titleRow.font = { bold: true, size: 14, color: { argb: 'FF0D9488' } };
  titleRow.height = 28;

  ws.addRow([disclaimer, '']).font = { italic: true, size: 9, color: { argb: 'FF6B7280' } };
  ws.addRow(['', '']);

  const metaRows = [
    ['Suppliers compared', suppliers.length.toString()],
    ['Matched line items', groups.length.toString()],
    ['Lines with major quantity variance (>30%)', majorVarianceCount.toString()],
    ['Lines with inconclusive reference quantity', inconclusiveCount.toString()],
    ['Cheapest on raw quoted total', rawCheapest?.supplierName ?? '—'],
    ['Cheapest on normalized (equal-quantity) basis', normCheapest?.supplierName ?? '—'],
    ['Suppliers flagged for under-allowance', underallowed.length > 0 ? underallowed.map((s) => s.supplierName).join(', ') : 'None'],
  ];

  for (const [label, value] of metaRows) {
    const row = ws.addRow([label, value]);
    row.getCell(1).font = { color: { argb: 'FF9CA3AF' }, size: 10 };
    row.getCell(2).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    row.eachCell((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111827' } };
    });
    row.height = 18;
  }

  ws.addRow(['', '']);

  const headerRow = ws.addRow([
    'Supplier Name', 'Raw Quoted Total', 'Normalized Total',
    'Quantity Gap Value', 'Raw Rank', 'Normalized Rank',
    'Completeness Score', 'Under-Allowance Flag', 'Commercial Recommendation',
  ]);
  styleHeader(headerRow, 'FF0D9488');

  ws.columns = [
    { key: 'c1', width: 28 },
    { key: 'c2', width: 18 },
    { key: 'c3', width: 18 },
    { key: 'c4', width: 18 },
    { key: 'c5', width: 10 },
    { key: 'c6', width: 12 },
    { key: 'c7', width: 16 },
    { key: 'c8', width: 16 },
    { key: 'c9', width: 52 },
  ];

  for (const s of [...suppliers].sort((a, b) => a.normalizedRank - b.normalizedRank)) {
    const row = ws.addRow([
      s.supplierName,
      fmtCurrency(s.rawTotal),
      fmtCurrency(s.normalizedTotal),
      s.quantityGapValue > 0 ? fmtCurrency(s.quantityGapValue) : '—',
      `#${s.rawRank}`,
      `#${s.normalizedRank}`,
      `${s.completenessScore.toFixed(0)}/100`,
      s.underallowanceFlag ? 'YES — Review' : 'No',
      commercialRecommendation(s, suppliers),
    ]);

    row.height = 20;

    const flagSev = s.underallowanceFlag ? 'red' : s.normalizedRank === 1 ? 'green' : 'none';
    row.eachCell((cell) => {
      flagCell(cell, flagSev);
      cell.font = { size: 10 };
    });

    if (s.underallowanceFlag) {
      row.getCell(8).font = { bold: true, color: { argb: 'FFB91C1C' }, size: 10 };
    }
    if (s.normalizedRank === 1) {
      row.getCell(2).font = { bold: true, size: 10 };
      row.getCell(3).font = { bold: true, size: 10 };
    }
  }

  ws.addRow(['', '', '', '', '', '', '', '', '']);
  ws.addRow(['Reference Quantity for Fair Comparison', disclaimer])
    .font = { italic: true, color: { argb: 'FF6B7280' }, size: 9 };
}

function buildSheet2(
  wb: ExcelJS.Workbook,
  groups: MatchedLineGroup[],
  refs: Map<string, ReferenceQuantityResult>,
  suppliers: ScoredSupplier[],
  disclaimer: string,
) {
  const ws = wb.addWorksheet('Line Quantity Comparison', {
    views: [{ state: 'frozen', ySplit: 2 }],
  });

  const supplierNames = suppliers.map((s) => s.supplierName);

  const columns: Partial<ExcelJS.Column>[] = [
    { width: 42 },
    { width: 8 },
    ...supplierNames.map(() => ({ width: 14 }) as Partial<ExcelJS.Column>),
    { width: 14 },
    { width: 14 },
    { width: 20 },
    { width: 22 },
    { width: 10 },
    { width: 14 },
    { width: 36 },
  ];
  ws.columns = columns;

  const disclaimerRow = ws.addRow([disclaimer]);
  disclaimerRow.font = { italic: true, size: 9, color: { argb: 'FF6B7280' } };

  const headerValues = [
    'Canonical Item', 'Unit',
    ...supplierNames,
    'Highest Qty', 'Lowest Qty',
    'Reference Quantity for Fair Comparison',
    'Reference Method',
    'Spread %',
    'Outlier Flag',
    'Notes',
  ];
  const headerRow = ws.addRow(headerValues);
  styleHeader(headerRow);

  const safeGroups = Array.isArray(groups) ? groups : [];

  for (const g of safeGroups) {
    const ref = refs.get(g.normalizedKey);
    const refQty = ref?.referenceQuantity ?? null;
    const spread = ref?.quantitySpreadPercent ?? null;
    const outlierSev = ref?.outlierSeverity ?? 'none';

    const supplierQtys = supplierNames.map((name) => {
      const sv = g.supplierValues.find((v) => v.supplierName === name);
      return sv?.quantity ?? null;
    });

    const validQtys = supplierQtys.filter((q): q is number => q !== null);
    const highest = validQtys.length > 0 ? Math.max(...validQtys) : null;
    const lowest = validQtys.length > 0 ? Math.min(...validQtys) : null;

    const rowValues: (string | number)[] = [
      g.canonicalDescription,
      g.unit,
      ...supplierQtys.map((q) => fmtQty(q)),
      fmtQty(highest),
      fmtQty(lowest),
      fmtQty(refQty),
      ref ? referenceMethodLabel(ref.referenceMethod) : '—',
      spread !== null ? parseFloat(spread.toFixed(1)) : '',
      outlierSev !== 'none' ? outlierSev.toUpperCase() : '—',
      ref?.notes ?? '',
    ];

    const row = ws.addRow(rowValues);
    row.height = 18;
    row.getCell(1).font = { size: 10 };
    row.getCell(1).alignment = { wrapText: true };

    for (let i = 0; i < supplierNames.length; i++) {
      const qty = supplierQtys[i];
      const cell = row.getCell(3 + i);
      if (qty !== null && refQty !== null) {
        const ratio = qty / refQty;
        if (ratio < 0.85) {
          flagCell(cell, 'red');
          cell.font = { bold: true, color: { argb: 'FFB91C1C' }, size: 10 };
        } else if (ratio > 1.20) {
          flagCell(cell, 'blue');
        }
      }
    }

    if (outlierSev === 'major') {
      const spreadCell = row.getCell(3 + supplierNames.length + 4);
      flagCell(spreadCell, 'red');
      spreadCell.font = { bold: true, size: 10 };
    } else if (outlierSev === 'review') {
      const spreadCell = row.getCell(3 + supplierNames.length + 4);
      flagCell(spreadCell, 'amber');
    }
  }

  ws.addRow(['']);
  ws.addRow([disclaimer]).font = { italic: true, size: 9, color: { argb: 'FF6B7280' } };
}

function buildSheet3(
  wb: ExcelJS.Workbook,
  groups: MatchedLineGroup[],
  refs: Map<string, ReferenceQuantityResult>,
  suppliers: ScoredSupplier[],
  disclaimer: string,
) {
  const ws = wb.addWorksheet('Normalized Pricing Comparison', {
    views: [{ state: 'frozen', ySplit: 2 }],
  });

  const supplierNames = suppliers.map((s) => s.supplierName);

  const supplierCols: Partial<ExcelJS.Column>[] = supplierNames.flatMap(() => [
    { width: 14 },
    { width: 14 },
    { width: 18 },
  ]);

  ws.columns = [
    { width: 42 },
    { width: 20 },
    ...supplierCols,
    { width: 26 },
    { width: 18 },
  ];

  const disclaimerRow = ws.addRow([disclaimer]);
  disclaimerRow.font = { italic: true, size: 9, color: { argb: 'FF6B7280' } };

  const subHeaders: string[] = ['Canonical Item', 'Reference Quantity'];
  for (const name of supplierNames) {
    subHeaders.push(`${name} — Unit Rate`, `${name} — Raw Qty`, `${name} — Normalized Value`);
  }
  subHeaders.push('Cheapest on Equal Qty Basis', 'Delta to Cheapest');

  const headerRow = ws.addRow(subHeaders);
  styleHeader(headerRow);

  const safeGroups = Array.isArray(groups) ? groups : [];

  for (const g of safeGroups) {
    const ref = refs.get(g.normalizedKey);
    const refQty = ref?.referenceQuantity ?? null;

    const supplierData = supplierNames.map((name) => {
      const sv = g.supplierValues.find((v) => v.supplierName === name);
      const unitRate = sv?.unitRate ?? null;
      const rawQty = sv?.quantity ?? null;
      const normVal = refQty !== null && unitRate !== null ? refQty * unitRate : null;
      return { unitRate, rawQty, normVal };
    });

    const normVals = supplierData.map((d) => d.normVal).filter((v): v is number => v !== null);
    const cheapestNormVal = normVals.length > 0 ? Math.min(...normVals) : null;

    let cheapestSupplier = '—';
    if (cheapestNormVal !== null) {
      const idx = supplierData.findIndex((d) => d.normVal === cheapestNormVal);
      if (idx >= 0) cheapestSupplier = supplierNames[idx];
    }

    const rowValues: (string | number)[] = [
      g.canonicalDescription,
      fmtQty(refQty),
    ];

    for (const d of supplierData) {
      rowValues.push(
        d.unitRate != null ? parseFloat(d.unitRate.toFixed(4)) : 'No rate',
        fmtQty(d.rawQty),
        d.normVal != null ? parseFloat(d.normVal.toFixed(2)) : 'Inconclusive',
      );
    }

    rowValues.push(cheapestSupplier);

    if (cheapestNormVal !== null) {
      const secondLowest = normVals.sort((a, b) => a - b)[1];
      rowValues.push(secondLowest != null ? parseFloat((secondLowest - cheapestNormVal).toFixed(2)) : '—');
    } else {
      rowValues.push('—');
    }

    const row = ws.addRow(rowValues);
    row.height = 18;
    row.getCell(1).alignment = { wrapText: true };

    for (let i = 0; i < supplierData.length; i++) {
      const d = supplierData[i];
      const normCell = row.getCell(3 + i * 3 + 2);
      if (d.normVal !== null && cheapestNormVal !== null) {
        if (d.normVal === cheapestNormVal) {
          flagCell(normCell, 'green');
          normCell.font = { bold: true, size: 10 };
        } else if (d.normVal > cheapestNormVal * 1.1) {
          flagCell(normCell, 'amber');
        }
      } else if (d.normVal === null) {
        normCell.font = { italic: true, color: { argb: 'FF9CA3AF' }, size: 10 };
      }
    }
  }

  ws.addRow(['']);
  ws.addRow([disclaimer]).font = { italic: true, size: 9, color: { argb: 'FF6B7280' } };
}

function buildSheet4(
  wb: ExcelJS.Workbook,
  groups: MatchedLineGroup[],
  refs: Map<string, ReferenceQuantityResult>,
  suppliers: ScoredSupplier[],
  disclaimer: string,
) {
  const ws = wb.addWorksheet('Exceptions & Manual Review', {
    views: [{ state: 'frozen', ySplit: 2 }],
  });

  ws.columns = [
    { width: 42 },
    { width: 22 },
    { width: 22 },
    { width: 40 },
    { width: 40 },
  ];

  const disclaimerRow = ws.addRow([disclaimer]);
  disclaimerRow.font = { italic: true, size: 9, color: { argb: 'FF6B7280' } };

  const headerRow = ws.addRow([
    'Canonical Item', 'Issue Type', 'Supplier Affected', 'Explanation', 'Recommended Review Action',
  ]);
  styleHeader(headerRow, 'FF7C3AED');

  const safeGroups = Array.isArray(groups) ? groups : [];
  let rowCount = 0;

  for (const g of safeGroups) {
    const ref = refs.get(g.normalizedKey);
    const refQty = ref?.referenceQuantity ?? null;
    const spread = ref?.quantitySpreadPercent ?? null;
    const outlierSev = ref?.outlierSeverity ?? 'none';

    if (ref?.referenceMethod === 'inconclusive') {
      const row = ws.addRow([
        g.canonicalDescription,
        'Inconclusive reference quantity',
        'All suppliers',
        'Reference quantity could not be reliably derived from available supplier data.',
        'Manually review and confirm scope coverage with each supplier.',
      ]);
      row.height = 36;
      row.eachCell((c) => { flagCell(c, 'amber'); c.alignment = { wrapText: true }; });
      rowCount++;
    }

    if (outlierSev === 'major' && spread !== null) {
      const row = ws.addRow([
        g.canonicalDescription,
        `Major quantity variance (${fmtPct(spread)})`,
        'Multiple',
        `Spread of ${fmtPct(spread)} between highest and lowest supplier quantity exceeds the 30% major variance threshold.`,
        'Clarify scope coverage with all suppliers before award.',
      ]);
      row.height = 36;
      row.eachCell((c) => { flagCell(c, 'red'); c.alignment = { wrapText: true }; });
      rowCount++;
    } else if (outlierSev === 'review' && spread !== null) {
      const row = ws.addRow([
        g.canonicalDescription,
        `Quantity spread requiring review (${fmtPct(spread)})`,
        'Multiple',
        `Spread of ${fmtPct(spread)} between suppliers exceeds the 15% review threshold.`,
        'Issue RFI to clarify scope interpretation.',
      ]);
      row.height = 36;
      row.eachCell((c) => { flagCell(c, 'amber'); c.alignment = { wrapText: true }; });
      rowCount++;
    }

    if (refQty !== null) {
      for (const sv of g.supplierValues) {
        if (sv.quantity === null) continue;
        const ratio = sv.quantity / refQty;
        if (ratio < 0.85) {
          const pctBelow = ((1 - ratio) * 100).toFixed(1);
          const row = ws.addRow([
            g.canonicalDescription,
            'Under-allowed quantity (<85% of reference)',
            sv.supplierName,
            `${sv.supplierName} allowed ${fmtQty(sv.quantity)} ${g.unit} vs. reference quantity of ${fmtQty(refQty)} ${g.unit} (${pctBelow}% below reference).`,
            'Obtain written confirmation this supplier has included full scope. Do not award without clarification.',
          ]);
          row.height = 36;
          row.eachCell((c) => { flagCell(c, 'red'); c.alignment = { wrapText: true }; });
          row.getCell(2).font = { bold: true, color: { argb: 'FFB91C1C' }, size: 10 };
          rowCount++;
        } else if (ratio > 1.20) {
          const pctAbove = ((ratio - 1) * 100).toFixed(1);
          const row = ws.addRow([
            g.canonicalDescription,
            'Over-allowed quantity (>120% of reference)',
            sv.supplierName,
            `${sv.supplierName} allowed ${fmtQty(sv.quantity)} ${g.unit} vs. reference of ${fmtQty(refQty)} ${g.unit} (${pctAbove}% above reference).`,
            'Verify this is not a double-count or pricing error before award.',
          ]);
          row.height = 36;
          row.eachCell((c) => { flagCell(c, 'blue'); c.alignment = { wrapText: true }; });
          rowCount++;
        }
      }
    }

    if (g.matchConfidence < 0.75) {
      const row = ws.addRow([
        g.canonicalDescription,
        `Weak match confidence (${(g.matchConfidence * 100).toFixed(0)}%)`,
        'Multiple',
        `This line was matched using fuzzy description matching with only ${(g.matchConfidence * 100).toFixed(0)}% confidence. Descriptions may refer to different scope items.`,
        'Verify that matched suppliers are pricing the same scope item.',
      ]);
      row.height = 36;
      row.eachCell((c) => { flagCell(c, 'amber'); c.alignment = { wrapText: true }; });
      rowCount++;
    }
  }

  if (rowCount === 0) {
    const row = ws.addRow(['No exceptions flagged', '', '', 'All matched lines are within acceptable quantity thresholds.', '']);
    row.font = { color: { argb: 'FF6B7280' }, size: 10 };
  }

  ws.addRow(['']);
  ws.addRow([disclaimer]).font = { italic: true, size: 9, color: { argb: 'FF6B7280' } };
}
