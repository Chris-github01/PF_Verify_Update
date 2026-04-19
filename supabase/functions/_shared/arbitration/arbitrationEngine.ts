/**
 * Hybrid Arbitration Engine
 *
 * Universal, company-agnostic orchestrator that combines:
 *   - Labelled total extraction with priority ranking
 *   - Semantic scope classification with heading inheritance
 *   - Column-aware table parsing that preserves true qty/rate
 *   - Contextual fuzzy dedup
 *   - Confidence aggregation with LLM fallback trigger
 *
 * This engine does NOT implement any supplier-specific logic. It accepts
 * deterministic parser output + raw text, merges them, and returns a
 * confidence-scored arbitration result. Callers decide whether to trigger
 * an LLM fallback when `requires_llm_fallback` is true.
 */

import { resolveTotal, TotalExtractionResult, TotalLabel } from "./totalExtractor.ts";
import { classifyScopes, classifyRowScope, DetectedHeading, ScopeCategory } from "./scopeClassifier.ts";
import { detectTableHeaders, parseTableRows, ParsedTableRow } from "./tableParser.ts";
import { dedupItems, DedupInputItem } from "./dedupEngine.ts";
import { buildConfidenceReport, ConfidenceReport, computeItemConfidence, LLM_FALLBACK_THRESHOLD } from "./confidenceEngine.ts";

export interface ArbitratedItem {
  description: string;
  qty: number | null;
  unit: string | null;
  rate: number | null;
  total: number | null;
  scope: ScopeCategory;
  scope_confidence: number;
  scope_source: string | null;
  block: string | null;
  page: number | null;
  line_id: string | null;
  line_number: number | null;
  confidence: number;
  source: string;
}

export interface ArbitrationInputItem extends DedupInputItem {
  description: string;
  qty: number | null;
  unit?: string | null;
  rate: number | null;
  total: number | null;
  block?: string | null;
  page?: number | null;
  line_id?: string | null;
  line_number?: number | null;
  confidence?: number | null;
  source?: string | null;
  scope?: ScopeCategory | null;
}

export interface ArbitrationResult {
  items: ArbitratedItem[];
  resolved_total: number | null;
  resolved_total_label: TotalLabel | null;
  total_candidates: TotalExtractionResult["candidates"];
  headings: DetectedHeading[];
  confidence: ConfidenceReport;
  warnings: string[];
}

const mergeTableRowsWithInputs = (
  inputs: ArbitrationInputItem[],
  tableRows: ParsedTableRow[],
): ArbitrationInputItem[] => {
  if (tableRows.length === 0) return inputs;

  const byLine = new Map<number, ParsedTableRow>();
  for (const r of tableRows) byLine.set(r.line_number, r);

  const enriched: ArbitrationInputItem[] = inputs.map((item) => {
    const ln = item.line_number ?? null;
    if (ln !== null && byLine.has(ln)) {
      const tr = byLine.get(ln)!;
      return {
        ...item,
        qty: item.qty ?? tr.qty,
        rate: item.rate ?? tr.rate,
        total: item.total ?? tr.total,
        unit: item.unit ?? tr.unit ?? null,
        source: item.source ?? tr.source,
        confidence: Math.max(item.confidence ?? 0, tr.confidence),
      };
    }
    return item;
  });

  const usedLines = new Set(enriched.map((i) => i.line_number).filter((n) => n !== null));
  for (const tr of tableRows) {
    if (!usedLines.has(tr.line_number)) {
      enriched.push({
        description: tr.description,
        qty: tr.qty,
        unit: tr.unit,
        rate: tr.rate,
        total: tr.total,
        line_number: tr.line_number,
        line_id: tr.item_number,
        source: tr.source,
        confidence: tr.confidence,
      });
    }
  }

  return enriched;
};

export interface ArbitrateOptions {
  rawText: string;
  items: ArbitrationInputItem[];
  rowSum?: number | null;
  parserUsed?: string;
}

export function arbitrate(options: ArbitrateOptions): ArbitrationResult {
  const { rawText, items: inputItems, rowSum: explicitRowSum, parserUsed = "deterministic" } = options;
  const warnings: string[] = [];

  const tableHeaders = detectTableHeaders(rawText);
  let tableRows: ParsedTableRow[] = [];
  for (const header of tableHeaders) {
    tableRows.push(...parseTableRows(rawText, header));
  }
  if (tableHeaders.length > 0) {
    warnings.push(`Detected ${tableHeaders.length} table header(s); ${tableRows.length} rows parsed with preserved qty/rate`);
  }

  const merged = mergeTableRowsWithInputs(inputItems, tableRows);

  const scopeResult = classifyScopes(rawText);
  const headings = scopeResult.headings;

  const classifiedItems: ArbitratedItem[] = merged.map((item) => {
    const rowScope = item.scope && ["main", "optional", "excluded"].includes(item.scope)
      ? { scope: item.scope as ScopeCategory, confidence: 0.85, source_heading: null }
      : classifyRowScope(item.line_number ?? 0, headings);
    return {
      description: item.description,
      qty: item.qty,
      unit: item.unit ?? null,
      rate: item.rate,
      total: item.total,
      scope: rowScope.scope,
      scope_confidence: rowScope.confidence,
      scope_source: rowScope.source_heading,
      block: (item.block as string) ?? null,
      page: item.page ?? null,
      line_id: item.line_id ?? null,
      line_number: item.line_number ?? null,
      confidence: item.confidence ?? 0.75,
      source: (item.source as string) ?? parserUsed,
    };
  });

  const dedup = dedupItems(
    classifiedItems.map((ci) => ({
      ...ci,
      description: ci.description,
      total: ci.total,
      qty: ci.qty,
      rate: ci.rate,
      block: ci.block,
      page: ci.page,
      line_id: ci.line_id,
    })),
  );
  warnings.push(...dedup.warnings);
  const deduped = dedup.kept as unknown as ArbitratedItem[];

  const rowSum = explicitRowSum ?? deduped.reduce((sum, r) => {
    if (r.scope === "main" && typeof r.total === "number") return sum + r.total;
    return sum;
  }, 0);
  const totalResult = resolveTotal(rawText, rowSum > 0 ? rowSum : null);
  warnings.push(...totalResult.warnings);

  const item_confidence = computeItemConfidence(deduped);
  warnings.push(...scopeResult.warnings);

  const confidence = buildConfidenceReport({
    total_confidence: totalResult.total_confidence,
    scope_confidence: scopeResult.scope_confidence,
    item_confidence,
    parser_used: parserUsed,
    warnings,
  });

  return {
    items: deduped,
    resolved_total: totalResult.resolved_total,
    resolved_total_label: totalResult.resolved_label,
    total_candidates: totalResult.candidates,
    headings,
    confidence,
    warnings,
  };
}

export { LLM_FALLBACK_THRESHOLD };
