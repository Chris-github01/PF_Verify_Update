import ExcelJS from 'exceljs';
import type { BoqNormalisationResult, NormalizationAuditSummary } from '../../types/boqNormalisation.types';

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1E293B' },
};
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
const RISK_COLORS: Record<string, string> = {
  critical: 'FFEF4444',
  high: 'FFF97316',
  medium: 'FFEAB308',
  low: 'FF22C55E',
  safe: 'FF22C55E',
  none: 'FF64748B',
};

function styleHeader(sheet: ExcelJS.Worksheet, row: number) {
  const r = sheet.getRow(row);
  r.eachCell(cell => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FF334155' } },
    };
  });
  r.height = 28;
}

function addSummarySheet(wb: ExcelJS.Workbook, result: BoqNormalisationResult) {
  const sheet = wb.addWorksheet('Summary');
  sheet.columns = [
    { header: 'Supplier', key: 'supplier', width: 30 },
    { header: 'Trade', key: 'trade', width: 18 },
    { header: 'Raw Lines', key: 'rawLines', width: 12 },
    { header: 'Normalised Lines', key: 'normLines', width: 16 },
    { header: 'Raw Qty', key: 'rawQty', width: 12 },
    { header: 'Safe Qty', key: 'safeQty', width: 12 },
    { header: 'Qty At Risk', key: 'qtyRisk', width: 13 },
    { header: 'Raw Value ($)', key: 'rawVal', width: 16 },
    { header: 'Safe Value ($)', key: 'safeVal', width: 16 },
    { header: 'Value At Risk ($)', key: 'valRisk', width: 18 },
    { header: 'Dup Flags', key: 'dupFlags', width: 12 },
    { header: 'Overlap Flags', key: 'overlapFlags', width: 14 },
    { header: 'System Conflicts', key: 'sysConflicts', width: 16 },
    { header: 'Provisional Items', key: 'provCount', width: 17 },
    { header: 'Commercial Verdict', key: 'verdict', width: 50 },
    { header: 'Verdict Severity', key: 'severity', width: 16 },
  ];
  styleHeader(sheet, 1);

  for (const s of result.auditSummaries) {
    const row = sheet.addRow({
      supplier: s.supplierName,
      trade: s.trade,
      rawLines: s.rawLineCount,
      normLines: s.normalizedLineCount,
      rawQty: s.rawQuantityTotal,
      safeQty: s.safeQuantityTotal,
      qtyRisk: s.quantityAtRisk,
      rawVal: s.rawValueTotal,
      safeVal: s.safeValueTotal,
      valRisk: s.valueAtRisk,
      dupFlags: s.duplicateFlagsCount,
      overlapFlags: s.overlapFlagsCount,
      sysConflicts: s.systemConflictCount,
      provCount: s.provisionalCount,
      verdict: s.commercialVerdict,
      severity: s.verdictSeverity,
    });
    const color = RISK_COLORS[s.verdictSeverity] || RISK_COLORS.none;
    const severityCell = row.getCell('severity');
    severityCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
    severityCell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    const riskCell = row.getCell('valRisk');
    if (s.valueAtRisk > 0) riskCell.font = { color: { argb: 'FFEF4444' }, bold: true };
  }
}

function addNormalisedBoqSheet(wb: ExcelJS.Workbook, result: BoqNormalisationResult) {
  const sheet = wb.addWorksheet('Normalised BOQ');
  sheet.columns = [
    { header: 'Supplier ID', key: 'supplierId', width: 14 },
    { header: 'Canonical Description', key: 'desc', width: 45 },
    { header: 'Trade', key: 'trade', width: 18 },
    { header: 'Service', key: 'service', width: 22 },
    { header: 'Size', key: 'size', width: 12 },
    { header: 'FRL', key: 'frl', width: 12 },
    { header: 'Substrate', key: 'substrate', width: 22 },
    { header: 'Intent', key: 'intent', width: 18 },
    { header: 'Raw Qty', key: 'rawQty', width: 10 },
    { header: 'Safe Qty', key: 'safeQty', width: 10 },
    { header: 'Verified Qty', key: 'verQty', width: 12 },
    { header: 'Provisional Qty', key: 'provQty', width: 15 },
    { header: 'Optional Qty', key: 'optQty', width: 13 },
    { header: 'Dependency Qty', key: 'depQty', width: 15 },
    { header: 'Unit Rate ($)', key: 'rate', width: 14 },
    { header: 'Raw Value ($)', key: 'rawVal', width: 14 },
    { header: 'Safe Value ($)', key: 'safeVal', width: 14 },
    { header: 'Dup Risk', key: 'dupRisk', width: 12 },
    { header: 'Overlap Risk', key: 'overlapRisk', width: 13 },
    { header: 'Chosen System', key: 'system', width: 22 },
    { header: 'Alt Systems', key: 'altSystems', width: 22 },
    { header: 'Source Lines Count', key: 'srcCount', width: 18 },
    { header: 'Confidence', key: 'confidence', width: 12 },
    { header: 'Pricing Strategy', key: 'strategy', width: 20 },
  ];
  styleHeader(sheet, 1);

  for (const line of result.normalizedLines) {
    const row = sheet.addRow({
      supplierId: line.supplierId,
      desc: line.canonicalDescription,
      trade: line.trade,
      service: line.signature.service,
      size: line.signature.sizeNormalized,
      frl: line.signature.frlNormalized,
      substrate: line.signature.substrateNormalized,
      intent: line.intent,
      rawQty: line.quantityRawSum,
      safeQty: line.quantitySafe,
      verQty: line.quantityVerified,
      provQty: line.quantityProvisional,
      optQty: line.quantityOptional,
      depQty: line.quantityDependency,
      rate: line.rawUnitRate,
      rawVal: line.rawValueTotal,
      safeVal: line.safeValueTotal,
      dupRisk: line.duplicateRiskLevel,
      overlapRisk: line.overlapRiskLevel,
      system: line.chosenSystem,
      altSystems: line.alternativeSystems.join('; '),
      srcCount: line.includedSourceRefs.length + line.excludedSourceRefs.length,
      confidence: (line.confidence * 100).toFixed(0) + '%',
      strategy: line.pricingStrategyTag,
    });
    const riskColor = RISK_COLORS[line.duplicateRiskLevel] || RISK_COLORS.none;
    const riskCell = row.getCell('dupRisk');
    if (line.duplicateRiskLevel !== 'none') {
      riskCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: riskColor } };
      riskCell.font = { color: { argb: 'FFFFFFFF' } };
    }
  }
}

function addDuplicationFlagsSheet(wb: ExcelJS.Workbook, result: BoqNormalisationResult) {
  const sheet = wb.addWorksheet('Duplication Flags');
  sheet.columns = [
    { header: 'Flag ID', key: 'flagId', width: 20 },
    { header: 'Supplier ID', key: 'supplierId', width: 14 },
    { header: 'Severity', key: 'severity', width: 10 },
    { header: 'Flag Type', key: 'flagType', width: 28 },
    { header: 'Commercial Tag', key: 'tag', width: 38 },
    { header: 'Explanation', key: 'explanation', width: 55 },
    { header: 'Commercial Impact', key: 'impact', width: 40 },
    { header: 'Qty At Risk', key: 'qtyRisk', width: 13 },
    { header: 'Value At Risk ($)', key: 'valRisk', width: 16 },
    { header: 'Affected Items', key: 'items', width: 12 },
  ];
  styleHeader(sheet, 1);

  for (const flag of result.duplicationFlags) {
    const row = sheet.addRow({
      flagId: flag.flagId,
      supplierId: flag.supplierId,
      severity: flag.severity,
      flagType: flag.flagType,
      tag: flag.commercialTag,
      explanation: flag.explanation,
      impact: flag.commercialImpact,
      qtyRisk: flag.quantityAtRisk,
      valRisk: flag.valueAtRisk,
      items: flag.quoteItemIds.length,
    });
    const color = RISK_COLORS[flag.severity] || RISK_COLORS.none;
    const sevCell = row.getCell('severity');
    sevCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
    sevCell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    if (flag.valueAtRisk > 0) row.getCell('valRisk').font = { color: { argb: 'FFEF4444' }, bold: true };
  }
}

function addProvisionalSheet(wb: ExcelJS.Workbook, result: BoqNormalisationResult) {
  const sheet = wb.addWorksheet('Provisional Quantities');
  sheet.columns = [
    { header: 'Supplier ID', key: 'supplierId', width: 14 },
    { header: 'Description', key: 'desc', width: 45 },
    { header: 'Provisional Qty', key: 'provQty', width: 15 },
    { header: 'Provisional Value ($)', key: 'provVal', width: 20 },
    { header: 'Source Description', key: 'srcDesc', width: 45 },
    { header: 'Section', key: 'section', width: 20 },
  ];
  styleHeader(sheet, 1);
  for (const line of result.normalizedLines.filter(l => l.quantityProvisional > 0)) {
    const provRefs = line.excludedSourceRefs.filter(r =>
      r.sourceDescription.toLowerCase().includes('extra') ||
      r.sourceDescription.toLowerCase().includes('provisional') ||
      r.sourceDescription.toLowerCase().includes('not shown') ||
      r.sourceDescription.toLowerCase().includes('tbc')
    );
    for (const ref of provRefs) {
      sheet.addRow({
        supplierId: line.supplierId,
        desc: line.canonicalDescription,
        provQty: ref.rawQuantity,
        provVal: ref.rawTotal,
        srcDesc: ref.sourceDescription,
        section: ref.sourceSection,
      });
    }
  }
}

function addOptionalScopeSheet(wb: ExcelJS.Workbook, result: BoqNormalisationResult) {
  const sheet = wb.addWorksheet('Optional Scope');
  sheet.columns = [
    { header: 'Supplier ID', key: 'supplierId', width: 14 },
    { header: 'Description', key: 'desc', width: 45 },
    { header: 'Optional Qty', key: 'optQty', width: 13 },
    { header: 'Optional Value ($)', key: 'optVal', width: 18 },
    { header: 'Source Description', key: 'srcDesc', width: 45 },
  ];
  styleHeader(sheet, 1);
  for (const line of result.normalizedLines.filter(l => l.quantityOptional > 0)) {
    sheet.addRow({
      supplierId: line.supplierId,
      desc: line.canonicalDescription,
      optQty: line.quantityOptional,
      optVal: line.optionalValueTotal,
      srcDesc: line.excludedSourceRefs.map(r => r.sourceDescription).join('; '),
    });
  }
}

function addDependencyItemsSheet(wb: ExcelJS.Workbook, result: BoqNormalisationResult) {
  const sheet = wb.addWorksheet('Dependency Items');
  sheet.columns = [
    { header: 'Supplier ID', key: 'supplierId', width: 14 },
    { header: 'Description', key: 'desc', width: 45 },
    { header: 'Dependency Qty', key: 'depQty', width: 15 },
    { header: 'Dependency Value ($)', key: 'depVal', width: 20 },
    { header: 'Has Parent Penetration', key: 'hasParent', width: 22 },
    { header: 'Insulation State', key: 'insState', width: 18 },
  ];
  styleHeader(sheet, 1);
  for (const line of result.normalizedLines.filter(l => l.quantityDependency > 0)) {
    sheet.addRow({
      supplierId: line.supplierId,
      desc: line.canonicalDescription,
      depQty: line.quantityDependency,
      depVal: line.dependencyValueTotal,
      hasParent: line.quantityVerified > 0 ? 'Yes' : 'No',
      insState: line.signature.insulationState,
    });
  }
}

function addSourceTraceSheet(wb: ExcelJS.Workbook, result: BoqNormalisationResult) {
  const sheet = wb.addWorksheet('Source Trace');
  sheet.columns = [
    { header: 'Normalised Line ID', key: 'lineId', width: 22 },
    { header: 'Supplier ID', key: 'supplierId', width: 14 },
    { header: 'Canonical Description', key: 'desc', width: 40 },
    { header: 'Included/Excluded', key: 'status', width: 18 },
    { header: 'Source Description', key: 'srcDesc', width: 45 },
    { header: 'Section', key: 'section', width: 20 },
    { header: 'Raw Qty', key: 'qty', width: 10 },
    { header: 'Unit Rate ($)', key: 'rate', width: 14 },
    { header: 'Raw Total ($)', key: 'total', width: 14 },
    { header: 'Quote Item ID', key: 'itemId', width: 28 },
    { header: 'Reasoning', key: 'reasoning', width: 55 },
  ];
  styleHeader(sheet, 1);

  for (const line of result.normalizedLines) {
    const reasoning = line.reasoning.join(' | ');
    for (const ref of line.includedSourceRefs) {
      const row = sheet.addRow({
        lineId: line.normalizedLineId,
        supplierId: line.supplierId,
        desc: line.canonicalDescription,
        status: 'INCLUDED',
        srcDesc: ref.sourceDescription,
        section: ref.sourceSection,
        qty: ref.rawQuantity,
        rate: ref.rawUnitRate,
        total: ref.rawTotal,
        itemId: ref.quoteItemId,
        reasoning,
      });
      row.getCell('status').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF22C55E' } };
      row.getCell('status').font = { color: { argb: 'FFFFFFFF' }, bold: true };
    }
    for (const ref of line.excludedSourceRefs) {
      const row = sheet.addRow({
        lineId: line.normalizedLineId,
        supplierId: line.supplierId,
        desc: line.canonicalDescription,
        status: 'EXCLUDED',
        srcDesc: ref.sourceDescription,
        section: ref.sourceSection,
        qty: ref.rawQuantity,
        rate: ref.rawUnitRate,
        total: ref.rawTotal,
        itemId: ref.quoteItemId,
        reasoning,
      });
      row.getCell('status').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEF4444' } };
      row.getCell('status').font = { color: { argb: 'FFFFFFFF' }, bold: true };
    }
  }
}

export async function exportBoqNormalisationExcel(result: BoqNormalisationResult): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'VerifyTrade BOQ Normalisation Engine';
  wb.created = new Date();

  addSummarySheet(wb, result);
  addNormalisedBoqSheet(wb, result);
  addDuplicationFlagsSheet(wb, result);
  addProvisionalSheet(wb, result);
  addOptionalScopeSheet(wb, result);
  addDependencyItemsSheet(wb, result);
  addSourceTraceSheet(wb, result);

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `BOQ-Normalisation-Audit-${result.trade}-${new Date().toISOString().split('T')[0]}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
