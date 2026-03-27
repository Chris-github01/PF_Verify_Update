import { supabase } from '../../supabase';
import type { ResolvedDataset } from './sourceAdapters';

export interface DiagnosticsInput {
  runId: string;
  dataset: ResolvedDataset;
  moduleKey: string;
  liveOutputJson: Record<string, unknown>;
  shadowOutputJson: Record<string, unknown> | null;
}

export interface AnomalyFlag {
  code: string;
  description: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
}

export interface DiagnosticsProfile {
  supplierNameNormalized: string | null;
  templateFamilyId: string | null;
  documentFormatFamily: string;
  tableStyle: string;
  totalStyle: string;
  gstMode: string;
  pageCount: number | null;
  lineItemCount: number;
  sectionCount: number | null;
  confidenceScore: number;
  anomalyCount: number;
  anomalyFlags: AnomalyFlag[];
}

function normalizeSupplierName(name: string | null): string | null {
  if (!name) return null;
  return name.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9 ]/g, '');
}

function inferDocumentFormatFamily(moduleKey: string): string {
  if (moduleKey.includes('plumbing')) return 'plumbing_quote';
  if (moduleKey.includes('passive_fire')) return 'passive_fire_quote';
  if (moduleKey.includes('active_fire')) return 'active_fire_quote';
  if (moduleKey.includes('electrical')) return 'electrical_quote';
  if (moduleKey.includes('hvac')) return 'hvac_quote';
  return 'generic_quote';
}

function inferTableStyle(liveOutput: Record<string, unknown>): string {
  const rows = Array.isArray(liveOutput.rows) ? liveOutput.rows : [];
  if (rows.length === 0) return 'unknown';
  const hasUnits = rows.some((r: Record<string, unknown>) => r.unit != null && r.unit !== '');
  const hasQty = rows.some((r: Record<string, unknown>) => r.qty != null);
  if (hasUnits && hasQty) return 'measured_items';
  if (hasQty) return 'quantity_only';
  return 'lump_sum';
}

function inferTotalStyle(liveOutput: Record<string, unknown>): string {
  const hasDocTotal = liveOutput.detectedDocumentTotal != null;
  const hasMismatch = Boolean(liveOutput.hasTotalMismatch);
  const hasLikelyTotal = Boolean(liveOutput.hasLikelyFinalTotalAsLineItem);
  if (hasLikelyTotal) return 'total_as_line_item';
  if (hasMismatch) return 'mismatched_total';
  if (hasDocTotal) return 'explicit_total';
  return 'no_document_total';
}

function inferGstMode(dataset: ResolvedDataset, liveOutput: Record<string, unknown>): string {
  const warnings = Array.isArray(liveOutput.parserWarnings) ? liveOutput.parserWarnings as string[] : [];
  const gstWarning = warnings.some((w) => w.toLowerCase().includes('gst') || w.toLowerCase().includes('tax'));
  if (gstWarning) return 'mixed_signals';
  const docTotal = dataset.documentTotal;
  const parsedTotal = typeof liveOutput.parsedValue === 'number' ? liveOutput.parsedValue : null;
  if (docTotal && parsedTotal) {
    const ratio = parsedTotal / docTotal;
    if (ratio > 1.08 && ratio < 1.17) return 'likely_inc_gst';
    if (ratio > 0.85 && ratio < 0.93) return 'likely_ex_gst';
  }
  return 'unknown';
}

function buildAnomalyFlags(
  dataset: ResolvedDataset,
  liveOutput: Record<string, unknown>,
  shadowOutput: Record<string, unknown> | null,
): AnomalyFlag[] {
  const flags: AnomalyFlag[] = [];

  if (Boolean(liveOutput.hasTotalMismatch)) {
    flags.push({ code: 'total_mismatch', description: 'Parsed total differs from detected document total.', severity: 'high' });
  }
  if (Boolean(liveOutput.hasLikelyFinalTotalAsLineItem)) {
    flags.push({ code: 'total_as_line_item', description: 'A document total row may have been included as a line item.', severity: 'high' });
  }
  if (Boolean(liveOutput.hasDuplicateValueRisk)) {
    flags.push({ code: 'duplicate_value_risk', description: 'Duplicate line item values detected.', severity: 'medium' });
  }
  if (dataset.itemCount === 0) {
    flags.push({ code: 'zero_items', description: 'No line items resolved for this dataset.', severity: 'critical' });
  }
  if (shadowOutput) {
    const liveVal = typeof liveOutput.parsedValue === 'number' ? liveOutput.parsedValue : 0;
    const shadowVal = typeof shadowOutput.parsedValue === 'number' ? shadowOutput.parsedValue : 0;
    const delta = Math.abs(liveVal - shadowVal);
    const pct = liveVal > 0 ? delta / liveVal : 0;
    if (pct > 0.05) {
      flags.push({ code: 'live_shadow_divergence', description: `Live and shadow totals differ by ${(pct * 100).toFixed(1)}%.`, severity: pct > 0.15 ? 'high' : 'medium' });
    }
  }

  const warnings = Array.isArray(liveOutput.parserWarnings) ? liveOutput.parserWarnings as string[] : [];
  if (warnings.length > 3) {
    flags.push({ code: 'high_warning_count', description: `Parser emitted ${warnings.length} warnings.`, severity: 'low' });
  }

  return flags;
}

function calculateConfidenceScore(
  dataset: ResolvedDataset,
  liveOutput: Record<string, unknown>,
  anomalyFlags: AnomalyFlag[],
): number {
  let score = 100;

  if (liveOutput.detectedDocumentTotal == null) score -= 20;
  if (Boolean(liveOutput.hasTotalMismatch)) score -= 20;
  if (Boolean(liveOutput.hasLikelyFinalTotalAsLineItem)) score -= 15;
  if (Boolean(liveOutput.hasDuplicateValueRisk)) score -= 15;
  if (dataset.itemCount === 0) score -= 20;

  const warnings = Array.isArray(liveOutput.parserWarnings) ? liveOutput.parserWarnings as string[] : [];
  const gstWarning = warnings.some((w) => w.toLowerCase().includes('gst') || w.toLowerCase().includes('tax'));
  if (gstWarning) score -= 15;

  const hasLiveShadowDivergence = anomalyFlags.some((f) => f.code === 'live_shadow_divergence');
  if (hasLiveShadowDivergence) {
    const flag = anomalyFlags.find((f) => f.code === 'live_shadow_divergence');
    if (flag?.severity === 'high') score -= 20;
    else score -= 10;
  }

  return Math.max(0, Math.min(100, score));
}

export async function buildAndSaveDiagnostics(input: DiagnosticsInput): Promise<DiagnosticsProfile> {
  const { runId, dataset, moduleKey, liveOutputJson, shadowOutputJson } = input;

  const supplierNameNormalized = normalizeSupplierName(dataset.supplierName);
  const documentFormatFamily = inferDocumentFormatFamily(moduleKey);
  const tableStyle = inferTableStyle(liveOutputJson);
  const totalStyle = inferTotalStyle(liveOutputJson);
  const gstMode = inferGstMode(dataset, liveOutputJson);
  const anomalyFlags = buildAnomalyFlags(dataset, liveOutputJson, shadowOutputJson);
  const confidenceScore = calculateConfidenceScore(dataset, liveOutputJson, anomalyFlags);

  const profile: DiagnosticsProfile = {
    supplierNameNormalized,
    templateFamilyId: null,
    documentFormatFamily,
    tableStyle,
    totalStyle,
    gstMode,
    pageCount: null,
    lineItemCount: dataset.itemCount,
    sectionCount: null,
    confidenceScore,
    anomalyCount: anomalyFlags.length,
    anomalyFlags,
  };

  await supabase.from('shadow_run_diagnostics').insert({
    run_id: runId,
    supplier_name_normalized: supplierNameNormalized,
    template_family_id: null,
    document_format_family: documentFormatFamily,
    table_style: tableStyle,
    total_style: totalStyle,
    gst_mode: gstMode,
    page_count: null,
    line_item_count: dataset.itemCount,
    section_count: null,
    confidence_score: confidenceScore,
    anomaly_count: anomalyFlags.length,
    anomaly_flags_json: anomalyFlags,
    raw_diagnostics_json: {
      moduleKey,
      resolvedVia: dataset.resolvedVia,
      documentTotal: dataset.documentTotal,
      parsedTotal: typeof liveOutputJson.parsedValue === 'number' ? liveOutputJson.parsedValue : null,
      parserWarnings: liveOutputJson.parserWarnings ?? [],
      hasTotalMismatch: liveOutputJson.hasTotalMismatch ?? false,
      hasLikelyFinalTotalAsLineItem: liveOutputJson.hasLikelyFinalTotalAsLineItem ?? false,
      hasDuplicateValueRisk: liveOutputJson.hasDuplicateValueRisk ?? false,
    },
  });

  return profile;
}
