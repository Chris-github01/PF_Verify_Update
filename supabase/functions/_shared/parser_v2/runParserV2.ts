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
  extractRenderLayout,
  type RenderLayoutResult,
} from "./classifiers/extractRenderLayout.ts";
import {
  validatePassiveFireParse,
  type PassiveFireValidationResult,
} from "./validation/validatePassiveFireParse.ts";
import {
  composePassiveFireFinalRecord,
  type PassiveFireFinalRecord,
} from "./composePassiveFireFinalRecord.ts";

import { takeLastExtractorDebug, type ExtractorChunkDebug } from "./extractors/_extractorRuntime.ts";
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
import { installActiveTracker, clearActiveTracker } from "./telemetrySink.ts";

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
  /**
   * Optional raw PDF bytes. When provided, the Render PDF assistant
   * layer runs in parallel to LLM extraction as a layout intelligence
   * source. It is never authoritative; if omitted or unavailable the
   * parser continues normally.
   */
  pdfBytes?: Uint8Array | null;
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
  debug: {
    sanitize: {
      raw_response_text: string | null;
      parsed_json: unknown | null;
      parse_error: string | null;
      schema_error: string | null;
      input_chars: number;
      output_chars: number;
      retention_ratio: number;
      fallback_to_raw_text: boolean;
      reason: string | null;
    } | null;
    extraction: {
      chunks: ExtractorChunkDebug[];
      rows_before_validation: number;
      rows_after_validation: number;
    };
    fallback_extraction: {
      chunks: ExtractorChunkDebug[];
      rows_before_validation: number;
      rows_after_validation: number;
    } | null;
    render: {
      render_enabled: boolean;
      render_pages: number;
      render_rows_detected: number;
      render_tables_detected: number;
      render_totals_detected: number;
      render_sections_detected: number;
      extracted_text_chars: number;
      items_count_from_render: number;
      http_status: number | null;
      endpoint: string | null;
      layout_extraction_mismatch: boolean;
      reason: string | null;
      duration_ms: number;
      raw_response_summary: string | null;
      json_payload_preview: string | null;
    };
  };
  render_layout: RenderLayoutResult | null;
  dbPayload: {
    quote: ReturnType<typeof mapToQuotesTable>;
    items: ReturnType<typeof mapToQuoteItems>;
  };
};

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

        const dbg = passive_fire_sanitizer.sanitizer_debug;
        if (dbg.fallback_to_raw_text) {
          // call succeeded but sanitizer produced nothing usable — mark
          // empty; we've fallen back to raw text so pipeline continues.
          anomalies.push(`pf_sanitizer_fail_open:${dbg.reason ?? "unknown"}`);
          tracker.markEmpty(
            "pf_sanitize",
            `fail_open:${dbg.reason ?? "unknown"} ratio=${dbg.retention_ratio.toFixed(3)}`,
          );
        } else {
          tracker.succeed("pf_sanitize");
        }
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

    // -------- RENDER PDF ASSISTANT LAYER (parallel intelligence) --------
    // Runs before extraction as a non-authoritative layout source. If
    // Render is unavailable or times out we mark the stage SKIPPED and
    // continue. Never replaces extraction output.
    let render_layout: RenderLayoutResult | null = null;
    if (input.pdfBytes && input.pdfBytes.byteLength > 0) {
      tracker.start("render_layout");
      const renderStart = Date.now();
      try {
        render_layout = await extractRenderLayout({
          pdfBytes: input.pdfBytes,
          fileName: input.fileName,
        });
        if (render_layout.enabled) {
          tracker.succeed("render_layout");
        } else {
          tracker.markEmpty(
            "render_layout",
            `render_unavailable:${render_layout.reason ?? "unknown"}`,
          );
          anomalies.push(`render_layout_unavailable:${render_layout.reason ?? "unknown"}`);
        }
      } catch (err) {
        console.error("[parser_v2] render layout failed", err);
        tracker.fail("render_layout", err);
        anomalies.push("render_layout_failed");
        render_layout = null;
      }
      durations.render_layout = Date.now() - renderStart;
    } else {
      tracker.skip("render_layout", "no_pdf_bytes");
    }

    const extractor = EXTRACTOR_BY_TRADE[trade.trade] ?? extractFallback;
    const extractorName = EXTRACTOR_BY_TRADE[trade.trade] ? trade.trade : "fallback";

    tracker.start("extraction");
    const extractStart = Date.now();
    let items: ParsedLineItemV2[] = [];
    let extractionFailed = false;
    let extractionDebug: ExtractorChunkDebug[] = [];
    let fallbackDebug: ExtractorChunkDebug[] | null = null;
    let usedFallbackOnThrow = false;
    try {
      items = await extractor({
        rawText: effectiveRawText,
        pages: effectivePages,
        quoteType: quoteType.quoteType,
        supplier: supplier.supplierName,
        openAIKey: input.openAIKey,
        structure: passive_fire_structure,
      });
      extractionDebug = takeLastExtractorDebug();
    } catch (err) {
      console.error("[parser_v2] extractor threw, falling back", err);
      anomalies.push("extractor_threw");
      extractionFailed = true;
      extractionDebug = takeLastExtractorDebug();
      tracker.fail("extraction", err);
      try {
        usedFallbackOnThrow = true;
        items = await extractFallback({
          rawText: input.rawText,
          pages: input.pages,
          quoteType: quoteType.quoteType,
          supplier: supplier.supplierName,
          openAIKey: input.openAIKey,
        });
        fallbackDebug = takeLastExtractorDebug();
      } catch (fallbackErr) {
        fallbackDebug = takeLastExtractorDebug();
        throw new ParserV2StageError(
          formatMessage(fallbackErr),
          "extraction",
          tracker.snapshot(),
        );
      }
    }
    if (!extractionFailed) {
      if (items.length === 0) {
        // LLM call succeeded but produced no usable rows — not PASSED.
        tracker.markEmpty("extraction", "zero_rows_extracted");
      } else {
        tracker.succeed("extraction");
      }
    }
    durations.extraction = Date.now() - extractStart;

    if (
      render_layout?.enabled &&
      render_layout.rows_detected_total > 20 &&
      items.length === 0
    ) {
      anomalies.push(
        `layout_extraction_mismatch:render_rows=${render_layout.rows_detected_total}_extractor_rows=0`,
      );
    }

    if (items.length === 0 && extractor !== extractFallback && !usedFallbackOnThrow) {
      anomalies.push("primary_extractor_zero_rows");
      tracker.start("fallback_extraction");
      const fbStart = Date.now();
      try {
        items = await extractFallback({
          rawText: input.rawText,
          pages: input.pages,
          quoteType: quoteType.quoteType,
          supplier: supplier.supplierName,
          openAIKey: input.openAIKey,
        });
        fallbackDebug = takeLastExtractorDebug();
        if (items.length === 0) {
          tracker.markEmpty("fallback_extraction", "zero_rows_extracted");
        } else {
          tracker.succeed("fallback_extraction");
        }
      } catch (err) {
        fallbackDebug = takeLastExtractorDebug();
        tracker.fail("fallback_extraction", err);
        throw new ParserV2StageError(
          formatMessage(err),
          "fallback_extraction",
          tracker.snapshot(),
        );
      }
      durations.fallback_extraction = Date.now() - fbStart;
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

  const requires_review =
    confidence.level === "LOW" ||
    !totals.ok ||
    missing.missing.length > 0 ||
    (items.length === 0 && !multipathRecovered) ||
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
      debug: {
        sanitize: passive_fire_sanitizer
          ? {
              raw_response_text: passive_fire_sanitizer.sanitizer_debug.raw_response_text,
              parsed_json: passive_fire_sanitizer.sanitizer_debug.parsed_json,
              parse_error: passive_fire_sanitizer.sanitizer_debug.parse_error,
              schema_error: passive_fire_sanitizer.sanitizer_debug.schema_error,
              input_chars: passive_fire_sanitizer.sanitizer_debug.input_chars,
              output_chars: passive_fire_sanitizer.sanitizer_debug.output_chars,
              retention_ratio: passive_fire_sanitizer.sanitizer_debug.retention_ratio,
              fallback_to_raw_text: passive_fire_sanitizer.sanitizer_debug.fallback_to_raw_text,
              reason: passive_fire_sanitizer.sanitizer_debug.reason,
            }
          : null,
        extraction: {
          chunks: extractionDebug,
          rows_before_validation: extractionDebug.reduce((s, c) => s + c.rows_before_validation, 0),
          rows_after_validation: extractionDebug.reduce((s, c) => s + c.rows_after_validation, 0),
        },
        fallback_extraction: fallbackDebug
          ? {
              chunks: fallbackDebug,
              rows_before_validation: fallbackDebug.reduce((s, c) => s + c.rows_before_validation, 0),
              rows_after_validation: fallbackDebug.reduce((s, c) => s + c.rows_after_validation, 0),
            }
          : null,
        render: {
          render_enabled: render_layout?.enabled ?? false,
          render_pages: render_layout?.render_pages ?? 0,
          render_rows_detected: render_layout?.rows_detected_total ?? 0,
          render_tables_detected: render_layout?.tables_detected ?? 0,
          render_totals_detected: render_layout?.totals_detected ?? 0,
          render_sections_detected: render_layout?.sections_detected ?? 0,
          extracted_text_chars: render_layout?.extracted_text_chars ?? 0,
          items_count_from_render: render_layout?.items_count_from_render ?? 0,
          http_status: render_layout?.http_status ?? null,
          endpoint: render_layout?.endpoint ?? null,
          layout_extraction_mismatch:
            (render_layout?.enabled ?? false) &&
            (render_layout?.rows_detected_total ?? 0) > 20 &&
            items.length === 0,
          reason: render_layout?.reason ?? null,
          duration_ms: render_layout?.duration_ms ?? 0,
          raw_response_summary: render_layout?.raw_response_summary ?? null,
          json_payload_preview: render_layout?.json_payload_preview ?? null,
        },
      },
      render_layout,
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
