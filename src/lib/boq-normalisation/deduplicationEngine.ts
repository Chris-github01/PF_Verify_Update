import type {
  RawQuoteLineReference,
  NormalizedPenetrationLine,
  PenetrationSignature,
  SignatureGroup,
  LineIntent,
  BoqNormalisationConfig,
} from '../../types/boqNormalisation.types';
import {
  buildSignatureKeyForGrouping,
  buildCanonicalDescription,
  detectSystemConflict,
  extractSystemFromDescription,
} from './normalisationRules';

let lineIdCounter = 0;
function genLineId(): string {
  return `norm-${Date.now()}-${++lineIdCounter}`;
}

export interface RawLineInput {
  sourceRef: RawQuoteLineReference;
  intent: LineIntent;
  signature: PenetrationSignature;
  detectedSystems: string[];
}

export function groupBySignature(lines: RawLineInput[]): Map<string, SignatureGroup> {
  const groups = new Map<string, SignatureGroup>();

  for (const line of lines) {
    const key = buildSignatureKeyForGrouping(line.signature);
    const existing = groups.get(key);
    if (existing) {
      existing.lines.push({
        sourceRef: line.sourceRef,
        intent: line.intent,
        detectedSystems: line.detectedSystems,
      });
    } else {
      groups.set(key, {
        signatureKey: key,
        signature: { ...line.signature },
        lines: [{ sourceRef: line.sourceRef, intent: line.intent, detectedSystems: line.detectedSystems }],
      });
    }
  }

  return groups;
}

export function resolveGroup(
  group: SignatureGroup,
  supplierId: string,
  trade: string,
  config: BoqNormalisationConfig
): NormalizedPenetrationLine {
  const { signatureKey, signature, lines } = group;

  const coreLines = lines.filter(l => l.intent === 'core_scope');
  const unitEntryLines = lines.filter(l => l.intent === 'unit_entry_subset');
  const provisionalLines = lines.filter(l => l.intent === 'provisional_extra');
  const optionalLines = lines.filter(l => l.intent === 'optional_scope');
  const dependencyLines = lines.filter(l => l.intent === 'insulation_dependency');
  const summaryLines = lines.filter(l => l.intent === 'summary_only');
  const reviewLines = lines.filter(l => l.intent === 'review_required');

  const includedRefs: RawQuoteLineReference[] = [];
  const excludedRefs: RawQuoteLineReference[] = [];
  const reasoning: string[] = [];

  summaryLines.forEach(l => {
    excludedRefs.push(l.sourceRef);
    reasoning.push(`Rule 7: Excluded summary line "${l.sourceRef.sourceDescription}" to prevent rollup double-count.`);
  });

  const allSystems: string[] = lines.flatMap(l => l.detectedSystems).filter(Boolean);
  const uniqueSystems = [...new Set(allSystems)];
  const hasSystemConflict = detectSystemConflict(uniqueSystems);
  const chosenSystem = uniqueSystems[0] || '';
  const alternativeSystems = uniqueSystems.slice(1);

  if (hasSystemConflict && config.strictSystemConflictMode) {
    reasoning.push(`Rule 6: System conflict detected. Systems: [${uniqueSystems.join(', ')}]. Counting penetration once with primary system "${chosenSystem}".`);
  }

  let quantityRawSum = 0;
  let quantitySafe = 0;
  let quantityVerified = 0;
  let quantityProvisional = 0;
  let quantityOptional = 0;
  let quantityDependency = 0;

  let rawValueTotal = 0;
  let verifiedValueTotal = 0;
  let provisionalValueTotal = 0;
  let optionalValueTotal = 0;
  let dependencyValueTotal = 0;

  for (const l of lines) {
    quantityRawSum += l.sourceRef.rawQuantity;
    rawValueTotal += l.sourceRef.rawTotal;
  }

  if (coreLines.length > 0) {
    const coreQty = Math.max(...coreLines.map(l => l.sourceRef.rawQuantity));
    quantityVerified = coreQty;
    verifiedValueTotal = coreQty * (coreLines[0]?.sourceRef.rawUnitRate || 0);
    coreLines.forEach(l => includedRefs.push(l.sourceRef));
    if (coreLines.length > 1) {
      reasoning.push(`Rule 1: ${coreLines.length} core scope lines share the same signature. Using maximum quantity (${coreQty}) to prevent double count.`);
      coreLines.slice(1).forEach(l => excludedRefs.push(l.sourceRef));
    }
  }

  if (unitEntryLines.length > 0) {
    const unitQty = unitEntryLines.reduce((s, l) => s + l.sourceRef.rawQuantity, 0);
    if (config.mergeUnitEntryIntoGeneral) {
      quantityVerified = Math.max(quantityVerified, unitQty);
      reasoning.push(`Rule 2: Unit entry merged into general (mergeUnitEntryIntoGeneral=true). Qty: ${unitQty}.`);
      unitEntryLines.forEach(l => includedRefs.push(l.sourceRef));
    } else {
      reasoning.push(`Rule 2: Unit entry lines (qty ${unitQty}) treated as overlap candidates — not added to safe quantity. Verify if subset of general penetrations.`);
      unitEntryLines.forEach(l => excludedRefs.push(l.sourceRef));
    }
  }

  for (const l of provisionalLines) {
    quantityProvisional += l.sourceRef.rawQuantity;
    provisionalValueTotal += l.sourceRef.rawTotal;
    excludedRefs.push(l.sourceRef);
    reasoning.push(`Rule 3: Provisional line "${l.sourceRef.sourceDescription}" (qty ${l.sourceRef.rawQuantity}) excluded from safe BOQ. Tracked as provisional.`);
  }

  for (const l of optionalLines) {
    quantityOptional += l.sourceRef.rawQuantity;
    optionalValueTotal += l.sourceRef.rawTotal;
    excludedRefs.push(l.sourceRef);
    reasoning.push(`Rule 4: Optional line "${l.sourceRef.sourceDescription}" excluded from safe base BOQ total.`);
  }

  for (const l of dependencyLines) {
    quantityDependency += l.sourceRef.rawQuantity;
    dependencyValueTotal += l.sourceRef.rawTotal;
    const hasParent = coreLines.length > 0;
    if (hasParent) {
      includedRefs.push(l.sourceRef);
      reasoning.push(`Rule 5: Insulation/dependency item "${l.sourceRef.sourceDescription}" linked to parent penetration.`);
    } else {
      excludedRefs.push(l.sourceRef);
      reasoning.push(`Rule 5: Dependency item "${l.sourceRef.sourceDescription}" has no confirmed parent penetration — flagged as standalone dependency.`);
    }
  }

  for (const l of reviewLines) {
    excludedRefs.push(l.sourceRef);
    reasoning.push(`Line "${l.sourceRef.sourceDescription}" flagged for manual review — classification unclear.`);
  }

  quantitySafe = quantityVerified;
  const safeValueTotal = verifiedValueTotal + (coreLines.length > 0 ? dependencyValueTotal : 0);

  const avgUnitRate = coreLines.length > 0
    ? coreLines.reduce((s, l) => s + l.sourceRef.rawUnitRate, 0) / coreLines.length
    : lines[0]?.sourceRef.rawUnitRate || 0;

  let duplicateRiskLevel: NormalizedPenetrationLine['duplicateRiskLevel'] = 'none';
  if (coreLines.length > 2) duplicateRiskLevel = 'critical';
  else if (coreLines.length > 1) duplicateRiskLevel = 'high';
  else if (unitEntryLines.length > 0 && coreLines.length > 0) duplicateRiskLevel = 'medium';
  else if (hasSystemConflict) duplicateRiskLevel = 'low';

  let overlapRiskLevel: NormalizedPenetrationLine['overlapRiskLevel'] = 'none';
  if (unitEntryLines.length > 0 && coreLines.length > 0) overlapRiskLevel = 'high';
  else if (unitEntryLines.length > 0) overlapRiskLevel = 'medium';
  else if (hasSystemConflict) overlapRiskLevel = 'low';

  let pricingStrategyTag = 'Standard';
  if (hasSystemConflict) pricingStrategyTag = 'Multi-System';
  else if (provisionalLines.length > 0) pricingStrategyTag = 'Provisional Loading';
  else if (optionalLines.length > 0) pricingStrategyTag = 'Optional Items';
  else if (unitEntryLines.length > 0) pricingStrategyTag = 'Unit Entry Pricing';

  const uniqueIncluded = dedupeRefs(includedRefs);
  const uniqueExcluded = dedupeRefs(excludedRefs);

  const confidence = computeConfidence({
    coreCount: coreLines.length,
    hasSystemConflict,
    provisionalCount: provisionalLines.length,
    hasReviewLines: reviewLines.length > 0,
  });

  return {
    normalizedLineId: genLineId(),
    supplierId,
    trade,
    signature,
    signatureKey,
    canonicalDescription: buildCanonicalDescription(signature),
    intent: coreLines.length > 0 ? 'core_scope' : lines[0]?.intent || 'review_required',
    quantityRawSum,
    quantitySafe,
    quantityVerified,
    quantityProvisional,
    quantityOptional,
    quantityDependency,
    rawUnitRate: avgUnitRate,
    rawValueTotal,
    safeValueTotal,
    verifiedValueTotal,
    provisionalValueTotal,
    optionalValueTotal,
    dependencyValueTotal,
    duplicateRiskLevel,
    overlapRiskLevel,
    pricingStrategyTag,
    chosenSystem,
    alternativeSystems,
    includedSourceRefs: uniqueIncluded,
    excludedSourceRefs: uniqueExcluded,
    reasoning,
    confidence,
  };
}

function dedupeRefs(refs: RawQuoteLineReference[]): RawQuoteLineReference[] {
  const seen = new Set<string>();
  return refs.filter(r => {
    if (seen.has(r.quoteItemId)) return false;
    seen.add(r.quoteItemId);
    return true;
  });
}

function computeConfidence(params: {
  coreCount: number;
  hasSystemConflict: boolean;
  provisionalCount: number;
  hasReviewLines: boolean;
}): number {
  let score = 1.0;
  if (params.coreCount === 0) score -= 0.4;
  if (params.hasSystemConflict) score -= 0.1;
  if (params.provisionalCount > 0) score -= 0.1;
  if (params.hasReviewLines) score -= 0.15;
  if (params.coreCount > 2) score -= 0.1;
  return Math.max(0, Math.min(1, score));
}

export function buildRawInputFromQuoteItem(item: {
  id: string;
  quote_id: string;
  supplier_id?: string;
  description: string;
  section?: string;
  quantity: number;
  unit_rate: number;
  total_amount?: number;
  line_number?: number;
  trade?: string;
  service?: string;
  size?: string;
  substrate?: string;
  frl?: string;
  system_name?: string;
  item_type?: string;
  is_provisional?: boolean;
  is_optional?: boolean;
}, intent: LineIntent, signature: PenetrationSignature, supplierId: string): RawLineInput {
  const detectedSystem = extractSystemFromDescription(item.description);
  const systems: string[] = [];
  if (item.system_name) systems.push(item.system_name);
  if (detectedSystem && detectedSystem !== item.system_name) systems.push(detectedSystem);

  return {
    sourceRef: {
      supplierId,
      quoteId: item.quote_id,
      quoteItemId: item.id,
      sourceLineNumber: item.line_number || 0,
      sourceDescription: item.description,
      sourceSection: item.section || '',
      rawQuantity: item.quantity || 0,
      rawUnitRate: item.unit_rate || 0,
      rawTotal: item.total_amount ?? (item.quantity || 0) * (item.unit_rate || 0),
    },
    intent,
    signature,
    detectedSystems: systems,
  };
}
