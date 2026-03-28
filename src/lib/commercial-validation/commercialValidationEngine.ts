import { supabase } from '../supabase';
import type {
  CommercialValidationResult,
  ValidationNote,
  ValidationStatus,
} from './types';
import {
  QUANTITY_TOLERANCE,
  ALIGNMENT_THRESHOLD,
  CONFIDENCE_THRESHOLD,
  PROVISIONAL_HIGH_RISK,
} from './types';

const PROVISIONAL_KEYWORDS = [
  'provisional',
  'tbc',
  'to be confirmed',
  'assumed',
  'subject to remeasurement',
  'subject to survey',
  'estimated',
  'allow for',
];

const OPTIONAL_KEYWORDS = [
  'optional',
  'if required',
  'if applicable',
  'as directed',
  'confirmation required',
  'pc item',
  'prime cost',
];

function containsAny(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

interface QIRunData {
  run_id: string;
  comparison_name: string;
  module_key: string;
  trade_key: string;
  result_json: {
    suppliers?: Array<{
      quoteId: string;
      supplierName: string;
      score: number;
      adjustedTotal: number;
      rawTotal: number;
      normalizedTotal: number;
      underallowanceCount: number;
    }>;
    matchedGroups?: Array<{
      normalizedKey: string;
      canonicalDescription: string;
      matchConfidence: number;
      supplierValues: Array<{
        quoteId: string;
        quantity: number | null;
      }>;
    }>;
    referenceQuantities?: Array<{
      normalizedKey: string;
      referenceQty: number;
    }>;
  } | null;
}

interface Phase3ScopeData {
  gaps: Array<{ category: string; detected_at: string }>;
  qualifications: Array<{ text: string; detected_at: string }>;
  exclusions: Array<{ text: string; detected_at: string }>;
}

async function loadQIRunData(runId: string): Promise<QIRunData | null> {
  const { data, error } = await supabase
    .from('quantity_intelligence_runs')
    .select('run_id, comparison_name, module_key, trade_key, result_json')
    .eq('run_id', runId)
    .maybeSingle();

  if (error || !data) return null;
  return data as QIRunData;
}

async function loadPhase3ScopeData(runId: string): Promise<Phase3ScopeData | null> {
  const { data, error } = await supabase
    .from('shadow_scope_items')
    .select('item_type, text, category')
    .eq('run_id', runId);

  if (error || !data || data.length === 0) return null;

  return {
    gaps: data.filter((d: any) => d.item_type === 'gap').map((d: any) => ({ category: d.category, detected_at: d.text })),
    qualifications: data.filter((d: any) => d.item_type === 'qualification').map((d: any) => ({ text: d.text, detected_at: '' })),
    exclusions: data.filter((d: any) => d.item_type === 'exclusion').map((d: any) => ({ text: d.text, detected_at: '' })),
  };
}

async function loadQuoteItemsForRun(quoteIds: string[]): Promise<Map<string, Array<{ description: string; is_excluded: boolean; total_price: number | null }>>> {
  if (quoteIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('quote_items')
    .select('quote_id, description, is_excluded, total_price')
    .in('quote_id', quoteIds)
    .eq('is_excluded', false);

  if (error || !data) return new Map();

  const map = new Map<string, Array<{ description: string; is_excluded: boolean; total_price: number | null }>>();
  for (const item of data) {
    const existing = map.get(item.quote_id) ?? [];
    existing.push({ description: item.description, is_excluded: item.is_excluded, total_price: item.total_price });
    map.set(item.quote_id, existing);
  }
  return map;
}

export async function runCommercialValidation(
  runId: string,
  tradeKey: string,
  matchedGroups: Array<{
    normalizedKey: string;
    canonicalDescription: string;
    matchConfidence: number;
    supplierValues: Array<{ quoteId: string; supplierName: string; quantity: number | null }>;
  }>,
  suppliers: Array<{
    quoteId: string;
    supplierName: string;
    rawTotal: number;
    normalizedTotal: number;
    underallowanceCount: number;
  }>,
  referenceQuantities: Array<{ normalizedKey: string; referenceQty: number }>,
  normalizationApplied: boolean,
): Promise<CommercialValidationResult> {
  const notes: ValidationNote[] = [];

  const totalSuppliers = suppliers.length;
  const quoteIds = suppliers.map((s) => s.quoteId);
  const itemsMap = await loadQuoteItemsForRun(quoteIds);

  // --------------------------------------------------
  // CHECK 1 — SUPPLIER COMPARABILITY
  // --------------------------------------------------
  const suppliersWithMatches = new Set(
    matchedGroups.flatMap((g) => g.supplierValues.map((sv) => sv.quoteId)),
  );
  const comparableSuppliers = suppliers.filter((s) => suppliersWithMatches.has(s.quoteId)).length;

  const comparabilityPass = comparableSuppliers >= 2;
  notes.push({
    check: 'Supplier Comparability',
    status: comparabilityPass ? 'pass' : 'fail',
    score: comparableSuppliers,
    message: comparabilityPass
      ? `${comparableSuppliers} suppliers have valid matched line groups`
      : `Only ${comparableSuppliers} supplier(s) have matched lines — minimum 2 required`,
  });

  if (!comparabilityPass) {
    const result: CommercialValidationResult = {
      run_id: runId,
      trade_key: tradeKey,
      total_suppliers: totalSuppliers,
      comparable_suppliers: comparableSuppliers,
      has_optionals: false,
      optionals_normalized: false,
      has_provisional_quantities: false,
      provisional_risk_score: 0,
      exclusion_mismatch_score: 0,
      quantity_alignment_score: 0,
      match_confidence_score: 0,
      scope_completeness_variance: 0,
      normalization_applied: normalizationApplied,
      validation_status: 'not_comparable',
      validation_notes: notes,
    };
    await persistValidationResult(result);
    return result;
  }

  // --------------------------------------------------
  // CHECK 2 — OPTIONAL SCOPE NORMALIZATION
  // --------------------------------------------------
  let totalOptionalLines = 0;
  let totalLines = 0;

  for (const [, items] of itemsMap) {
    totalLines += items.length;
    totalOptionalLines += items.filter((i) => containsAny(i.description, OPTIONAL_KEYWORDS)).length;
  }

  const hasOptionals = totalOptionalLines > 0;
  const optionalsNormalized = normalizationApplied && hasOptionals;

  notes.push({
    check: 'Optional Scope Normalization',
    status: !hasOptionals ? 'pass' : optionalsNormalized ? 'pass' : 'warn',
    score: totalLines > 0 ? parseFloat((totalOptionalLines / totalLines).toFixed(3)) : 0,
    message: !hasOptionals
      ? 'No optional/TBC line items detected'
      : optionalsNormalized
        ? `${totalOptionalLines} optional lines detected — normalized by Quantity Intelligence`
        : `${totalOptionalLines} optional lines detected — not fully normalized (review required)`,
  });

  // --------------------------------------------------
  // CHECK 3 — PROVISIONAL QUANTITIES
  // --------------------------------------------------
  let provisionalLineCount = 0;
  let provisionalValueSum = 0;
  let totalValue = 0;

  for (const [, items] of itemsMap) {
    for (const item of items) {
      const val = item.total_price ?? 0;
      totalValue += val;
      if (containsAny(item.description, PROVISIONAL_KEYWORDS)) {
        provisionalLineCount++;
        provisionalValueSum += val;
      }
    }
  }

  const provisionalRiskScore = totalLines > 0
    ? parseFloat((provisionalLineCount / totalLines).toFixed(3))
    : 0;
  const hasProvisional = provisionalLineCount > 0;
  const provisionalHighRisk = provisionalRiskScore > PROVISIONAL_HIGH_RISK;

  notes.push({
    check: 'Provisional Quantities',
    status: !hasProvisional ? 'pass' : provisionalHighRisk ? 'warn' : 'pass',
    score: provisionalRiskScore,
    message: !hasProvisional
      ? 'No provisional quantity language detected'
      : `${provisionalLineCount} provisional lines (${(provisionalRiskScore * 100).toFixed(1)}% of total) — value at risk: ${formatCurrency(provisionalValueSum)}`,
  });

  // --------------------------------------------------
  // CHECK 4 — EXCLUSION MISMATCH
  // --------------------------------------------------
  const phase3 = await loadPhase3ScopeData(runId);
  let exclusionMismatchScore = 0;

  const exclusionsBySupplierId = new Map<string, string[]>();
  for (const [quoteId, items] of itemsMap) {
    const exclusionLines = items.filter((i) =>
      i.description.toLowerCase().includes('exclud') ||
      i.description.toLowerCase().includes('not included') ||
      i.description.toLowerCase().includes('allowance not included'),
    );
    if (exclusionLines.length > 0) {
      exclusionsBySupplierId.set(quoteId, exclusionLines.map((l) => l.description));
    }
  }

  const suppliersWithExclusions = exclusionsBySupplierId.size;
  if (suppliersWithExclusions === 0) {
    exclusionMismatchScore = 0;
  } else if (suppliersWithExclusions < totalSuppliers) {
    exclusionMismatchScore = 1;
  } else {
    const exclusionCounts = Array.from(exclusionsBySupplierId.values()).map((arr) => arr.length);
    const maxCount = Math.max(...exclusionCounts);
    const minCount = Math.min(...exclusionCounts);
    exclusionMismatchScore = (maxCount - minCount) > 3 ? 2 : 1;
  }

  const exclusionStatus = exclusionMismatchScore === 0 ? 'pass' : exclusionMismatchScore === 1 ? 'warn' : 'fail';
  notes.push({
    check: 'Exclusions Alignment',
    status: exclusionStatus,
    score: exclusionMismatchScore,
    message: exclusionMismatchScore === 0
      ? 'Exclusion sections are aligned across suppliers'
      : exclusionMismatchScore === 1
        ? 'Minor exclusion differences detected — verify scope alignment'
        : 'Material commercial differences in exclusion sections — comparability at risk',
  });

  if (phase3 && phase3.exclusions.length > 0) {
    notes.push({
      check: 'Phase 3 Exclusion Intelligence',
      status: 'warn',
      message: `Phase 3 detected ${phase3.exclusions.length} exclusion signal(s) in scope analysis`,
    });
  }

  // --------------------------------------------------
  // CHECK 5 — QUANTITY ALIGNMENT
  // --------------------------------------------------
  const refQtyMap = new Map(referenceQuantities.map((r) => [r.normalizedKey, r.referenceQty]));
  let alignedGroups = 0;
  let totalGroupsChecked = 0;

  for (const group of matchedGroups) {
    const refQty = refQtyMap.get(group.normalizedKey);
    if (refQty == null || refQty === 0) continue;

    totalGroupsChecked++;
    const allWithinTol = group.supplierValues.every((sv) => {
      if (sv.quantity == null) return false;
      const deviation = Math.abs(sv.quantity - refQty) / refQty;
      return deviation <= QUANTITY_TOLERANCE;
    });

    if (allWithinTol) alignedGroups++;
  }

  const quantityAlignmentScore = totalGroupsChecked > 0
    ? parseFloat((alignedGroups / totalGroupsChecked).toFixed(3))
    : 0;

  notes.push({
    check: 'Quantity Alignment',
    status: quantityAlignmentScore >= ALIGNMENT_THRESHOLD ? 'pass' : quantityAlignmentScore >= 0.5 ? 'warn' : 'fail',
    score: quantityAlignmentScore,
    message: `${(quantityAlignmentScore * 100).toFixed(1)}% of matched line groups are within ${(QUANTITY_TOLERANCE * 100).toFixed(0)}% quantity tolerance (${alignedGroups}/${totalGroupsChecked} groups)`,
  });

  // --------------------------------------------------
  // CHECK 6 — MATCH CONFIDENCE
  // --------------------------------------------------
  const avgConfidence = matchedGroups.length > 0
    ? matchedGroups.reduce((sum, g) => sum + g.matchConfidence, 0) / matchedGroups.length
    : 0;
  const matchConfidenceScore = parseFloat(avgConfidence.toFixed(3));

  notes.push({
    check: 'Match Confidence',
    status: matchConfidenceScore >= CONFIDENCE_THRESHOLD ? 'pass' : matchConfidenceScore >= 0.55 ? 'warn' : 'fail',
    score: matchConfidenceScore,
    message: `Average match confidence across ${matchedGroups.length} groups: ${(matchConfidenceScore * 100).toFixed(1)}%`,
  });

  // --------------------------------------------------
  // CHECK 7 — SCOPE COMPLETENESS VARIANCE
  // --------------------------------------------------
  const itemCounts = Array.from(itemsMap.values()).map((items) => items.length);
  let scopeCompletenessVariance = 0;

  if (itemCounts.length >= 2) {
    const maxItems = Math.max(...itemCounts);
    const minItems = Math.min(...itemCounts);
    scopeCompletenessVariance = maxItems > 0
      ? parseFloat(((maxItems - minItems) / maxItems).toFixed(3))
      : 0;
  }

  const scopeStatus = scopeCompletenessVariance <= 0.15 ? 'pass' : scopeCompletenessVariance <= 0.30 ? 'warn' : 'fail';
  notes.push({
    check: 'Scope Completeness Variance',
    status: scopeStatus,
    score: scopeCompletenessVariance,
    message: `${(scopeCompletenessVariance * 100).toFixed(1)}% variance in scope item count across suppliers (${itemCounts.join(' vs ')} items)`,
  });

  if (phase3 && phase3.gaps.length > 0) {
    notes.push({
      check: 'Phase 3 Scope Gaps',
      status: 'warn',
      message: `Phase 3 detected ${phase3.gaps.length} scope gap(s) across categories`,
    });
  }

  // --------------------------------------------------
  // FINAL CLASSIFICATION
  // --------------------------------------------------
  const isValidated =
    quantityAlignmentScore > 0.8 &&
    matchConfidenceScore > 0.75 &&
    (optionalsNormalized || !hasOptionals) &&
    exclusionMismatchScore <= 1 &&
    !provisionalHighRisk;

  const isNotComparable =
    comparableSuppliers < 2 ||
    exclusionMismatchScore >= 2 ||
    (quantityAlignmentScore < 0.4 && matchedGroups.length > 10) ||
    (matchConfidenceScore < 0.4);

  let validationStatus: ValidationStatus;
  if (isValidated) {
    validationStatus = 'validated';
  } else if (isNotComparable) {
    validationStatus = 'not_comparable';
  } else {
    validationStatus = 'conditional';
  }

  const failingChecks = notes.filter((n) => n.status === 'fail').map((n) => n.check);
  if (failingChecks.length > 0) {
    if (import.meta.env.DEV) {
      console.log('[CommercialValidation] Failing checks:', failingChecks, { runId, validationStatus });
    }
  }

  const result: CommercialValidationResult = {
    run_id: runId,
    trade_key: tradeKey,
    total_suppliers: totalSuppliers,
    comparable_suppliers: comparableSuppliers,
    has_optionals: hasOptionals,
    optionals_normalized: optionalsNormalized,
    has_provisional_quantities: hasProvisional,
    provisional_risk_score: provisionalRiskScore,
    exclusion_mismatch_score: exclusionMismatchScore,
    quantity_alignment_score: quantityAlignmentScore,
    match_confidence_score: matchConfidenceScore,
    scope_completeness_variance: scopeCompletenessVariance,
    normalization_applied: normalizationApplied,
    validation_status: validationStatus,
    validation_notes: notes,
  };

  await persistValidationResult(result);

  if (import.meta.env.DEV) {
    console.log('[CommercialValidation] Result:', {
      runId,
      tradeKey,
      validationStatus,
      quantityAlignmentScore,
      matchConfidenceScore,
      exclusionMismatchScore,
      provisionalRiskScore,
    });
  }

  return result;
}

async function persistValidationResult(result: CommercialValidationResult): Promise<void> {
  const { error } = await supabase
    .from('commercial_validation_results')
    .upsert(
      {
        run_id: result.run_id,
        trade_key: result.trade_key,
        total_suppliers: result.total_suppliers,
        comparable_suppliers: result.comparable_suppliers,
        has_optionals: result.has_optionals,
        optionals_normalized: result.optionals_normalized,
        has_provisional_quantities: result.has_provisional_quantities,
        provisional_risk_score: result.provisional_risk_score,
        exclusion_mismatch_score: result.exclusion_mismatch_score,
        quantity_alignment_score: result.quantity_alignment_score,
        match_confidence_score: result.match_confidence_score,
        scope_completeness_variance: result.scope_completeness_variance,
        normalization_applied: result.normalization_applied,
        validation_status: result.validation_status,
        validation_notes: result.validation_notes,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'run_id' },
    );

  if (error && import.meta.env.DEV) {
    console.warn('[CommercialValidation] Failed to persist:', error.message);
  }
}

export async function getValidationForRun(runId: string): Promise<CommercialValidationResult | null> {
  const { data, error } = await supabase
    .from('commercial_validation_results')
    .select('*')
    .eq('run_id', runId)
    .maybeSingle();

  if (error || !data) return null;
  return data as CommercialValidationResult;
}

export async function getLatestValidationForTrade(tradeKey: string): Promise<CommercialValidationResult | null> {
  const { data, error } = await supabase
    .from('commercial_validation_results')
    .select('*')
    .eq('trade_key', tradeKey)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as CommercialValidationResult;
}

export async function getAllValidationResults(limit = 50): Promise<CommercialValidationResult[]> {
  const { data, error } = await supabase
    .from('commercial_validation_results')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data as CommercialValidationResult[];
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 }).format(value);
}
