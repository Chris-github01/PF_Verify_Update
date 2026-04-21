/**
 * Parser V2 — LLM-first orchestrator.
 *
 * Pipeline:
 *   1. classifyTrade       → which trade primarily owns this quote
 *   2. classifyQuoteType   → itemized | lump_sum | hybrid
 *   3. classifySupplier    → supplier identity & template fingerprint
 *   4. extractByTrade      → trade-specific LLM extractor
 *   5. validation          → line math + totals + missing-row detection + confidence
 *   6. mappers             → DB shape identical to legacy parser (quotes + quote_items)
 *
 * Passive Fire is the reference trade: every other extractor mirrors its contract.
 * Passive Fire may reference plumbing / electrical / HVAC items but classifies
 * them under a passive-fire scope (e.g. penetration sealing of a plumbing riser).
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
    missing_rows: string[];
    anomalies: string[];
  };
  requires_review: boolean;
  dbPayload: {
    quote: ReturnType<typeof mapToQuotesTable>;
    items: ReturnType<typeof mapToQuoteItems>;
  };
};

const EXTRACTOR_BY_TRADE: Record<string, typeof extractPassiveFire> = {
  passive_fire: extractPassiveFire,
  electrical: extractElectrical,
  plumbing: extractPlumbing,
  hvac: extractHVAC,
  active_fire: extractActiveFire,
  carpentry: extractCarpentry,
};

export async function runParserV2(input: ParserV2Input): Promise<ParserV2Output> {
  const classificationContext = {
    rawText: input.rawText,
    fileName: input.fileName,
    supplierHint: input.supplierHint,
    tradeHint: input.tradeHint,
    openAIKey: input.openAIKey,
  };

  const [trade, quoteType, supplier] = await Promise.all([
    classifyTrade(classificationContext),
    classifyQuoteType(classificationContext),
    classifySupplier(classificationContext),
  ]);

  const extractor = EXTRACTOR_BY_TRADE[trade.trade] ?? extractFallback;

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
    console.error("[parser_v2] extractor failed, using fallback", err);
    items = await extractFallback({
      rawText: input.rawText,
      pages: input.pages,
      quoteType: quoteType.quoteType,
      supplier: supplier.supplierName,
      openAIKey: input.openAIKey,
    });
  }

  if (trade.trade === "passive_fire") {
    const intent = await classifyPassiveFireIntent({
      items,
      openAIKey: input.openAIKey,
    });
    items = intent.items;
  }

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

  const requires_review =
    confidence.level === "LOW" ||
    !totals.ok ||
    missing.missing.length > 0 ||
    items.length === 0;

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
      missing_rows: missing.missing,
      anomalies: [...lineMath.anomalies, ...totals.anomalies, ...missing.anomalies],
    },
    requires_review,
    dbPayload: { quote, items: dbItems },
  };
}
