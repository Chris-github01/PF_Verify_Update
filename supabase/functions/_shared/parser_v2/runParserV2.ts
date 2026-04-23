/**
 * Parser V2 — LLM-first orchestrator (production).
 *
 * Six canonical prompt-level stages (tracked independently with token usage):
 *   1. sanitizer  — strips OCR noise (PF only)
 *   2. structure  — authoritative total page / section roles (PF only)
 *   3. extractor  — trade-specific gpt-4.1 line-item extractor (+ PF intent refinement)
 *   4. selector   — picks single main-scope total excl GST (PF only)
 *   5. validator  — line math + totals + missing rows + PF validation
 *   6. composer   — final passive-fire record + DB shape mappers
 *
 * Each stage carries status, duration_ms, started_at, completed_at, error, tokens_in, tokens_out.
 * On any throw, a ParserV2StageError is raised with a non-null failedStage so
 * downstream failure reporting never shows `failed_inner_stage: null`.
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
import { resetBucket, snapshotBucket } from "./tokenBucket.ts";

let CURRENT_TRACKER: StageTracker | null = null;
let CURRENT_STAGE: string | null = null;

/** Allows the outer handler to inspect the in-flight pipeline state on hard timeout. */
export function getCurrentParserV2State(): {
  currentStage: string | null;
  stages: StageRecord[];
} {
  return {
    currentStage: CURRENT_STAGE,
    stages: CURRENT_TRACKER ? CURRENT_TRACKER.snapshot() : [],
  };
}

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
  let currentStage: string = "preflight";
  CURRENT_TRACKER = tracker;
  CURRENT_STAGE = currentStage;
  const setStage = (name: string) => {
    currentStage = name;
    CURRENT_STAGE = name;
  };

  try {
    setStage("preflight");
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

    setStage("classification");
    tracker.start("classification");
    resetBucket();
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
      tracker.fail("classification", classifierErrors[0], snapshotBucket());
    } else {
      tracker.succeed("classification", snapshotBucket());
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

    // ──────────────── STAGE 1: SANITIZER ────────────────
    setStage("sanitizer");
    let passive_fire_sanitizer: PassiveFireSanitizerResult | null = null;
    let effectiveRawText = input.rawText;
    let effectivePages = input.pages;
    if (trade.trade === "passive_fire") {
      tracker.start("sanitizer");
      resetBucket();
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
        tracker.succeed("sanitizer", snapshotBucket());
      } catch (err) {
        console.error("[parser_v2] sanitizer failed", err);
        anomalies.push("pf_sanitizer_failed");
        tracker.fail("sanitizer", err, snapshotBucket());
      }
      durations.sanitizer = Date.now() - sanitizeStart;
    } else {
      tracker.skip("sanitizer", "trade is not passive_fire");
    }

    // ──────────────── STAGE 2: STRUCTURE ────────────────
    setStage("structure");
    let passive_fire_structure: PassiveFireStructure | null = null;
    if (trade.trade === "passive_fire") {
      tracker.start("structure");
      resetBucket();
      const structStart = Date.now();
      try {
        passive_fire_structure = await classifyPassiveFireStructure({
          rawText: effectiveRawText,
          pages: effectivePages,
          fileName: input.fileName,
          supplier: supplier.supplierName,
          openAIKey: input.openAIKey,
        });
        tracker.succeed("structure", snapshotBucket());
      } catch (err) {
        console.error("[parser_v2] structure analysis failed", err);
        anomalies.push("pf_structure_analysis_failed");
        tracker.fail("structure", err, snapshotBucket());
      }
      durations.structure = Date.now() - structStart;
    } else {
      tracker.skip("structure", "trade is not passive_fire");
    }

    // ──────────────── STAGE 3: EXTRACTOR ────────────────
    setStage("extractor");
    const extractor = EXTRACTOR_BY_TRADE[trade.trade] ?? extractFallback;
    const extractorName = EXTRACTOR_BY_TRADE[trade.trade] ? trade.trade : "fallback";

    tracker.start("extractor");
    resetBucket();
    const extractStart = Date.now();
    let items: ParsedLineItemV2[] = [];
    let extractionOk = false;
    try {
      items = await extractor({
        rawText: effectiveRawText,
        pages: effectivePages,
        quoteType: quoteType.quoteType,
        supplier: supplier.supplierName,
        openAIKey: input.openAIKey,
        structure: passive_fire_structure,
      });
      extractionOk = true;
    } catch (err) {
      console.error("[parser_v2] primary extractor threw, trying fallback", err);
      anomalies.push("extractor_threw");
      try {
        items = await extractFallback({
          rawText: input.rawText,
          pages: input.pages,
          quoteType: quoteType.quoteType,
          supplier: supplier.supplierName,
          openAIKey: input.openAIKey,
        });
        extractionOk = true;
      } catch (fallbackErr) {
        tracker.fail("extractor", fallbackErr, snapshotBucket());
        throw new ParserV2StageError(
          formatMessage(fallbackErr),
          "extractor",
          tracker.snapshot(),
        );
      }
    }

    if (items.length === 0 && extractor !== extractFallback) {
      anomalies.push("primary_extractor_zero_rows");
      try {
        items = await extractFallback({
          rawText: input.rawText,
          pages: input.pages,
          quoteType: quoteType.quoteType,
          supplier: supplier.supplierName,
          openAIKey: input.openAIKey,
        });
      } catch (err) {
        tracker.fail("extractor", err, snapshotBucket());
        throw new ParserV2StageError(formatMessage(err), "extractor", tracker.snapshot());
      }
    }

    if (trade.trade === "passive_fire" && items.length > 0) {
      try {
        const intent = await classifyPassiveFireIntent({
          items,
          openAIKey: input.openAIKey,
        });
        items = intent.items;
      } catch (err) {
        console.error("[parser_v2] passive fire intent failed, keeping raw items", err);
        anomalies.push("passive_fire_intent_failed");
      }
    }

    if (extractionOk) tracker.succeed("extractor", snapshotBucket());
    durations.extractor = Date.now() - extractStart;

    // ──────────────── STAGE 4: SELECTOR ────────────────
    setStage("selector");
    let passive_fire_authoritative_total: PassiveFireAuthoritativeTotal | null = null;
    if (trade.trade === "passive_fire" && items.length > 0) {
      tracker.start("selector");
      resetBucket();
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
        tracker.succeed("selector", snapshotBucket());
      } catch (err) {
        console.error("[parser_v2] authoritative total selection failed", err);
        anomalies.push("pf_authoritative_total_failed");
        tracker.fail("selector", err, snapshotBucket());
      }
      durations.selector = Date.now() - selectorStart;
    } else {
      tracker.skip(
        "selector",
        trade.trade !== "passive_fire" ? "trade is not passive_fire" : "no items extracted",
      );
    }

    // ──────────────── STAGE 5: VALIDATOR ────────────────
    setStage("validator");
    tracker.start("validator");
    resetBucket();
    const validationStart = Date.now();
    let lineMath: ReturnType<typeof validateLineMath>;
    let totals: ReturnType<typeof validateTotals>;
    let missing: ReturnType<typeof detectMissingRows>;
    let confidence: ReturnType<typeof scoreConfidence>;
    let passive_fire_validation: PassiveFireValidationResult | null = null;
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

      if (trade.trade === "passive_fire") {
        try {
          passive_fire_validation = await validatePassiveFireParse({
            structure: passive_fire_structure,
            authoritative: passive_fire_authoritative_total,
            sanitizer: passive_fire_sanitizer,
            items,
            supplier: supplier.supplierName,
            openAIKey: input.openAIKey,
          });
        } catch (err) {
          console.error("[parser_v2] passive fire validation failed", err);
          anomalies.push("pf_validation_failed");
        }
      }

      tracker.succeed("validator", snapshotBucket());
    } catch (err) {
      tracker.fail("validator", err, snapshotBucket());
      throw new ParserV2StageError(formatMessage(err), "validator", tracker.snapshot());
    }
    durations.validator = Date.now() - validationStart;

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

    const requires_review =
      confidence.level === "LOW" ||
      !totals.ok ||
      missing.missing.length > 0 ||
      items.length === 0 ||
      hasErrorAnomaly ||
      (totals.variants_materially_different &&
        totals.reconciliation_confidence === "LOW") ||
      (passive_fire_validation?.requires_review ?? false);

    const mergedAnomalies = dedupeStrings(combinedAnomalies);

    // ──────────────── STAGE 6: COMPOSER ────────────────
    setStage("composer");
    tracker.start("composer");
    resetBucket();
    const composerStart = Date.now();
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
      tracker.succeed("composer", snapshotBucket());
    } catch (err) {
      tracker.fail("composer", err, snapshotBucket());
      throw new ParserV2StageError(formatMessage(err), "composer", tracker.snapshot());
    }
    durations.composer = Date.now() - composerStart;

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
      dbPayload: { quote, items: dbItems },
    };
  } catch (err) {
    if (err instanceof ParserV2StageError) throw err;
    tracker.failAllInFlight(err);
    const failedName =
      tracker.firstFailure()?.name ?? currentStage ?? "unknown";
    throw new ParserV2StageError(formatMessage(err), failedName, tracker.snapshot());
  } finally {
    CURRENT_TRACKER = null;
    CURRENT_STAGE = null;
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
