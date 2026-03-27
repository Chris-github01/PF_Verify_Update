import { supabase } from '../supabase';
import { runLiveParser } from '../modules/parsers/plumbing/live';
import { runShadowParser } from '../modules/parsers/plumbing/shadow';
import { LIVE_PARSER_VERSION, SHADOW_PARSER_VERSION } from '../modules/parsers/plumbing/shared';
import type { PlumbingParserOutput } from '../modules/parsers/plumbing/types';
import type { RunMode } from '../../types/shadow';
import { getShadowModule, getAdapterKey, isDeepDiffEnabled } from './phase1/shadowModuleRegistry';
import { resolveDataset } from './phase1/sourceAdapters';
import { buildAndSaveDiagnostics } from './phase1/runDiagnosticsBuilder';
import { classifyAndSaveFailures } from './phase1/failureClassifier';
import { resolveDocumentTruth } from './phase1/shadowDocumentTruth';
import { fingerprintRun } from './phase2/fingerprintingService';
import { evaluateAndEnqueueRun } from './phase2/learningQueueService';
import { runScopeIntelligence } from './phase3/scopeIntelligenceService';
import { runRateIntelligence } from './phase3/rateIntelligenceService';
import { runRevenueLeakageDetection } from './phase3/revenueLeakageService';
import { computeCommercialRiskProfile, persistCommercialRiskProfile } from './phase3/commercialRiskEngine';
import { runConsistencyCheck } from './phase3/consistencyChecker';
import { getActiveVersionForModule, linkRunToVersion } from './phase4/shadowVersioningService';
import { evaluateRunForVersion } from './phase4/benchmarkEvaluationEngine';

export interface RunShadowComparisonInput {
  moduleKey: string;
  quoteId: string;
  mode: RunMode;
}

export interface RunShadowComparisonResult {
  runId: string;
  status: 'completed' | 'failed';
  error?: string;
}

function buildRunOutput(output: PlumbingParserOutput): Record<string, unknown> {
  return {
    parserVersion: output.parserVersion,
    parsedValue: output.parsedValue,
    detectedDocumentTotal: output.detectedDocumentTotal,
    differenceToDocumentTotal: output.differenceToDocumentTotal,
    includedLineCount: output.includedLineCount,
    excludedLineCount: output.excludedLineCount,
    totalRowCount: output.totalRowCount,
    parserWarnings: output.parserWarnings,
    hasTotalMismatch: output.hasTotalMismatch,
    hasLikelyFinalTotalAsLineItem: output.hasLikelyFinalTotalAsLineItem,
    hasDuplicateValueRisk: output.hasDuplicateValueRisk,
    ruleHitsSummary: output.ruleHitsSummary,
    rows: output.allRows,
    items: output.includedRows,
    executedAt: output.executedAt,
  };
}

function buildPassthroughOutput(
  moduleKey: string,
  quoteId: string,
  itemCount: number,
  documentTotal: number | null,
  parsedValue: number,
): Record<string, unknown> {
  return {
    parserVersion: 'passthrough-v1',
    moduleKey,
    sourceId: quoteId,
    sourceType: 'quote',
    parsedValue,
    detectedDocumentTotal: documentTotal,
    differenceToDocumentTotal: documentTotal != null ? parsedValue - documentTotal : null,
    includedLineCount: itemCount,
    excludedLineCount: 0,
    totalRowCount: itemCount,
    parserWarnings: [],
    hasTotalMismatch: false,
    hasLikelyFinalTotalAsLineItem: false,
    hasDuplicateValueRisk: false,
    ruleHitsSummary: {},
    rows: [],
    items: [],
    executedAt: new Date().toISOString(),
    note: `Passthrough snapshot for ${moduleKey} — deep diff not available for this trade module`,
  };
}

export async function runShadowComparison(
  input: RunShadowComparisonInput,
): Promise<RunShadowComparisonResult> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const module = await getShadowModule(input.moduleKey);
  if (!module) {
    throw new Error(`Shadow module not registered: ${input.moduleKey}`);
  }

  const adapterKey = getAdapterKey(module);
  const deepDiff = isDeepDiffEnabled(module);
  const usePlumbingParser = module.parser_family === 'plumbing' || deepDiff;

  const { data: runRecord, error: insertErr } = await supabase
    .from('shadow_runs')
    .insert({
      module_key: input.moduleKey,
      source_type: 'quote',
      source_id: input.quoteId,
      initiated_by: user.id,
      run_mode: input.mode,
      status: 'running',
      live_version: usePlumbingParser ? LIVE_PARSER_VERSION : 'passthrough-v1',
      shadow_version: usePlumbingParser ? SHADOW_PARSER_VERSION : 'passthrough-v1',
      started_at: new Date().toISOString(),
      metadata_json: {
        triggered_from: 'shadow_compare_ui',
        trade_module: input.moduleKey,
        adapter_key: adapterKey,
        deep_diff_enabled: deepDiff,
      },
    })
    .select('id')
    .single();

  if (insertErr) throw new Error(insertErr.message);
  const runId = runRecord.id as string;

  try {
    const resolvedDataset = await resolveDataset(adapterKey, input.quoteId);

    if (!resolvedDataset.lineItems || resolvedDataset.lineItems.length === 0) {
      const metaCount = resolvedDataset.itemCount;
      if (metaCount === 0) {
        throw new Error(
          `[${input.moduleKey}] No parsed line items found in dataset. ` +
          `Import and parse the quote before running shadow comparison.`,
        );
      }
      if (usePlumbingParser) {
        throw new Error(
          `[${input.moduleKey}] Quote has no parsed line items. Import and parse the quote first.`,
        );
      }
      console.warn(
        `[ShadowComparison] ${input.moduleKey}: quote_items returned 0 rows but ` +
        `meta count is ${metaCount}. Using passthrough snapshot. adapter=${adapterKey}`,
      );
    }

    console.log('[ShadowComparison] Preflight', {
      moduleKey: input.moduleKey,
      quoteId: input.quoteId.slice(0, 8),
      adapterKey,
      resolvedLineItems: resolvedDataset.lineItems.length,
      itemCount: resolvedDataset.itemCount,
      resolvedVia: resolvedDataset.resolvedVia,
      usePlumbingParser,
    });

    const sourceLabel = `${resolvedDataset.supplierName ?? 'Quote'} (${input.quoteId.slice(0, 8)})`;
    await supabase.from('shadow_runs').update({ source_label: sourceLabel }).eq('id', runId);

    let liveOutputJson: Record<string, unknown>;
    let shadowOutputJson: Record<string, unknown> | null = null;
    let liveMetrics: Record<string, unknown>;
    let shadowMetrics: Record<string, unknown> | null = null;

    const plumbingRows = resolvedDataset.lineItems.map((item) => ({
      description: item.description,
      qty: item.qty,
      unit: item.unit,
      rate: item.rate,
      total: item.total,
    }));

    if (usePlumbingParser && resolvedDataset.lineItems.length > 0) {
      const parserInput = {
        sourceType: 'quote' as const,
        sourceId: input.quoteId,
        rows: plumbingRows,
        documentTotal: resolvedDataset.documentTotal,
        supplierName: resolvedDataset.supplierName,
      };

      const liveOutput = runLiveParser(parserInput);
      liveOutputJson = buildRunOutput(liveOutput);
      liveMetrics = {
        parsedValue: liveOutput.parsedValue,
        itemCount: liveOutput.includedLineCount,
        excludedCount: liveOutput.excludedLineCount,
        totalMismatch: liveOutput.hasTotalMismatch,
        sourceItemCount: resolvedDataset.itemCount,
      };

      if (input.mode === 'live_vs_shadow') {
        const shadowOutput = runShadowParser(parserInput);
        shadowOutputJson = buildRunOutput(shadowOutput);
        const delta = Math.abs(liveOutput.parsedValue - shadowOutput.parsedValue);
        const deltaPercent = liveOutput.parsedValue > 0
          ? (delta / liveOutput.parsedValue) * 100
          : 0;
        shadowMetrics = {
          parsedValue: shadowOutput.parsedValue,
          itemCount: shadowOutput.includedLineCount,
          excludedCount: shadowOutput.excludedLineCount,
          totalMismatch: shadowOutput.hasTotalMismatch,
          deltaVsLive: delta,
          deltaPercentVsLive: deltaPercent,
          sourceItemCount: resolvedDataset.itemCount,
        };
      }
    } else {
      const passthroughParsedValue = resolvedDataset.lineItems.reduce((sum, r) => {
        const t = typeof r.total === 'number' ? r.total : parseFloat(String(r.total ?? '0')) || 0;
        return sum + t;
      }, 0);

      liveOutputJson = buildPassthroughOutput(
        input.moduleKey,
        input.quoteId,
        resolvedDataset.itemCount,
        resolvedDataset.documentTotal,
        passthroughParsedValue,
      );
      liveMetrics = {
        parsedValue: passthroughParsedValue,
        itemCount: resolvedDataset.itemCount,
        excludedCount: 0,
        totalMismatch: false,
        sourceItemCount: resolvedDataset.itemCount,
        resolvedVia: resolvedDataset.resolvedVia,
        passthrough: true,
      };

      if (input.mode === 'live_vs_shadow') {
        shadowOutputJson = {
          ...liveOutputJson,
          parserVersion: 'passthrough-shadow-v1',
          note: `Shadow passthrough snapshot for ${input.moduleKey}`,
        };
        shadowMetrics = {
          ...liveMetrics,
          deltaVsLive: 0,
          deltaPercentVsLive: 0,
        };
      }
    }

    const resultRows: {
      shadow_run_id: string;
      result_type: string;
      output_json: Record<string, unknown>;
      metrics_json: Record<string, unknown>;
    }[] = [
      {
        shadow_run_id: runId,
        result_type: 'live',
        output_json: liveOutputJson,
        metrics_json: liveMetrics,
      },
    ];

    if (shadowOutputJson && shadowMetrics) {
      resultRows.push({
        shadow_run_id: runId,
        result_type: 'shadow',
        output_json: shadowOutputJson,
        metrics_json: shadowMetrics,
      });
    }

    const { error: resultsErr } = await supabase.from('shadow_run_results').insert(resultRows);
    if (resultsErr) throw new Error(resultsErr.message);

    await supabase
      .from('shadow_runs')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', runId);

    (async () => {
      try {
        const [diagResult, truthResult] = await Promise.allSettled([
          buildAndSaveDiagnostics({
            runId,
            dataset: resolvedDataset,
            moduleKey: input.moduleKey,
            liveOutputJson,
            shadowOutputJson,
          }),
          resolveDocumentTruth({
            runId,
            dataset: resolvedDataset,
            liveOutput: liveOutputJson,
            shadowOutput: shadowOutputJson,
          }),
        ]);

        if (diagResult.status === 'rejected' && import.meta.env.DEV) {
          console.warn('[Phase1] buildAndSaveDiagnostics failed:', diagResult.reason);
        }
        if (truthResult.status === 'rejected' && import.meta.env.DEV) {
          console.warn('[Phase1] resolveDocumentTruth failed:', truthResult.reason);
        }

        if (diagResult.status === 'fulfilled') {
          const diagnostics = diagResult.value;
          await classifyAndSaveFailures(
            runId,
            resolvedDataset,
            liveOutputJson,
            shadowOutputJson,
            diagnostics,
          ).catch((err) => {
            if (import.meta.env.DEV) {
              console.warn('[Phase1] classifyAndSaveFailures failed:', err);
            }
          });
        }

        // Phase 2 hooks run strictly after Phase 1 classification is committed
        // This guarantees failure codes are readable by the queue scorer and fingerprinter
        let isNewFingerprint = false;
        try {
          const fpResult = await fingerprintRun(runId, resolvedDataset);
          isNewFingerprint = fpResult.fingerprint.historical_run_count === 1;
        } catch (err) {
          if (import.meta.env.DEV) {
            console.warn('[Phase2] fingerprintRun failed:', err);
          }
        }

        await evaluateAndEnqueueRun(runId, input.moduleKey, isNewFingerprint).catch((err) => {
          if (import.meta.env.DEV) {
            console.warn('[Phase2] evaluateAndEnqueueRun failed:', err);
          }
        });

        // Phase 3 hooks — commercial intelligence layer
        // Runs strictly after Phase 2 to ensure fingerprint and queue data are committed
        try {
          const [scopeSummary, rateSummary] = await Promise.all([
            runScopeIntelligence(runId, input.moduleKey, resolvedDataset),
            runRateIntelligence(runId, resolvedDataset),
          ]);

          const parsedVal = typeof liveMetrics.parsedValue === 'number' ? liveMetrics.parsedValue : 0;

          const leakageSummary = await runRevenueLeakageDetection(
            runId,
            resolvedDataset,
            scopeSummary,
            rateSummary,
            parsedVal,
          );

          const riskProfile = computeCommercialRiskProfile(
            runId,
            scopeSummary,
            rateSummary,
            leakageSummary,
            parsedVal,
          );

          await persistCommercialRiskProfile(input.moduleKey, riskProfile);

          // Phase 3.5 — consistency check (non-blocking, shadow-only)
          await runConsistencyCheck(
            runId,
            scopeSummary,
            rateSummary,
            leakageSummary,
            riskProfile,
          ).catch((err) => {
            if (import.meta.env.DEV) {
              console.warn('[Phase3/Consistency] check failed:', err);
            }
          });

          // Phase 3.5 — data quality guard: warn on empty outputs
          if (scopeSummary.items.length === 0) {
            console.warn(`[Phase3/Guard] run=${runId.slice(0, 8)} — zero scope items written (dataset may be empty or filter too strict)`);
          }
          if (rateSummary.records.length === 0) {
            console.warn(`[Phase3/Guard] run=${runId.slice(0, 8)} — zero rate records written (no items with positive unit rates)`);
          }
          if (leakageSummary.events.length === 0 && scopeSummary.gaps.length > 0) {
            console.warn(`[Phase3/Guard] run=${runId.slice(0, 8)} — ${scopeSummary.gaps.length} scope gap(s) detected but zero leakage events written`);
          }

          // Dev-safe debug summary per run
          if (import.meta.env.DEV) {
            console.log('[Phase3] Run debug summary:', {
              run: runId.slice(0, 8),
              scope_items: scopeSummary.items.length,
              scope_gaps: scopeSummary.gaps.length,
              scope_quals: scopeSummary.qualifications.length,
              scope_excl: scopeSummary.exclusions.length,
              rate_records: rateSummary.records.length,
              rate_anomalies: rateSummary.anomalyCount,
              leakage_events: leakageSummary.events.length,
              leakage_high_conf: leakageSummary.events.filter((e) => e.confidence >= 0.75).length,
              leakage_with_value: leakageSummary.events.filter((e) => (e.estimated_value ?? 0) > 0).length,
              total_estimated_leakage: leakageSummary.totalEstimatedLeakage,
              risk_score: riskProfile.overallScore,
              risk_level: riskProfile.riskLevel,
            });
          }
        } catch (err) {
          if (import.meta.env.DEV) {
            console.warn('[Phase3] commercial intelligence failed:', err);
          }
        }

        // Phase 4 — versioning hook: link run to active version and score it
        try {
          const activeVersion = await getActiveVersionForModule(input.moduleKey);
          if (activeVersion) {
            await linkRunToVersion(runId, activeVersion.id);
            await evaluateRunForVersion(runId, activeVersion.id);
            if (import.meta.env.DEV) {
              console.log(`[Phase4] Run linked to version ${activeVersion.version_name} and scored.`);
            }
          }
        } catch (err) {
          if (import.meta.env.DEV) {
            console.warn('[Phase4] versioning hook failed:', err);
          }
        }
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn('[Phase1/Phase2/Phase3] post-run hook chain failed:', err);
        }
      }
    })();

    return { runId, status: 'completed' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase
      .from('shadow_runs')
      .update({
        status: 'failed',
        error_message: msg,
        completed_at: new Date().toISOString(),
      })
      .eq('id', runId);

    return { runId, status: 'failed', error: msg };
  }
}

export interface QuoteOption {
  id: string;
  supplierName: string | null;
  totalPrice: number | null;
  trade: string | null;
  parseStatus: string | null;
  itemCount: number;
  hasItems: boolean;
}

export async function fetchPlumbingQuotes(limit = 80, includeEmpty = false): Promise<QuoteOption[]> {
  return fetchQuotesByTrade('plumbing', limit, includeEmpty);
}

export async function fetchQuotesByTrade(
  trade: string,
  limit = 80,
  includeEmpty = false,
): Promise<QuoteOption[]> {
  let query = supabase
    .from('quotes')
    .select('id, supplier_name, total_price, trade, parse_status, inserted_items_count, line_item_count, final_items_count')
    .eq('trade', trade)
    .eq('parse_status', 'success')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!includeEmpty) {
    query = query.or('inserted_items_count.gt.0,line_item_count.gt.0');
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map((q) => {
    const itemCount =
      (q.inserted_items_count ?? 0) > 0 ? (q.inserted_items_count as number) :
      (q.line_item_count ?? 0) > 0 ? (q.line_item_count as number) :
      (q.final_items_count ?? 0) as number;

    return {
      id: q.id,
      supplierName: q.supplier_name ?? null,
      totalPrice: q.total_price ?? null,
      trade: q.trade ?? null,
      parseStatus: q.parse_status ?? null,
      itemCount,
      hasItems: itemCount > 0,
    };
  });
}
