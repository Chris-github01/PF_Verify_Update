/**
 * Parser V2 — LLM-first orchestrator (production).
 *
 * Pipeline:
 *   1. classifyTrade             → primary trade (PF-first rules)
 *   2. classifyQuoteType         → itemized | lump_sum | hybrid
 *   3. classifySupplier          → supplier identity
 *   3b. sanitizePassiveFireText   (PF only, pre-structure)
 *                                → strips OCR noise (phone/date/FRR/
 *                                  refs) before any financial parsing
 *   4. classifyPassiveFireStructure (PF only, pre-extraction)
 *                                → authoritative total page, section roles,
 *                                  numeric red-flags (phone/FRR/references)
 *   5. extractByTrade            → trade-specific gpt-4.1 extractor
 *   6. selectPassiveFireAuthoritativeTotal (PF only)
 *                                → picks single main-scope total excl GST
 *   7. passive-fire intent       → sub_scope refinement when trade=passive_fire
 *   8. validation                → line math + totals + missing rows + confidence
 *   9. mappers                   → DB shape identical to legacy parser
 *
 * The orchestrator records a telemetry row to parser_v2_runs when a
 * SUPABASE service client is available; failures to record never
 * fail the pipeline.
 */

import { classifyTrade, type TradeClassification } from "./classifiers/classifyTrade.ts";
import { classifyQuoteType, type QuoteTypeClassification } from "./classifiers/classifyQuoteType.ts";
import { classifySupplier, type SupplierClassification } from "./classifiers/classifySupplier.ts";
import { classifyPassiveFireIntent } from "./classifiers/classifyPassiveFireIntent.ts";
import {
  classifyPassiveFireStructure,
  type PassiveFireStructure,
} from "./classifiers/classifyPassiveFireStructure.ts";
import {
  selectPassiveFireAuthoritativeTotal,
  type PassiveFireAuthoritativeTotal,
} from "./classifiers/selectPassiveFireAuthoritativeTotal.ts";
import {
  sanitizePassiveFireText,
  type PassiveFireSanitizerResult,
} from "./classifiers/sanitizePassiveFireText.ts";
import {
  validatePassiveFireParse,
  type PassiveFireValidationResult,
} from "./validation/validatePassiveFireParse.ts";
import {
  composePassiveFireFinalRecord,
  type PassiveFireFinalRecord,
} from "./composePassiveFireFinalRecord.ts";

import { extractPassiveFire } from "./extractors/extractPassiveFire.ts";
import { extractElectrical } from "./extractors/extractElectrical.ts";
import { extractPlumbing } from "./extractors/extractPlumbing.ts";
import { extractHVAC } from "./extractors/extractHVAC.ts";
import { extractActiveFire } from "./extractors/extractActiveFire.ts";
import { extractCarpentry } from "./extractors/extractCarpentry.ts";
import { extractFallback } from "./extractors/extractFallback.ts";

import { validateTotals } from "./validation/validateTotals.ts";
import { validateLineMath } from "./validation/validateLineMath.ts";
import { detectMissingRows } from "./validation/detectMissingRows.ts";
import { scoreConfidence } from "./validation/scoreConfidence.ts";

import { mapToQuotesTable } from "./mappers/mapToQuotesTable.ts";
import { mapToQuoteItems } from "./mappers/mapToQuoteItems.ts";

import { StageTracker, ParserV2StageError, type StageRecord } from "./stageTracker.ts";
import {
  installActiveTracker,
  clearActiveTracker,
  installExtractionDiagnostics,
  clearExtractionDiagnostics,
  type ExtractionDiagnostics,
} from "./telemetrySink.ts";

import { runPathB, type PathBResult } from "./multipath/pathB_commercialTotals.ts";
import { runPathC, type PathCResult } from "./multipath/pathC_deterministicStructure.ts";
import { decide, type MultiPathDecision } from "./multipath/decisionEngine.ts";

export type ParserV2Input = {
  rawText: string;
  pages: { pageNum: number; text: string }[];
  fileName: string;
  supplierHint?: string;
  tradeHint?: string;
  projectId: string;
  organisationId: string;
  quoteId?: string;
  openAIKey: string;
  persistStages?: (stages: StageRecord[]) => void;
};

export type ParsedLineItemV2 = {
  item_number: string | null;
  description: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total_price: number | null;
  scope_category: "main" | "optional" | "excluded";
  trade: string;
  sub_scope: string | null;
  frr: string | null;
  source: "llm" | "regex_fallback";
  confidence: number;
};

export type ParserV2Output = {
  classification: {
    trade: TradeClassification;
    quoteType: QuoteTypeClassification;
    supplier: SupplierClassification;
  };
  items: ParsedLineItemV2[];
  totals: {
    main_total: number;
    optional_total: number;
    excluded_total: number;
    grand_total: number;
    resolution_source: string;
    confidence: "HIGH" | "MEDIUM" | "LOW";
  };
  validation: {
    totals_ok: boolean;
    line_math_ok: boolean;
    line_math_mismatch_rate: number;
    missing_rows: string[];
    anomalies: string[];
  };
  requires_review: boolean;
  telemetry: {
    stage_durations_ms: Record<string, number>;
    total_duration_ms: number;
    extractor_used: string;
    stages: StageRecord[];
  };
  passive_fire_structure: PassiveFireStructure | null;
  passive_fire_authoritative_total: PassiveFireAuthoritativeTotal | null;
  passive_fire_sanitizer: PassiveFireSanitizerResult | null;
  passive_fire_validation: PassiveFireValidationResult | null;
  passive_fire_final: PassiveFireFinalRecord | null;
  multipath: {
    decision: MultiPathDecision;
    pathB: PathBResult;
    pathC: PathCResult;
  };
  extraction_diagnostics: {
    primary: ExtractionQualitySummary;
    fallback: ExtractionQualitySummary | null;
  };
  dbPayload: {
    quote: ReturnType<typeof mapToQuotesTable>;
    items: ReturnType<typeof mapToQuoteItems>;
  };
};

export type ExtractionQualitySummary = {
  rows_returned: number;
  main_total: number | null;
  optional_total: number | null;
  totals_found: boolean;
  passed: boolean;
  empty_reason: string | null;
  raw_response_chars: number;
  raw_response_sample: string | null;
  successful_responses: number;
  empty_content_count: number;
  malformed_json_count: number;
  malformed_samples: string[];
};

function evaluateExtractionQuality(
  items: ParsedLineItemV2[],
  diagnostics: ExtractionDiagnostics,
): ExtractionQualitySummary {
  const mainSum = items
    .filter((it) => it.scope_category === "main")
    .reduce((s, it) => s + (it.total_price ?? 0), 0);
  const optionalSum = items
    .filter((it) => it.scope_category === "optional")
    .reduce((s, it) => s + (it.total_price ?? 0), 0);
  const main_total = mainSum > 0 ? mainSum : null;
  const optional_total = optionalSum > 0 ? optionalSum : null;
  const totals_found = main_total != null || optional_total != null;
  const rows_returned = items.length;

  let empty_reason: string | null = null;
  if (rows_returned === 0 && !totals_found) {
    if (diagnostics.malformed_json_count > 0 && diagnostics.successful_responses === 0) {
      empty_reason = "malformed_output";
    } else if (diagnostics.successful_responses === 0) {
      empty_reason = "no_llm_response";
    } else {
      empty_reason = "extractor_empty_output";
    }
  }

  return {
    rows_returned,
    main_total,
    optional_total,
    totals_found,
    passed: rows_returned >= 1 || totals_found,
    empty_reason,
    raw_response_chars: diagnostics.raw_response_chars,
    raw_response_sample: diagnostics.raw_response_sample,
    successful_responses: diagnostics.successful_responses,
    empty_content_count: diagnostics.empty_content_count,
    malformed_json_count: diagnostics.malformed_json_count,
    malformed_samples: diagnostics.malformed_samples,
  };
}

type ExtractorFn = (ctx: {
  rawText: string;
  pages: { pageNum: number; text: string }[];
  quoteType: string;
  supplier: string;
  openAIKey: string;
  structure?: PassiveFireStructure | null;
}) => Promise<ParsedLineItemV2[]>;

const EXTRACTOR_BY_TRADE: Record<string, ExtractorFn> = {
  passive_fire: extractPassiveFire,
  electrical: extractElectrical,
  plumbing: extractPlumbing,
  hvac: extractHVAC,
  active_fire: extractActiveFire,
  carpentry: extractCarpentry,
};

export async function runParserV2(input: ParserV2Input): Promise<ParserV2Output> {
  const runStart = Date.now();
  const durations: Record<string, number> = {};
  const anomalies: string[] = [];
  const tracker = new StageTracker();
  if (input.persistStages) tracker.setSink(input.persistStages);
  installActiveTracker(tracker);

  try {
    if (!input.openAIKey) {
      tracker.start("preflight");
      tracker.fail("preflight", new Error("parser_v2: openAIKey is required"));
      throw new ParserV2StageError(
        "parser_v2: openAIKey is required",
        "preflight",
        tracker.snapshot(),
      );
    }
    if (!input.rawText?.trim()) {
      tracker.start("preflight");
      tracker.fail("preflight", new Error("parser_v2: rawText is empty"));
      throw new ParserV2StageError(
        "parser_v2: rawText is empty",
        "preflight",
        tracker.snapshot(),
      );
    }

    const classificationContext = {
      rawText: input.rawText,
      fileName: input.fileName,
      supplierHint: input.supplierHint,
      tradeHint: input.tradeHint,
      openAIKey: input.openAIKey,
    };

    tracker.start("classification");
    const classifyStart = Date.now();
    const [tradeResult, quoteTypeResult, supplierResult] = await Promise.allSettled([
      classifyTrade(classificationContext),
      classifyQuoteType(classificationContext),
      classifySupplier(classificationContext),
    ]);
    durations.classification = Date.now() - classifyStart;
    const classifierErrors = [tradeResult, quoteTypeResult, supplierResult]
      .filter((r) => r.status === "rejected")
      .map((r) => (r as PromiseRejectedResult).reason);
    if (classifierErrors.length === 3) {
      tracker.fail("classification", classifierErrors[0]);
    } else {
      tracker.succeed("classification");
    }

    const trade = unwrap(tradeResult, {
      trade: "unknown" as const,
      confidence: 0,
      rationale: "classifier_failed",
      secondary_trades: [],
    });
    const quoteType = unwrap(quoteTypeResult, {
      quoteType: "unknown" as const,
      confidence: 0,
      signals: [],
    });
    const supplier = unwrap(supplierResult, {
      supplierName: input.supplierHint ?? "Unknown Supplier",
      confidence: 0,
      source: "fallback" as const,
    });

    if (tradeResult.status === "rejected") anomalies.push("classify_trade_failed");
    if (quoteTypeResult.status === "rejected") anomalies.push("classify_quote_type_failed");
    if (supplierResult.status === "rejected") anomalies.push("classify_supplier_failed");

    let passive_fire_sanitizer: PassiveFireSanitizerResult | null = null;
    let effectiveRawText = input.rawText;
    let effectivePages = input.pages;
    if (trade.trade === "passive_fire") {
      tracker.start("pf_sanitize");
      const sanitizeStart = Date.now();
      try {
        passive_fire_sanitizer = await sanitizePassiveFireText({
          rawText: input.rawText,
          pages: input.pages,
          supplier: supplier.supplierName,
          fileName: input.fileName,
          openAIKey: input.openAIKey,
        });
        if (passive_fire_sanitizer.clean_pages.length > 0) {
          effectivePages = passive_fire_sanitizer.clean_pages;
        }
        if (passive_fire_sanitizer.clean_text && passive_fire_sanitizer.clean_text.trim().length > 0) {
          effectiveRawText = passive_fire_sanitizer.clean_text;
        }
        tracker.succeed("pf_sanitize");
      } catch (err) {
        console.error("[parser_v2] passive fire sanitizer failed", err);
        anomalies.push("pf_sanitizer_failed");
        tracker.fail("pf_sanitize", err);
      }
      durations.pf_sanitize = Date.now() - sanitizeStart;
    } else {
      tracker.skip("pf_sanitize", "trade is not passive_fire");
    }

    let passive_fire_structure: PassiveFireStructure | null = null;
    if (trade.trade === "passive_fire") {
      tracker.start("pf_structure");
      const structStart = Date.now();
      try {
        passive_fire_structure = await classifyPassiveFireStructure({
          rawText: effectiveRawText,
          pages: effectivePages,
          fileName: input.fileName,
          supplier: supplier.supplierName,
          openAIKey: input.openAIKey,
        });
        tracker.succeed("pf_structure");
      } catch (err) {
        console.error("[parser_v2] passive fire structure analysis failed", err);
        anomalies.push("pf_structure_analysis_failed");
        tracker.fail("pf_structure", err);
      }
      durations.pf_structure = Date.now() - structStart;
    } else {
      tracker.skip("pf_structure", "trade is not passive_fire");
    }

    const extractor = EXTRACTOR_BY_TRADE[trade.trade] ?? extractFallback;
    const extractorName = EXTRACTOR_BY_TRADE[trade.trade] ? trade.trade : "fallback";

    tracker.start("extraction");
    const extractStart = Date.now();
    const primaryDiag = installExtractionDiagnostics();
    let items: ParsedLineItemV2[] = [];
    let extractionThrew = false;
    try {
      items = await extractor({
        rawText: effectiveRawText,
        pages: effectivePages,
        quoteType: quoteType.quoteType,
        supplier: supplier.supplierName,
        openAIKey: input.openAIKey,
        structure: passive_fire_structure,
      });
    } catch (err) {
      console.error("[parser_v2] extractor threw", err);
      anomalies.push("extractor_threw");
      extractionThrew = true;
      tracker.fail("extraction", err);
    }
    durations.extraction = Date.now() - extractStart;
    const primaryQuality = evaluateExtractionQuality(items, primaryDiag);
    clearExtractionDiagnostics();

    // Quality gate: an extractor that returned nothing usable is FAILED,
    // not PASSED. A stage with zero rows and no totals is not a success.
    if (!extractionThrew) {
      if (primaryQuality.passed) {
        tracker.succeed("extraction");
      } else {
        anomalies.push(
          primaryQuality.empty_reason === "malformed_output"
            ? "extractor_malformed_output"
            : "extractor_empty_output",
        );
        tracker.fail(
          "extraction",
          new Error(
            primaryQuality.empty_reason === "malformed_output"
              ? "malformed_output"
              : "extractor_empty_output",
          ),
        );
      }
    }

    // Fallback extraction runs whenever the primary produced nothing
    // usable (zero rows AND no totals) — same quality gate applies.
    let fallbackQuality: ExtractionQualitySummary | null = null;
    if (!primaryQuality.passed && extractor !== extractFallback) {
      if (!extractionThrew) anomalies.push("primary_extractor_zero_rows");
      tracker.start("fallback_extraction");
      const fbStart = Date.now();
      const fbDiag = installExtractionDiagnostics();
      let fbThrew = false;
      try {
        items = await extractFallback({
          rawText: input.rawText,
          pages: input.pages,
          quoteType: quoteType.quoteType,
          supplier: supplier.supplierName,
          openAIKey: input.openAIKey,
        });
      } catch (err) {
        fbThrew = true;
        tracker.fail("fallback_extraction", err);
        anomalies.push("fallback_extractor_threw");
      }
      durations.fallback_extraction = Date.now() - fbStart;
      fallbackQuality = evaluateExtractionQuality(items, fbDiag);
      clearExtractionDiagnostics();
      if (!fbThrew) {
        if (fallbackQuality.passed) {
          tracker.succeed("fallback_extraction");
        } else {
          anomalies.push(
            fallbackQuality.empty_reason === "malformed_output"
              ? "fallback_malformed_output"
              : "fallback_empty_output",
          );
          tracker.fail(
            "fallback_extraction",
            new Error(
              fallbackQuality.empty_reason === "malformed_output"
                ? "malformed_output"
                : "extractor_empty_output",
            ),
          );
        }
      }
    }

    let passive_fire_authoritative_total: PassiveFireAuthoritativeTotal | null = null;
    if (trade.trade === "passive_fire" && items.length > 0) {
      tracker.start("pf_authoritative_total");
      const selectorStart = Date.now();
      try {
        passive_fire_authoritative_total = await selectPassiveFireAuthoritativeTotal({
          structure: passive_fire_structure,
          items,
          rawText: effectiveRawText,
          pages: effectivePages,
          supplier: supplier.supplierName,
          openAIKey: input.openAIKey,
        });
        tracker.succeed("pf_authoritative_total");
      } catch (err) {
        console.error("[parser_v2] passive fire authoritative total selection failed", err);
        anomalies.push("pf_authoritative_total_failed");
        tracker.fail("pf_authoritative_total", err);
      }
      durations.pf_authoritative_total = Date.now() - selectorStart;
    } else {
      tracker.skip(
        "pf_authoritative_total",
        trade.trade !== "passive_fire" ? "trade is not passive_fire" : "no items extracted",
      );
    }

    if (trade.trade === "passive_fire" && items.length > 0) {
      tracker.start("pf_intent");
      const intentStart = Date.now();
      try {
        const intent = await classifyPassiveFireIntent({
          items,
          openAIKey: input.openAIKey,
        });
        items = intent.items;
        tracker.succeed("pf_intent");
      } catch (err) {
        console.error("[parser_v2] passive fire intent failed, keeping raw items", err);
        anomalies.push("passive_fire_intent_failed");
        tracker.fail("pf_intent", err);
      }
      durations.pf_intent = Date.now() - intentStart;
    } else {
      tracker.skip(
        "pf_intent",
        trade.trade !== "passive_fire" ? "trade is not passive_fire" : "no items extracted",
      );
    }

    let passive_fire_validation: PassiveFireValidationResult | null = null;
    if (trade.trade === "passive_fire") {
      tracker.start("pf_validation");
      const pfValStart = Date.now();
      try {
        passive_fire_validation = await validatePassiveFireParse({
          structure: passive_fire_structure,
          authoritative: passive_fire_authoritative_total,
          sanitizer: passive_fire_sanitizer,
          items,
          supplier: supplier.supplierName,
          openAIKey: input.openAIKey,
        });
        tracker.succeed("pf_validation");
      } catch (err) {
        console.error("[parser_v2] passive fire validation failed", err);
        anomalies.push("pf_validation_failed");
        tracker.fail("pf_validation", err);
      }
      durations.pf_validation = Date.now() - pfValStart;
    } else {
      tracker.skip("pf_validation", "trade is not passive_fire");
    }

    tracker.start("validation");
    const validationStart = Date.now();
    let lineMath: ReturnType<typeof validateLineMath>;
    let totals: ReturnType<typeof validateTotals>;
    let missing: ReturnType<typeof detectMissingRows>;
    let confidence: ReturnType<typeof scoreConfidence>;
    try {
      lineMath = validateLineMath(items);
      totals = validateTotals(items, input.rawText);
      missing = detectMissingRows(items, input.rawText, quoteType.quoteType);
      confidence = scoreConfidence({
        items,
        lineMathOk: lineMath.ok,
        totalsOk: totals.ok,
        missingRows: missing.missing,
        quoteType: quoteType.quoteType,
      });
      tracker.succeed("validation");
    } catch (err) {
      tracker.fail("validation", err);
      throw new ParserV2StageError(formatMessage(err), "validation", tracker.snapshot());
    }
    durations.validation = Date.now() - validationStart;

    // -------- MULTI-PATH DECISION ENGINE --------
    // Always run Path B (labelled totals) and Path C (deterministic
    // structure) — they are fast, deterministic, and provide a safety
    // net when Path A extracts zero rows or returns a suspect total.
    tracker.start("multipath_decision");
    const multipathStart = Date.now();
    let multipathResult: { decision: MultiPathDecision; pathB: PathBResult; pathC: PathCResult };
    try {
      const pathB = runPathB({
        rawText: effectiveRawText,
        pages: effectivePages,
      });
      const pathC = runPathC({
        rawText: effectiveRawText,
        pages: effectivePages,
      });
      const rowSumMain = items
        .filter((it) => it.scope_category === "main")
        .reduce((s, it) => s + (it.total_price ?? 0), 0);
      const rowSumWithOptional = items.reduce((s, it) => s + (it.total_price ?? 0), 0);
      const decision = decide({
        pathA: {
          items_count: items.length,
          row_sum_main: rowSumMain,
          row_sum_with_optional: rowSumWithOptional,
          line_math_ok: lineMath.ok,
          totals_ok: totals.ok,
        },
        pathB,
        pathC,
      });
      multipathResult = { decision, pathB, pathC };

      // If Path A produced no total but the decision engine recovered
      // one, patch the totals object so downstream mappers and the
      // zero-items guard see a valid quote value.
      if (
        (!totals.grand_total || totals.grand_total <= 0) &&
        decision.selected_total != null &&
        decision.selected_total > 0
      ) {
        totals.main_total = decision.selected_total;
        totals.grand_total = decision.selected_total_inc_gst ?? decision.selected_total;
        totals.resolution_source = `multipath:${decision.winning_path}:${decision.rationale}`;
        anomalies.push("multipath_total_recovered");
      }
      tracker.succeed("multipath_decision");
    } catch (err) {
      console.error("[parser_v2] multi-path decision engine failed", err);
      anomalies.push("multipath_failed");
      tracker.fail("multipath_decision", err);
      multipathResult = {
        decision: {
          selected_total: null,
          selected_total_inc_gst: null,
          winning_path: null,
          confidence: "LOW",
          confidence_score: 0,
          secondary_candidates: [],
          requires_review: true,
          review_reasons: ["multipath_exception"],
          agreement: { a_b_match: null, a_c_match: null, b_c_match: null },
          rationale: "multi-path engine threw",
        },
        pathB: { candidates: [], best: null, succeeded: false },
        pathC: {
          all_currency: [],
          gst_relations: [],
          rollups: [],
          best_total: null,
          best_source: null,
          confidence: 0,
          succeeded: false,
        },
      };
    }
    durations.multipath_decision = Date.now() - multipathStart;

  const ERROR_ANOMALIES = new Set([
    "classify_trade_failed",
    "classify_quote_type_failed",
    "classify_supplier_failed",
    "extractor_threw",
    "primary_extractor_zero_rows",
    "passive_fire_intent_failed",
    "labelled_grand_subtotal_optional_mismatch",
    "no_totals_available",
  ]);
  const combinedAnomalies = [
    ...anomalies,
    ...lineMath.anomalies,
    ...totals.anomalies,
    ...missing.anomalies,
  ];
  const hasErrorAnomaly = combinedAnomalies.some((a) => ERROR_ANOMALIES.has(a));

  // Zero items alone no longer forces manual review — the multipath
  // decision engine can recover a valid quote total from labelled
  // totals (Path B) or deterministic structure (Path C).
  const multipathRecovered =
    items.length === 0 &&
    multipathResult.decision.selected_total != null &&
    multipathResult.decision.selected_total > 0 &&
    multipathResult.decision.confidence !== "LOW";

  // Gate 7: overall success requires valid rows OR a valid total.
  // Completed stages alone are not sufficient — a quote with zero items
  // and zero recovered total is a failure, not a "green pass".
  const hasValidOutput =
    items.length > 0 ||
    (totals.grand_total != null && totals.grand_total > 0) ||
    multipathRecovered;
  if (!hasValidOutput) {
    anomalies.push("no_business_output");
    combinedAnomalies.push("no_business_output");
  }

  const requires_review =
    confidence.level === "LOW" ||
    !totals.ok ||
    missing.missing.length > 0 ||
    !hasValidOutput ||
    hasErrorAnomaly ||
    (totals.variants_materially_different &&
      totals.reconciliation_confidence === "LOW") ||
    (passive_fire_validation?.requires_review ?? false) ||
    multipathResult.decision.requires_review;

  const mergedAnomalies = dedupeStrings(combinedAnomalies);

    tracker.start("mappers");
    let passive_fire_final: PassiveFireFinalRecord | null;
    let quote: ReturnType<typeof mapToQuotesTable>;
    let dbItems: ReturnType<typeof mapToQuoteItems>;
    try {
      passive_fire_final =
        trade.trade === "passive_fire"
          ? composePassiveFireFinalRecord({
              supplier: supplier.supplierName,
              items,
              structure: passive_fire_structure,
              authoritative: passive_fire_authoritative_total,
              sanitizer: passive_fire_sanitizer,
              validation: passive_fire_validation,
              pageCount: input.pages?.length ?? null,
              declaredQuoteType: quoteType.quoteType,
            })
          : null;

      quote = mapToQuotesTable({
        projectId: input.projectId,
        organisationId: input.organisationId,
        quoteId: input.quoteId,
        supplier: supplier.supplierName,
        trade: trade.trade,
        totals,
        confidence: confidence.level,
        requires_review,
        items,
      });
      dbItems = mapToQuoteItems({ items });
      tracker.succeed("mappers");
    } catch (err) {
      tracker.fail("mappers", err);
      throw new ParserV2StageError(formatMessage(err), "mappers", tracker.snapshot());
    }

    const total_duration_ms = Date.now() - runStart;

    return {
      classification: { trade, quoteType, supplier },
      items,
      totals: {
        main_total: totals.main_total,
        optional_total: totals.optional_total,
        excluded_total: totals.excluded_total,
        grand_total: totals.grand_total,
        resolution_source: totals.resolution_source,
        confidence: confidence.level,
      },
      validation: {
        totals_ok: totals.ok,
        line_math_ok: lineMath.ok,
        line_math_mismatch_rate: lineMath.mismatch_rate,
        missing_rows: missing.missing,
        anomalies: mergedAnomalies,
      },
      requires_review,
      telemetry: {
        stage_durations_ms: durations,
        total_duration_ms,
        extractor_used: extractorName,
        stages: tracker.snapshot(),
      },
      passive_fire_structure,
      passive_fire_authoritative_total,
      passive_fire_sanitizer,
      passive_fire_validation,
      passive_fire_final,
      multipath: multipathResult,
      extraction_diagnostics: {
        primary: primaryQuality,
        fallback: fallbackQuality,
      },
      dbPayload: { quote, items: dbItems },
    };
  } catch (err) {
    if (err instanceof ParserV2StageError) {
      clearActiveTracker();
      throw err;
    }
    tracker.failAllInFlight(err);
    const staged = new ParserV2StageError(
      formatMessage(err),
      tracker.firstFailure()?.name ?? "unknown",
      tracker.snapshot(),
    );
    clearActiveTracker();
    throw staged;
  } finally {
    clearActiveTracker();
  }
}

function formatMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try { return JSON.stringify(err); } catch { return "Unknown error"; }
}

function unwrap<T>(r: PromiseSettledResult<T>, fallback: T): T {
  return r.status === "fulfilled" ? r.value : fallback;
}

function dedupeStrings(xs: string[]): string[] {
  return [...new Set(xs)];
}
