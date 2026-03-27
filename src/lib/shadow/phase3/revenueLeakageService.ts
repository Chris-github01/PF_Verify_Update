import { supabase } from '../../supabase';
import type { ResolvedDataset } from '../phase1/sourceAdapters';
import type { ScopeIntelligenceResult } from './scopeIntelligenceService';
import type { RateIntelligenceResult } from './rateIntelligenceService';

export interface ShadowRevenueLeakageEvent {
  id: string;
  run_id: string;
  leakage_type: string;
  description: string;
  estimated_value: number | null;
  confidence: number;
  source: string;
  reference_id: string | null;
  created_at: string;
}

export interface RevenueLeakageSummary {
  events: ShadowRevenueLeakageEvent[];
  totalEstimatedLeakage: number;
  highConfidenceLeakage: number;
  leakageByType: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Estimate the value of a scope gap using dataset averages.
// When similar items exist in the dataset, use their average rate × 1 unit
// as a minimum-impact estimate. Returns null when no signal is available.
// ---------------------------------------------------------------------------
function estimateScopeGapValue(
  dataset: ResolvedDataset,
  gapType: string,
): number | null {
  const priced = dataset.lineItems.filter(
    (i) => typeof i.total === 'number' && i.total > 0,
  );
  if (priced.length === 0) return null;

  // Heuristic: estimate as a % of contract value based on gap type severity
  const contractValue = priced.reduce((sum, i) => sum + (typeof i.total === 'number' ? i.total : 0), 0);
  if (contractValue <= 0) return null;

  const gapValuePercents: Record<string, number> = {
    commissioning_hydraulic: 0.03,
    commissioning_fire: 0.03,
    commissioning_air: 0.03,
    commissioning_electrical: 0.025,
    pipe_insulation: 0.04,
    ductwork_insulation: 0.035,
    backflow_prevention: 0.015,
    drainage_stormwater: 0.025,
    hydraulic_calcs: 0.01,
    as_built_drawings: 0.01,
  };

  const pct = gapValuePercents[gapType] ?? 0.02;
  return Math.round(contractValue * pct);
}

// ---------------------------------------------------------------------------
// Confidence weighting rules:
// - Strong signal with direct evidence → 0.85–0.95
// - Inferred from dataset patterns    → 0.55–0.75
// - Weak heuristic / no supporting data → 0.25–0.45
// ---------------------------------------------------------------------------
function buildLeakageEvents(
  runId: string,
  dataset: ResolvedDataset,
  scope: ScopeIntelligenceResult,
  rates: RateIntelligenceResult,
  parsedValue: number,
): Omit<ShadowRevenueLeakageEvent, 'id' | 'created_at'>[] {
  const events: Omit<ShadowRevenueLeakageEvent, 'id' | 'created_at'>[] = [];

  // --- Source: document_truth — parser vs document total mismatch ---
  // Strong signal: direct delta between what was extracted and what the document states.
  const documentTotal = dataset.documentTotal;
  if (documentTotal != null && documentTotal > 0 && parsedValue > 0) {
    const delta = Math.abs(parsedValue - documentTotal);
    const deltaPercent = (delta / documentTotal) * 100;
    if (deltaPercent > 2) {
      events.push({
        run_id: runId,
        leakage_type: 'total_mismatch',
        description: `Parsed total ($${parsedValue.toFixed(0)}) differs from document total ($${documentTotal.toFixed(0)}) by ${deltaPercent.toFixed(1)}%`,
        estimated_value: Math.round(delta),
        confidence: deltaPercent > 10 ? 0.95 : 0.85,
        source: 'document_truth',
        reference_id: null,
      });
    }
  }

  // --- Source: rate — anomalous rate records ---
  // Confidence: 0.75 (clear benchmark signal); estimated value = delta × plausible qty.
  for (const anomaly of rates.records.filter((r) => r.anomaly_flag)) {
    const rateVal = anomaly.rate ?? 0;
    const benchmarkVal = anomaly.benchmark_rate ?? 0;
    const delta = benchmarkVal > 0 && rateVal > 0 ? Math.abs(rateVal - benchmarkVal) : null;

    // Estimate quantity impact: assume 1 unit as minimum plausible exposure
    const estimatedImpact = delta !== null ? Math.round(delta) : null;

    events.push({
      run_id: runId,
      leakage_type:
        anomaly.variance_type === 'significantly_under' ? 'under_priced_rate' : 'over_priced_rate',
      description: `Rate anomaly: "${anomaly.item_description.slice(0, 80)}" — $${rateVal.toFixed(2)}/unit vs benchmark $${benchmarkVal.toFixed(2)}/unit (${anomaly.variance_percent != null ? anomaly.variance_percent.toFixed(0) + '%' : 'no benchmark'})`,
      estimated_value: estimatedImpact,
      confidence: 0.75,
      source: 'rate',
      reference_id: anomaly.id ?? null,
    });
  }

  // --- Source: scope — high-risk gaps ---
  // Confidence: 0.80 (high-risk expected scope not detected)
  // Estimated value: inferred from dataset contract value × type-specific %
  for (const gap of scope.gaps.filter((g) => g.risk_level === 'high')) {
    const estimatedValue = estimateScopeGapValue(dataset, gap.missing_scope_type);
    events.push({
      run_id: runId,
      leakage_type: 'scope_gap',
      description: `Potential missing scope: ${gap.description}`,
      estimated_value: estimatedValue,
      confidence: 0.80,
      source: 'scope',
      reference_id: gap.id ?? null,
    });
  }

  // --- Source: scope — medium-risk gaps ---
  // Confidence: 0.50 (probable but not certain)
  // Estimated value: same heuristic but lower
  for (const gap of scope.gaps.filter((g) => g.risk_level === 'medium')) {
    const estimatedValue = estimateScopeGapValue(dataset, gap.missing_scope_type);
    events.push({
      run_id: runId,
      leakage_type: 'scope_gap',
      description: `Potential missing scope: ${gap.description}`,
      estimated_value: estimatedValue !== null ? Math.round(estimatedValue * 0.5) : null,
      confidence: 0.50,
      source: 'scope',
      reference_id: gap.id ?? null,
    });
  }

  // --- Source: scope — high-risk exclusions ---
  // Confidence: 0.75 (explicit exclusion language detected)
  for (const exclusion of scope.exclusions.filter((e) => e.risk_level === 'high')) {
    events.push({
      run_id: runId,
      leakage_type: 'excluded_scope',
      description: `High-risk exclusion: ${exclusion.description.slice(0, 120)}`,
      estimated_value: null,
      confidence: 0.75,
      source: 'scope',
      reference_id: exclusion.id ?? null,
    });
  }

  // --- Source: scope — high provisional sum density ---
  // Confidence: 0.55 (inferred risk, not direct evidence)
  const provisionalItems = scope.qualifications.filter((q) => q.impact_type === 'provisional_sum');
  if (provisionalItems.length > 3) {
    events.push({
      run_id: runId,
      leakage_type: 'high_provisional_sum_density',
      description: `${provisionalItems.length} provisional sum items detected — commercial risk of scope creep`,
      estimated_value: null,
      confidence: 0.55,
      source: 'scope',
      reference_id: null,
    });
  }

  return events;
}

export async function runRevenueLeakageDetection(
  runId: string,
  dataset: ResolvedDataset,
  scope: ScopeIntelligenceResult,
  rates: RateIntelligenceResult,
  parsedValue: number,
): Promise<RevenueLeakageSummary> {
  const events = buildLeakageEvents(runId, dataset, scope, rates, parsedValue);

  if (events.length === 0) {
    console.log(`[Phase3/Leakage] run=${runId.slice(0, 8)} — no leakage signals detected`);
  } else {
    const { error } = await supabase.from('shadow_revenue_leakage_events').insert(events);
    if (error) {
      console.warn(`[Phase3/Leakage] insert failed run=${runId.slice(0, 8)}: ${error.message}`);
    } else {
      const highConf = events.filter((e) => e.confidence >= 0.75).length;
      const withValue = events.filter((e) => e.estimated_value !== null && e.estimated_value > 0).length;
      console.log(
        `[Phase3/Leakage] run=${runId.slice(0, 8)} — wrote ${events.length} events (${highConf} high-conf, ${withValue} with estimated value)`,
      );
    }
  }

  const totalEstimatedLeakage = events.reduce((sum, e) => sum + (e.estimated_value ?? 0), 0);
  const highConfidenceLeakage = events
    .filter((e) => e.confidence >= 0.75)
    .reduce((sum, e) => sum + (e.estimated_value ?? 0), 0);

  const leakageByType: Record<string, number> = {};
  for (const e of events) {
    leakageByType[e.leakage_type] =
      (leakageByType[e.leakage_type] ?? 0) + (e.estimated_value ?? 0);
  }

  return {
    events: events as ShadowRevenueLeakageEvent[],
    totalEstimatedLeakage,
    highConfidenceLeakage,
    leakageByType,
  };
}

export async function getRevenueLeakageForRun(runId: string): Promise<RevenueLeakageSummary> {
  const { data, error } = await supabase
    .from('shadow_revenue_leakage_events')
    .select('*')
    .eq('run_id', runId)
    .order('confidence', { ascending: false });

  if (error) {
    return { events: [], totalEstimatedLeakage: 0, highConfidenceLeakage: 0, leakageByType: {} };
  }

  const events = (data ?? []) as ShadowRevenueLeakageEvent[];
  const totalEstimatedLeakage = events.reduce((sum, e) => sum + (e.estimated_value ?? 0), 0);
  const highConfidenceLeakage = events
    .filter((e) => e.confidence >= 0.75)
    .reduce((sum, e) => sum + (e.estimated_value ?? 0), 0);

  const leakageByType: Record<string, number> = {};
  for (const e of events) {
    leakageByType[e.leakage_type] =
      (leakageByType[e.leakage_type] ?? 0) + (e.estimated_value ?? 0);
  }

  return { events, totalEstimatedLeakage, highConfidenceLeakage, leakageByType };
}
