/**
 * Parser V2 — LLM-first orchestrator (production).
 *
 * Pipeline:
 *   1. classifyTrade       → primary trade (PF-first rules)
 *   2. classifyQuoteType   → itemized | lump_sum | hybrid
 *   3. classifySupplier    → supplier identity
 *   4. extractByTrade      → trade-specific gpt-4.1 extractor
 *   5. passive-fire intent → sub_scope refinement when trade=passive_fire
 *   6. validation          → line math + totals + missing rows + confidence
 *   7. mappers             → DB shape identical to legacy parser
 *
 * The orchestrator records a telemetry row to parser_v2_runs when a
 * SUPABASE service client is available; failures to record never
 * fail the pipeline.
 */

import { classifyTrade, type TradeClassification } from "./classifiers/classifyTrade.ts";
import { classifyQuoteType, type QuoteTypeClassification } from "./classifiers/classifyQuoteType.ts";
import { classifySupplier, type SupplierClassification } from "./classifiers/classifySupplier.ts";
import { classifyPassiveFireIntent } from "./classifiers/classifyPassiveFireIntent.ts";

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
  };
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

  if (!input.openAIKey) throw new Error("parser_v2: openAIKey is required");
  if (!input.rawText?.trim()) throw new Error("parser_v2: rawText is empty");

  const classificationContext = {
    rawText: input.rawText,
    fileName: input.fileName,
    supplierHint: input.supplierHint,
    tradeHint: input.tradeHint,
    openAIKey: input.openAIKey,
  };

  const classifyStart = Date.now();
  const [tradeResult, quoteTypeResult, supplierResult] = await Promise.allSettled([
    classifyTrade(classificationContext),
    classifyQuoteType(classificationContext),
    classifySupplier(classificationContext),
  ]);
  durations.classification = Date.now() - classifyStart;

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

  const extractor = EXTRACTOR_BY_TRADE[trade.trade] ?? extractFallback;
  const extractorName = EXTRACTOR_BY_TRADE[trade.trade] ? trade.trade : "fallback";

  const extractStart = Date.now();
  let items: ParsedLineItemV2[] = [];
  try {
    items = await extractor({
      rawText: input.rawText,
      pages: input.pages,
      quoteType: quoteType.quoteType,
      supplier: supplier.supplierName,
      openAIKey: input.openAIKey,
    });
  } catch (err) {
    console.error("[parser_v2] extractor threw, falling back", err);
    anomalies.push("extractor_threw");
    items = await extractFallback({
      rawText: input.rawText,
      pages: input.pages,
      quoteType: quoteType.quoteType,
      supplier: supplier.supplierName,
      openAIKey: input.openAIKey,
    });
  }
  durations.extraction = Date.now() - extractStart;

  if (items.length === 0 && extractor !== extractFallback) {
    anomalies.push("primary_extractor_zero_rows");
    const fbStart = Date.now();
    items = await extractFallback({
      rawText: input.rawText,
      pages: input.pages,
      quoteType: quoteType.quoteType,
      supplier: supplier.supplierName,
      openAIKey: input.openAIKey,
    });
    durations.fallback_extraction = Date.now() - fbStart;
  }

  if (trade.trade === "passive_fire" && items.length > 0) {
    const intentStart = Date.now();
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
    durations.pf_intent = Date.now() - intentStart;
  }

  const validationStart = Date.now();
  const lineMath = validateLineMath(items);
  const totals = validateTotals(items, input.rawText);
  const missing = detectMissingRows(items, input.rawText, quoteType.quoteType);
  const confidence = scoreConfidence({
    items,
    lineMathOk: lineMath.ok,
    totalsOk: totals.ok,
    missingRows: missing.missing,
    quoteType: quoteType.quoteType,
  });
  durations.validation = Date.now() - validationStart;

  const requires_review =
    confidence.level === "LOW" ||
    !totals.ok ||
    missing.missing.length > 0 ||
    items.length === 0 ||
    anomalies.length > 0;

  const mergedAnomalies = dedupeStrings([
    ...anomalies,
    ...lineMath.anomalies,
    ...totals.anomalies,
    ...missing.anomalies,
  ]);

  const quote = mapToQuotesTable({
    projectId: input.projectId,
    organisationId: input.organisationId,
    quoteId: input.quoteId,
    supplier: supplier.supplierName,
    trade: trade.trade,
    totals,
    confidence: confidence.level,
    requires_review,
  });
  const dbItems = mapToQuoteItems({ items });

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
    },
    dbPayload: { quote, items: dbItems },
  };
}

function unwrap<T>(r: PromiseSettledResult<T>, fallback: T): T {
  return r.status === "fulfilled" ? r.value : fallback;
}

function dedupeStrings(xs: string[]): string[] {
  return [...new Set(xs)];
}
