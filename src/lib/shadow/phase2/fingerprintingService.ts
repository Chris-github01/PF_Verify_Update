import { supabase } from '../../supabase';
import type { ResolvedDataset } from '../phase1/sourceAdapters';

export interface SupplierFingerprint {
  id: string;
  supplier_name_normalized: string | null;
  template_family_id: string;
  fingerprint_hash: string;
  markers_json: Record<string, unknown>;
  total_phrase_family: string | null;
  section_order_json: unknown[] | null;
  table_style: string | null;
  gst_mode: string | null;
  common_failure_modes_json: string[];
  historical_run_count: number;
  historical_accuracy: number;
  confidence: number;
  created_at: string;
  updated_at: string;
}

export interface RunFingerprintLink {
  id: string;
  run_id: string;
  supplier_name_normalized: string | null;
  template_family_id: string;
  confidence: number;
  matched_markers_json: string[];
  created_at: string;
}

export interface FingerprintMarkers {
  supplierNameNormalized: string | null;
  tableStyle: string;
  gstMode: string;
  totalStyle: string;
  documentFormatFamily: string;
  hasExplicitTotal: boolean;
  hasMismatch: boolean;
}

function buildMarkers(
  dataset: ResolvedDataset,
  diagnosticsJson: Record<string, unknown>,
): FingerprintMarkers {
  return {
    supplierNameNormalized: dataset.supplierName
      ? dataset.supplierName.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9 ]/g, '')
      : null,
    tableStyle: String(diagnosticsJson.table_style ?? 'unknown'),
    gstMode: String(diagnosticsJson.gst_mode ?? 'unknown'),
    totalStyle: String(diagnosticsJson.total_style ?? 'unknown'),
    documentFormatFamily: String(diagnosticsJson.document_format_family ?? 'generic_quote'),
    hasExplicitTotal: diagnosticsJson.total_style === 'explicit_total',
    hasMismatch: diagnosticsJson.total_style === 'mismatched_total',
  };
}

function computeFingerprintHash(markers: FingerprintMarkers): string {
  const parts = [
    markers.supplierNameNormalized ?? '__unknown__',
    markers.tableStyle,
    markers.gstMode,
    markers.documentFormatFamily,
    markers.hasExplicitTotal ? 'explicit_total' : 'no_explicit_total',
  ];
  const raw = parts.join('|');
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `fp_${Math.abs(hash).toString(16).padStart(8, '0')}`;
}

function buildTemplateFamilyId(markers: FingerprintMarkers, hash: string): string {
  const prefix = markers.documentFormatFamily.replace(/_quote$/, '');
  const supplier = markers.supplierNameNormalized
    ? markers.supplierNameNormalized.split(' ').slice(0, 2).join('_')
    : 'generic';
  return `${prefix}__${supplier}__${hash}`;
}

function computeConfidence(markers: FingerprintMarkers, runCount: number): number {
  let score = 0.3;
  if (markers.supplierNameNormalized) score += 0.3;
  if (markers.tableStyle !== 'unknown') score += 0.1;
  if (markers.gstMode !== 'unknown') score += 0.1;
  if (markers.hasExplicitTotal) score += 0.1;
  if (runCount > 3) score += 0.05;
  if (runCount > 10) score += 0.05;
  return Math.min(1.0, score);
}

async function loadDiagnosticsForRun(runId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from('shadow_run_diagnostics')
    .select('*')
    .eq('run_id', runId)
    .maybeSingle();

  if (error) throw new Error(`[fingerprintingService] diagnostics fetch failed: ${error.message}`);
  return (data ?? {}) as Record<string, unknown>;
}

async function loadFailureCodesForRun(runId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('shadow_run_failures')
    .select('failure_code')
    .eq('run_id', runId);

  if (error) return [];
  return (data ?? []).map((r) => String(r.failure_code));
}

async function findExistingFingerprint(
  hash: string,
): Promise<SupplierFingerprint | null> {
  const { data, error } = await supabase
    .from('supplier_fingerprints')
    .select('*')
    .eq('fingerprint_hash', hash)
    .maybeSingle();

  if (error) return null;
  return data as SupplierFingerprint | null;
}

// Compute a similarity score [0,1] between two sets of markers.
// Used to detect near-duplicate fingerprints that differ only by minor noise.
function computeMarkerSimilarity(a: FingerprintMarkers, b: FingerprintMarkers): number {
  let score = 0;
  const weights = { tableStyle: 0.25, gstMode: 0.2, documentFormatFamily: 0.3, totalStyle: 0.15, supplierName: 0.1 };

  if (a.tableStyle === b.tableStyle && a.tableStyle !== 'unknown') score += weights.tableStyle;
  if (a.gstMode === b.gstMode && a.gstMode !== 'unknown') score += weights.gstMode;
  if (a.documentFormatFamily === b.documentFormatFamily) score += weights.documentFormatFamily;
  if (a.totalStyle === b.totalStyle) score += weights.totalStyle;

  if (a.supplierNameNormalized && b.supplierNameNormalized) {
    // Exact or prefix match on normalized supplier name
    const aParts = a.supplierNameNormalized.split(' ').slice(0, 2).join(' ');
    const bParts = b.supplierNameNormalized.split(' ').slice(0, 2).join(' ');
    if (aParts === bParts) score += weights.supplierName;
  }

  return score;
}

// Check if any existing fingerprint is near-duplicate to the new one.
// If found, log a merge candidate — does NOT auto-merge.
async function detectAndLogMergeCandidates(
  newMarkers: FingerprintMarkers,
  newHash: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('supplier_fingerprints')
    .select('fingerprint_hash, supplier_name_normalized, table_style, gst_mode, total_phrase_family, markers_json')
    .neq('fingerprint_hash', newHash)
    .limit(50);

  if (error || !data || data.length === 0) return;

  for (const row of data) {
    const candidateMarkers: FingerprintMarkers = {
      supplierNameNormalized: row.supplier_name_normalized as string | null,
      tableStyle: (row.table_style as string) ?? 'unknown',
      gstMode: (row.gst_mode as string) ?? 'unknown',
      totalStyle: (row.total_phrase_family as string) ?? 'unknown',
      documentFormatFamily: ((row.markers_json as Record<string, unknown>)?.documentFormatFamily as string) ?? 'generic_quote',
      hasExplicitTotal: false,
      hasMismatch: false,
    };

    const similarity = computeMarkerSimilarity(newMarkers, candidateMarkers);
    if (similarity >= 0.80) {
      console.warn(
        `[Phase2/Fingerprint] Near-duplicate candidate detected: hash=${newHash} is ${(similarity * 100).toFixed(0)}% similar to ${row.fingerprint_hash}. Merge candidate — NOT auto-merged.`,
      );
    }
  }
}

async function createOrUpdateFingerprint(
  markers: FingerprintMarkers,
  hash: string,
  templateFamilyId: string,
  failureCodes: string[],
  diagnosticConfidenceScore: number,
): Promise<SupplierFingerprint> {
  // Always fetch by fingerprint_hash (which now has a UNIQUE constraint)
  // to guarantee we find the canonical row even if template_family_id differs.
  const existing = await findExistingFingerprint(hash);

  if (existing) {
    const newRunCount = existing.historical_run_count + 1;
    const proxyAccuracy = Math.min(1, Math.max(0, diagnosticConfidenceScore / 100));
    // Running weighted average: keeps historical accuracy stable as run count grows
    const newAccuracy =
      (existing.historical_accuracy * existing.historical_run_count + proxyAccuracy) / newRunCount;

    const mergedFailures = Array.from(
      new Set([...existing.common_failure_modes_json, ...failureCodes]),
    ).slice(0, 10);

    const { data, error } = await supabase
      .from('supplier_fingerprints')
      .update({
        historical_run_count: newRunCount,
        historical_accuracy: newAccuracy,
        common_failure_modes_json: mergedFailures,
        confidence: computeConfidence(markers, newRunCount),
        updated_at: new Date().toISOString(),
      })
      .eq('fingerprint_hash', hash)
      .select('*')
      .single();

    if (error) throw new Error(`[fingerprintingService] update fingerprint failed: ${error.message}`);
    return data as SupplierFingerprint;
  }

  // Check for near-duplicates before creating (non-blocking)
  await detectAndLogMergeCandidates(markers, hash).catch(() => { /* non-critical */ });

  const initialAccuracy = Math.min(1, Math.max(0, diagnosticConfidenceScore / 100));
  const { data, error } = await supabase
    .from('supplier_fingerprints')
    .insert({
      supplier_name_normalized: markers.supplierNameNormalized,
      template_family_id: templateFamilyId,
      fingerprint_hash: hash,
      markers_json: markers as unknown as Record<string, unknown>,
      total_phrase_family: markers.totalStyle,
      section_order_json: null,
      table_style: markers.tableStyle,
      gst_mode: markers.gstMode,
      common_failure_modes_json: failureCodes.slice(0, 10),
      historical_run_count: 1,
      historical_accuracy: initialAccuracy,
      confidence: computeConfidence(markers, 1),
    })
    .select('*')
    .single();

  if (error) throw new Error(`[fingerprintingService] create fingerprint failed: ${error.message}`);
  return data as SupplierFingerprint;
}

async function linkRunToFingerprint(
  runId: string,
  fingerprint: SupplierFingerprint,
  markers: FingerprintMarkers,
  matchedMarkers: string[],
): Promise<RunFingerprintLink> {
  // Select full row so existing link can be returned with correct shape
  const { data: existingLink } = await supabase
    .from('run_fingerprint_links')
    .select('*')
    .eq('run_id', runId)
    .maybeSingle();

  if (existingLink) {
    return existingLink as RunFingerprintLink;
  }

  const { data, error } = await supabase
    .from('run_fingerprint_links')
    .insert({
      run_id: runId,
      supplier_name_normalized: markers.supplierNameNormalized,
      template_family_id: fingerprint.template_family_id,
      confidence: fingerprint.confidence,
      matched_markers_json: matchedMarkers,
    })
    .select('*')
    .single();

  if (error) throw new Error(`[fingerprintingService] linkRunToFingerprint failed: ${error.message}`);
  return data as RunFingerprintLink;
}

export async function fingerprintRun(
  runId: string,
  dataset: ResolvedDataset,
): Promise<{ fingerprint: SupplierFingerprint; link: RunFingerprintLink }> {
  const [diagnostics, failureCodes] = await Promise.all([
    loadDiagnosticsForRun(runId),
    loadFailureCodesForRun(runId),
  ]);

  const markers = buildMarkers(dataset, diagnostics);
  const hash = computeFingerprintHash(markers);
  const templateFamilyId = buildTemplateFamilyId(markers, hash);

  const diagnosticConfidenceScore =
    typeof diagnostics.confidence_score === 'number' ? diagnostics.confidence_score : 50;

  const fingerprint = await createOrUpdateFingerprint(
    markers,
    hash,
    templateFamilyId,
    failureCodes,
    diagnosticConfidenceScore,
  );

  const matchedMarkers = [
    markers.tableStyle !== 'unknown' ? `table_style:${markers.tableStyle}` : null,
    markers.gstMode !== 'unknown' ? `gst_mode:${markers.gstMode}` : null,
    markers.supplierNameNormalized ? `supplier:${markers.supplierNameNormalized}` : null,
    markers.documentFormatFamily ? `format:${markers.documentFormatFamily}` : null,
  ].filter(Boolean) as string[];

  const link = await linkRunToFingerprint(runId, fingerprint, markers, matchedMarkers);

  return { fingerprint, link };
}

export async function getAllFingerprints(limit = 100): Promise<SupplierFingerprint[]> {
  const { data, error } = await supabase
    .from('supplier_fingerprints')
    .select('*')
    .order('historical_run_count', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`[fingerprintingService] getAllFingerprints failed: ${error.message}`);
  return (data ?? []) as SupplierFingerprint[];
}

export async function getFingerprintForRun(runId: string): Promise<{
  link: RunFingerprintLink | null;
  fingerprint: SupplierFingerprint | null;
}> {
  const { data: link, error: linkErr } = await supabase
    .from('run_fingerprint_links')
    .select('*')
    .eq('run_id', runId)
    .maybeSingle();

  if (linkErr || !link) return { link: null, fingerprint: null };

  const { data: fp, error: fpErr } = await supabase
    .from('supplier_fingerprints')
    .select('*')
    .eq('template_family_id', (link as RunFingerprintLink).template_family_id)
    .maybeSingle();

  if (fpErr) return { link: link as RunFingerprintLink, fingerprint: null };
  return { link: link as RunFingerprintLink, fingerprint: fp as SupplierFingerprint | null };
}
