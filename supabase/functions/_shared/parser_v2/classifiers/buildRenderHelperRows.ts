/**
 * Transforms raw Render pdfplumber tables into structured helper JSON
 * that the LLM extractor can consume directly:
 *
 *   [
 *     {
 *       section: "BLOCK 30",
 *       page: 7,
 *       rows: [
 *         { line_id: 1, desc: "Cable Bundle", qty: 6, unit: "ea", unit_price: 112.35, total: 674.10 },
 *         ...
 *       ]
 *     }
 *   ]
 *
 * The LLM should use this as a cross-check, not as truth. All numeric
 * fields are best-effort parsed; if a column header cannot be identified
 * we leave the value null.
 */

import type { RenderLayoutResult, RenderTableHint } from "./extractRenderLayout.ts";

export type RenderHelperRow = {
  line_id: number;
  item_number: string | null;
  desc: string;
  qty: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number | null;
  raw: string[];
};

export type RenderHelperTable = {
  section: string | null;
  page: number;
  columns: string[];
  rows_detected: number;
  rows: RenderHelperRow[];
};

export type RenderHelperBundle = {
  tables: RenderHelperTable[];
  totals_blocks: RenderLayoutResult["totals_blocks"];
  section_headers: RenderLayoutResult["section_headers"];
  repeated_schedules: RenderLayoutResult["repeated_schedules"];
  rows_detected_total: number;
  tables_detected: number;
  sections_detected: number;
  totals_detected: number;
  note: string;
};

const MAX_ROWS_PER_TABLE = 40;
const MAX_TABLES = 30;

const DESC_HINTS = [
  "description",
  "desc",
  "item",
  "details",
  "work",
  "scope",
  "product",
];
const QTY_HINTS = ["qty", "quantity", "no", "count", "nr"];
const UNIT_HINTS = ["unit", "uom", "u.o.m", "measure"];
const UNIT_PRICE_HINTS = ["rate", "unit price", "unit rate", "price each", "cost each", "each"];
const TOTAL_HINTS = ["total", "amount", "extended", "ext", "line total", "subtotal"];
const ITEM_NUMBER_HINTS = ["item no", "item #", "#", "ref", "line", "no."];

function normaliseHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function matchIndex(columns: string[], hints: string[]): number {
  for (let i = 0; i < columns.length; i++) {
    const h = normaliseHeader(columns[i] ?? "");
    if (!h) continue;
    if (hints.some((hint) => h === hint || h.includes(hint))) return i;
  }
  return -1;
}

function parseNumber(v: string | undefined | null): number | null {
  if (v == null) return null;
  const cleaned = String(v)
    .replace(/[$,\s]/g, "")
    .replace(/[()]/g, "")
    .trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function firstNonEmpty(row: string[]): string {
  for (const c of row) {
    const s = (c ?? "").trim();
    if (s) return s;
  }
  return "";
}

function bestDescription(row: string[], descIdx: number): string {
  if (descIdx >= 0 && (row[descIdx] ?? "").trim()) return row[descIdx].trim();
  // fall back to the longest non-numeric cell
  let best = "";
  for (const c of row) {
    const s = (c ?? "").trim();
    if (!s) continue;
    if (parseNumber(s) != null) continue;
    if (s.length > best.length) best = s;
  }
  return best || firstNonEmpty(row);
}

function buildStructuredRows(t: RenderTableHint): RenderHelperRow[] {
  const rows = t.rows;
  if (rows.length < 2) return [];
  const headerRow = rows[0] ?? [];
  const dataRows = rows.slice(1, 1 + MAX_ROWS_PER_TABLE);

  const descIdx = matchIndex(headerRow, DESC_HINTS);
  const qtyIdx = matchIndex(headerRow, QTY_HINTS);
  const unitIdx = matchIndex(headerRow, UNIT_HINTS);
  const unitPriceIdx = matchIndex(headerRow, UNIT_PRICE_HINTS);
  const totalIdx = matchIndex(headerRow, TOTAL_HINTS);
  const itemIdx = matchIndex(headerRow, ITEM_NUMBER_HINTS);

  const out: RenderHelperRow[] = [];
  let lineId = 1;
  for (const r of dataRows) {
    if (!r.some((c) => (c ?? "").trim())) continue;
    const desc = bestDescription(r, descIdx);
    if (!desc || desc.length < 2) continue;

    out.push({
      line_id: lineId++,
      item_number: itemIdx >= 0 ? (r[itemIdx] ?? "").trim() || null : null,
      desc,
      qty: qtyIdx >= 0 ? parseNumber(r[qtyIdx]) : null,
      unit: unitIdx >= 0 ? (r[unitIdx] ?? "").trim() || null : null,
      unit_price: unitPriceIdx >= 0 ? parseNumber(r[unitPriceIdx]) : null,
      total: totalIdx >= 0 ? parseNumber(r[totalIdx]) : null,
      raw: r,
    });
  }
  return out;
}

export function buildRenderHelperBundle(
  layout: RenderLayoutResult,
): RenderHelperBundle {
  const tables: RenderHelperTable[] = [];
  for (const t of layout.tables.slice(0, MAX_TABLES)) {
    const structuredRows = buildStructuredRows(t);
    if (structuredRows.length === 0) continue;
    tables.push({
      section: t.section,
      page: t.page,
      columns: t.columns,
      rows_detected: t.rows_detected,
      rows: structuredRows,
    });
  }

  return {
    tables,
    totals_blocks: layout.totals_blocks,
    section_headers: layout.section_headers,
    repeated_schedules: layout.repeated_schedules,
    rows_detected_total: layout.rows_detected_total,
    tables_detected: layout.tables_detected,
    sections_detected: layout.sections_detected,
    totals_detected: layout.totals_detected,
    note:
      "Structured layout hints from PDF table extraction. Use to cross-check extractor output for row counts, sections, and totals. Do not invent rows not present in the document text.",
  };
}
