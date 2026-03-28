import type {
  NormalizedPenetrationLine,
  DuplicationFlag,
  FlagSeverity,
  DuplicationFlagType,
  CommercialTag,
  NormalizationAuditSummary,
} from '../../types/boqNormalisation.types';

let flagCounter = 0;
function genFlagId(): string {
  return `flag-${Date.now()}-${++flagCounter}`;
}

export function buildDuplicationFlags(
  lines: NormalizedPenetrationLine[],
  supplierId: string
): DuplicationFlag[] {
  const flags: DuplicationFlag[] = [];

  for (const line of lines) {
    if (line.duplicateRiskLevel === 'high' || line.duplicateRiskLevel === 'critical') {
      const severity: FlagSeverity = line.duplicateRiskLevel === 'critical' ? 'critical' : 'high';
      const qtyAtRisk = line.quantityRawSum - line.quantitySafe;
      const valueAtRisk = line.rawValueTotal - line.safeValueTotal;
      flags.push({
        flagId: genFlagId(),
        supplierId,
        severity,
        flagType: 'duplicate_signature' as DuplicationFlagType,
        commercialTag: 'Likely double count' as CommercialTag,
        normalizedLineId: line.normalizedLineId,
        signatureKey: line.signatureKey,
        quoteItemIds: line.includedSourceRefs.concat(line.excludedSourceRefs).map(r => r.quoteItemId),
        explanation: `Multiple lines share the same penetration signature for "${line.canonicalDescription}". Raw qty: ${line.quantityRawSum}, Safe qty: ${line.quantitySafe}. Potential double count detected.`,
        commercialImpact: `Quantity at risk: ${qtyAtRisk.toFixed(1)} units. Value at risk: $${valueAtRisk.toFixed(0)}.`,
        quantityAtRisk: qtyAtRisk,
        valueAtRisk,
        affectedSourceLines: line.includedSourceRefs.concat(line.excludedSourceRefs),
      });
    }

    if (line.duplicateRiskLevel === 'medium' && line.overlapRiskLevel !== 'none') {
      const qtyAtRisk = line.quantityRawSum - line.quantitySafe;
      const valueAtRisk = line.rawValueTotal - line.safeValueTotal;
      flags.push({
        flagId: genFlagId(),
        supplierId,
        severity: 'medium',
        flagType: 'subset_overlap_unit_entry' as DuplicationFlagType,
        commercialTag: 'Potential subset overlap' as CommercialTag,
        normalizedLineId: line.normalizedLineId,
        signatureKey: line.signatureKey,
        quoteItemIds: line.excludedSourceRefs.map(r => r.quoteItemId),
        explanation: `Unit entry quantities may be a subset of general penetration counts for "${line.canonicalDescription}". Unit entry lines were excluded from safe BOQ to prevent double counting.`,
        commercialImpact: `Overlap risk — potential qty at risk: ${qtyAtRisk.toFixed(1)}.`,
        quantityAtRisk: qtyAtRisk,
        valueAtRisk,
        affectedSourceLines: line.excludedSourceRefs,
      });
    }

    if (line.quantityProvisional > 0) {
      flags.push({
        flagId: genFlagId(),
        supplierId,
        severity: 'medium',
        flagType: 'provisional_extra_not_merged' as DuplicationFlagType,
        commercialTag: 'Provisional add-on outside safe BOQ' as CommercialTag,
        normalizedLineId: line.normalizedLineId,
        signatureKey: line.signatureKey,
        quoteItemIds: line.excludedSourceRefs.filter(r => r.sourceDescription.toLowerCase().includes('extra') || r.sourceDescription.toLowerCase().includes('provisional') || r.sourceDescription.toLowerCase().includes('not shown')).map(r => r.quoteItemId),
        explanation: `Provisional/extra-over quantities (${line.quantityProvisional} units) for "${line.canonicalDescription}" excluded from safe BOQ. These quantities sit outside the verifiable base scope.`,
        commercialImpact: `Provisional loading: $${line.provisionalValueTotal.toFixed(0)} sits outside the safe comparable base.`,
        quantityAtRisk: line.quantityProvisional,
        valueAtRisk: line.provisionalValueTotal,
        affectedSourceLines: line.excludedSourceRefs,
      });
    }

    if (line.quantityOptional > 0) {
      flags.push({
        flagId: genFlagId(),
        supplierId,
        severity: 'low',
        flagType: 'optional_scope_excluded' as DuplicationFlagType,
        commercialTag: 'Optional scope excluded' as CommercialTag,
        normalizedLineId: line.normalizedLineId,
        signatureKey: line.signatureKey,
        quoteItemIds: line.excludedSourceRefs.map(r => r.quoteItemId),
        explanation: `Optional scope (${line.quantityOptional} units, $${line.optionalValueTotal.toFixed(0)}) for "${line.canonicalDescription}" has been separated from the safe base BOQ.`,
        commercialImpact: `Optional scope value: $${line.optionalValueTotal.toFixed(0)}. Must not sit in comparable base totals.`,
        quantityAtRisk: line.quantityOptional,
        valueAtRisk: line.optionalValueTotal,
        affectedSourceLines: line.excludedSourceRefs,
      });
    }

    if (line.quantityDependency > 0 && line.quantityVerified === 0) {
      flags.push({
        flagId: genFlagId(),
        supplierId,
        severity: 'medium',
        flagType: 'dependency_without_parent' as DuplicationFlagType,
        commercialTag: 'Standalone dependency item' as CommercialTag,
        normalizedLineId: line.normalizedLineId,
        signatureKey: line.signatureKey,
        quoteItemIds: line.excludedSourceRefs.map(r => r.quoteItemId),
        explanation: `Insulation/dependency item "${line.canonicalDescription}" has no confirmed parent penetration. Value $${line.dependencyValueTotal.toFixed(0)} cannot be verified.`,
        commercialImpact: `Dependency without parent — $${line.dependencyValueTotal.toFixed(0)} at risk of being unverifiable.`,
        quantityAtRisk: line.quantityDependency,
        valueAtRisk: line.dependencyValueTotal,
        affectedSourceLines: line.excludedSourceRefs,
      });
    }

    if (line.alternativeSystems.length > 0) {
      flags.push({
        flagId: genFlagId(),
        supplierId,
        severity: 'low',
        flagType: 'system_conflict' as DuplicationFlagType,
        commercialTag: 'Alternative system pricing on same penetration' as CommercialTag,
        normalizedLineId: line.normalizedLineId,
        signatureKey: line.signatureKey,
        quoteItemIds: line.includedSourceRefs.map(r => r.quoteItemId),
        explanation: `Multiple tested systems detected for "${line.canonicalDescription}". Primary: "${line.chosenSystem}". Alternatives: [${line.alternativeSystems.join(', ')}]. Counted once.`,
        commercialImpact: 'System conflict — verify which system is tendered. Alternative systems may carry different warranty/compliance obligations.',
        quantityAtRisk: 0,
        valueAtRisk: 0,
        affectedSourceLines: line.includedSourceRefs,
      });
    }
  }

  return flags;
}

export function buildAuditSummary(
  supplierId: string,
  supplierName: string,
  trade: string,
  rawLineCount: number,
  lines: NormalizedPenetrationLine[],
  flags: DuplicationFlag[]
): NormalizationAuditSummary {
  const rawQuantityTotal = lines.reduce((s, l) => s + l.quantityRawSum, 0);
  const safeQuantityTotal = lines.reduce((s, l) => s + l.quantitySafe, 0);
  const verifiedQuantityTotal = lines.reduce((s, l) => s + l.quantityVerified, 0);
  const provisionalQuantityTotal = lines.reduce((s, l) => s + l.quantityProvisional, 0);
  const optionalQuantityTotal = lines.reduce((s, l) => s + l.quantityOptional, 0);
  const dependencyQuantityTotal = lines.reduce((s, l) => s + l.quantityDependency, 0);

  const rawValueTotal = lines.reduce((s, l) => s + l.rawValueTotal, 0);
  const safeValueTotal = lines.reduce((s, l) => s + l.safeValueTotal, 0);
  const verifiedValueTotal = lines.reduce((s, l) => s + l.verifiedValueTotal, 0);
  const provisionalValueTotal = lines.reduce((s, l) => s + l.provisionalValueTotal, 0);
  const optionalValueTotal = lines.reduce((s, l) => s + l.optionalValueTotal, 0);
  const dependencyValueTotal = lines.reduce((s, l) => s + l.dependencyValueTotal, 0);

  const quantityAtRisk = rawQuantityTotal - safeQuantityTotal;
  const valueAtRisk = rawValueTotal - safeValueTotal;

  const duplicateFlagsCount = flags.filter(f =>
    f.flagType === 'duplicate_signature' || f.flagType === 'subset_overlap_unit_entry'
  ).length;
  const overlapFlagsCount = flags.filter(f => f.flagType === 'subset_overlap_unit_entry').length;
  const systemConflictCount = flags.filter(f => f.flagType === 'system_conflict').length;
  const provisionalCount = lines.filter(l => l.quantityProvisional > 0).length;
  const optionalCount = lines.filter(l => l.quantityOptional > 0).length;
  const dependencyCount = lines.filter(l => l.quantityDependency > 0).length;
  const summaryLinesExcluded = flags.filter(f => f.flagType === 'summary_line_excluded').length;

  const criticalFlags = flags.filter(f => f.severity === 'critical').length;
  const highFlags = flags.filter(f => f.severity === 'high').length;
  const valueAtRiskPct = rawValueTotal > 0 ? (valueAtRisk / rawValueTotal) * 100 : 0;

  let commercialVerdict = '';
  let verdictSeverity: NormalizationAuditSummary['verdictSeverity'] = 'safe';

  if (criticalFlags > 0 || valueAtRiskPct > 20) {
    commercialVerdict = `Safe BOQ materially lower than reported quote totals due to duplication risk. ${valueAtRiskPct.toFixed(1)}% of raw value ($${valueAtRisk.toFixed(0)}) is at risk of double-counting.`;
    verdictSeverity = 'critical';
  } else if (highFlags > 0 || valueAtRiskPct > 10) {
    commercialVerdict = `Significant duplication risk detected. Safe BOQ ($${safeValueTotal.toFixed(0)}) is ${valueAtRiskPct.toFixed(1)}% lower than raw total. Manual review recommended.`;
    verdictSeverity = 'high';
  } else if (provisionalQuantityTotal > 0 && provisionalValueTotal > rawValueTotal * 0.1) {
    commercialVerdict = `High provisional loading identified. $${provisionalValueTotal.toFixed(0)} in provisional items sits outside safe comparable BOQ.`;
    verdictSeverity = 'medium';
  } else if (optionalValueTotal > 0) {
    commercialVerdict = `Optional scope ($${optionalValueTotal.toFixed(0)}) successfully separated from base BOQ. Safe totals are comparable.`;
    verdictSeverity = 'low';
  } else if (flags.length === 0) {
    commercialVerdict = 'No duplication risks detected. Safe BOQ matches reported totals.';
    verdictSeverity = 'safe';
  } else {
    commercialVerdict = `Minor normalization adjustments applied. Safe BOQ: $${safeValueTotal.toFixed(0)}. ${flags.length} advisory flag(s) raised.`;
    verdictSeverity = 'low';
  }

  return {
    supplierId,
    supplierName,
    trade,
    rawLineCount,
    normalizedLineCount: lines.length,
    rawQuantityTotal,
    safeQuantityTotal,
    verifiedQuantityTotal,
    provisionalQuantityTotal,
    optionalQuantityTotal,
    dependencyQuantityTotal,
    rawValueTotal,
    safeValueTotal,
    verifiedValueTotal,
    provisionalValueTotal,
    optionalValueTotal,
    dependencyValueTotal,
    quantityAtRisk,
    valueAtRisk,
    duplicateFlagsCount,
    overlapFlagsCount,
    systemConflictCount,
    provisionalCount,
    optionalCount,
    dependencyCount,
    summaryLinesExcluded,
    commercialVerdict,
    verdictSeverity,
  };
}
