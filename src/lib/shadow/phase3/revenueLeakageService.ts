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

function buildLeakageEvents(
  runId: string,
  dataset: ResolvedDataset,
  scope: ScopeIntelligenceResult,
  rates: RateIntelligenceResult,
  parsedValue: number,
): Omit<ShadowRevenueLeakageEvent, 'id' | 'created_at'>[] {
  const events: Omit<ShadowRevenueLeakageEvent, 'id' | 'created_at'>[] = [];

  // --- Source: document_truth — parser vs document total mismatch ---
  const documentTotal = dataset.documentTotal;
  if (documentTotal != null && documentTotal > 0 && parsedValue > 0) {
    const delta = Math.abs(parsedValue - documentTotal);
    const deltaPercent = (delta / documentTotal) * 100;
    if (deltaPercent > 2) {
      events.push({
        run_id: runId,
        leakage_type: 'total_mismatch',
        description: `Parsed total ($${parsedValue.toFixed(0)}) differs from document total ($${documentTotal.toFixed(0)}) by ${deltaPercent.toFixed(1)}%`,
        estimated_value: delta,
        confidence: deltaPercent > 10 ? 0.95 : 0.85,
        source: 'document_truth',
        reference_id: null,
      });
    }
  }

  // --- Source: rate — anomalous rate records ---
  for (const anomaly of rates.records.filter((r) => r.anomaly_flag)) {
    const rateVal = anomaly.rate ?? 0;
    const benchmarkVal = anomaly.benchmark_rate ?? 0;
    // Estimated impact per unit × 1 unit (qty not always available at this layer)
    const estimatedImpact =
      benchmarkVal > 0 && rateVal > 0 ? Math.abs(rateVal - benchmarkVal) : null;

    events.push({
      run_id: runId,
      leakage_type:
        anomaly.variance_type === 'significantly_under' ? 'under_priced_rate' : 'over_priced_rate',
      description: `Rate anomaly: "${anomaly.item_description.slice(0, 80)}" — $${rateVal.toFixed(2)}/unit vs benchmark $${benchmarkVal.toFixed(2)}/unit (${anomaly.variance_percent != null ? anomaly.variance_percent.toFixed(0) + '%' : 'no benchmark'})`,
      estimated_value: estimatedImpact,
      confidence: 0.7,
      source: 'rate',
      reference_id: anomaly.id ?? null,
    });
  }

  // --- Source: scope — high and medium risk gaps ---
  for (const gap of scope.gaps) {
    if (gap.risk_level === 'high' || gap.risk_level === 'medium') {
      events.push({
        run_id: runId,
        leakage_type: 'scope_gap',
        description: `Potential missing scope: ${gap.description}`,
        estimated_value: null,
        confidence: gap.risk_level === 'high' ? 0.8 : 0.5,
        source: 'scope',
        reference_id: gap.id ?? null,
      });
    }
  }

  // --- Source: scope — high risk exclusions ---
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
  const provisionalItems = scope.qualifications.filter((q) => q.impact_type === 'provisional_sum');
  if (provisionalItems.length > 3) {
    events.push({
      run_id: runId,
      leakage_type: 'high_provisional_sum_density',
      description: `${provisionalItems.length} provisional sum items detected — commercial risk of scope creep`,
      estimated_value: null,
      confidence: 0.6,
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
    console.log(`[Phase3/Leakage] runId=${runId.slice(0, 8)} — no leakage signals detected`);
  } else {
    const { error } = await supabase.from('shadow_revenue_leakage_events').insert(events);
    if (error) {
      console.warn(`[Phase3/Leakage] shadow_revenue_leakage_events insert failed: ${error.message}`);
    } else {
      const highConf = events.filter((e) => e.confidence >= 0.75).length;
      console.log(
        `[Phase3/Leakage] Wrote ${events.length} leakage events (${highConf} high-confidence) for run ${runId.slice(0, 8)}`,
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
