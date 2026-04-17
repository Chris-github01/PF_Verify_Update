/**
 * Parsing Post-Processor v4.0 - 2026-04-17
 *
 * Role: post-processing of LLM-parsed or regex-parsed items.
 * Not responsible for primary parsing or DB writes.
 *
 * Pipeline:
 *   1. Normalize fields (qty / rate / total / unit / description)
 *   2. Repair malformed numbers
 *   3. Remove junk / empty rows
 *   4. Remove summary / total rows (label + arithmetic detection)
 *   5. Deduplicate rows
 *   6. Compute missing row totals
 *   7. Classify scope categories
 *   8. Preserve FRR fields
 *   9. Reconcile row totals vs document total
 *  10. Return consistent shape
 */

export const PARSING_VERSION = "v4.0-2026-04-17";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NormalizedItem {
  description: string;
  qty: number;
  unit: string;
  rate: number;
  total: number;
  section: string;
  frr: string;
  scope_category: string;
  is_optional: boolean;
  is_adjustment: boolean;
  raw_source?: string;
  validation_flags: string[];
}

export interface PostProcessResult {
  items: NormalizedItem[];
  confidence: number;
  warnings: string[];
  row_total: number;
  clean_item_count: number;

  // Backward-compat fields (used by existing callers)
  rawItems: any[];
  finalItems: NormalizedItem[];
  rawItemsCount: number;
  finalItemsCount: number;
  itemsTotal: number;
  documentTotal: number | null;
  remainderAmount: number;
  hasAdjustment: boolean;
  finalTotalAmount: number;
  parsingVersion: string;
}

export interface ReconciliationResult {
  finalItems: NormalizedItem[];
  itemsTotal: number;
  documentTotal: number | null;
  remainderAmount: number;
  hasAdjustment: boolean;
}

// ---------------------------------------------------------------------------
// Number utilities
// ---------------------------------------------------------------------------

/**
 * Parse a money / numeric string, tolerating $, commas, spaces, and
 * common OCR artifacts like misplaced apostrophes or narrow spaces.
 */
export function parseMoney(raw: unknown): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  const s = String(raw ?? "")
    .replace(/[$\s\u00A0\u202F\u2009'`]/g, "")  // currency, whitespace variants, apostrophes
    .replace(/,(\d{3})/g, "$1")                  // remove thousands commas
    .replace(/[^\d.\-]/g, "");                   // keep only digits, dot, minus
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Attempt to repair a number that has had its leading digit clipped by OCR.
 * Returns the repaired value or the original if no repair can be made.
 */
function repairLeadingDigitClip(value: number, referenceTotal: number | null): number {
  if (!referenceTotal || value <= 0) return value;
  // If value is implausibly small compared to neighbour totals, try prepending digit
  for (const prefix of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
    const candidate = parseFloat(`${prefix}${String(Math.round(value)).padStart(4, "0")}`);
    if (candidate > value && candidate <= referenceTotal) return candidate;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Field accessors
// ---------------------------------------------------------------------------

function getDesc(item: any): string {
  return String(item.description ?? item.desc ?? item.item ?? item.name ?? "").trim();
}

function getRawTotal(item: any): number {
  const v = item.total ?? item.total_price ?? item.amount ?? item.line_total ?? item.extended;
  return parseMoney(v);
}

function getRawRate(item: any): number {
  return parseMoney(item.rate ?? item.unit_price ?? item.unitPrice ?? item.unit_rate ?? 0);
}

function getRawQty(item: any): number {
  return parseMoney(item.qty ?? item.quantity ?? item.count ?? 0);
}

function getRawUnit(item: any): string {
  const u = String(item.unit ?? item.uom ?? "").trim();
  if (!u || ["0", "n/a", "-", "tbc", "nil"].includes(u.toLowerCase())) return "ea";
  return u;
}

function getRawFrr(item: any): string {
  return String(item.frr ?? item.frl ?? item.fire_rating ?? item.fireRating ?? "").trim();
}

function getRawSection(item: any): string {
  return String(item.section ?? item.category ?? item.group ?? item.trade ?? "").trim();
}

// ---------------------------------------------------------------------------
// Scope classification
// ---------------------------------------------------------------------------

const SCOPE_PATTERNS: Array<{ pattern: RegExp; category: string }> = [
  { pattern: /penetrat|firestop|sealing|collar|wrap|intumescent/i, category: "Firestopping" },
  { pattern: /damper|duct|hvac|mechanical/i, category: "Mechanical" },
  { pattern: /cable\s*tray|conduit|electrical|switchboard/i, category: "Electrical" },
  { pattern: /pipe|hydraulic|plumbing|drainage|sewer|water/i, category: "Hydraulic" },
  { pattern: /batt|partition|wall|ceiling|compartment/i, category: "Compartmentation" },
  { pattern: /sprinkler|detector|alarm|fire\s*protection/i, category: "Active Fire" },
  { pattern: /prelim|p\s*&\s*g|management|supervision|site\s*establishment/i, category: "Preliminaries" },
  { pattern: /carpent|timber|joinery|door|frame/i, category: "Carpentry" },
  { pattern: /allowance|provisional|ps\s*sum|contingency/i, category: "Provisional Sum" },
];

function classifyScope(description: string): string {
  for (const { pattern, category } of SCOPE_PATTERNS) {
    if (pattern.test(description)) return category;
  }
  return "General";
}

// ---------------------------------------------------------------------------
// Row classification
// ---------------------------------------------------------------------------

const SUMMARY_ROW_SET = new Set([
  "total", "totals", "grand total", "grandtotal",
  "quote total", "contract sum", "lump sum total", "overall total",
  "subtotal", "sub-total", "sub total", "net total", "project total",
  "tender total", "tender sum", "contract value", "total price",
  "total cost", "total amount", "total sum", "contract total",
  "contract price", "price total", "estimated total",
]);

export function isSummaryRow(item: any): boolean {
  const raw = getDesc(item);
  const d = raw.replace(/[:\s]+$/, "").trim().toLowerCase();
  if (!d) return false;
  if (SUMMARY_ROW_SET.has(d)) return true;
  if (/^(grand\s+)?total(\s*(excl|incl|ex|inc)\.?.*)?$/i.test(d)) return true;
  if (/^sub[-\s]?total/i.test(d)) return true;
  if (/^contract\s+(sum|total|value|price)$/i.test(d)) return true;
  if (/^(quote|tender|project|net)\s+total$/i.test(d)) return true;
  return false;
}

export function isJunkRow(item: any): boolean {
  const desc = getDesc(item);
  const total = getRawTotal(item);
  const rate = getRawRate(item);
  const qty = getRawQty(item);

  // Has a meaningful description — keep it even if numbers are zero
  if (desc.length > 3) return false;

  // Purely empty — no numbers, no description
  if (!desc && total === 0 && rate === 0 && qty === 0) return true;

  return false;
}

export function isOptional(desc: string): boolean {
  const d = desc.toLowerCase();
  return d.includes("optional") || d.includes("option ") || d.includes("(opt)");
}

export function isArithmeticTotal(item: any, allItems: any[]): boolean {
  const itemTotal = getRawTotal(item);
  if (itemTotal <= 0) return false;
  const othersSum = allItems.reduce((s, other) => {
    if (other === item) return s;
    return s + getRawTotal(other);
  }, 0);
  if (othersSum <= 0) return false;
  const tolerance = Math.max(othersSum * 0.005, 1);
  return Math.abs(itemTotal - othersSum) <= tolerance;
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

function dedupeItems(items: NormalizedItem[]): { items: NormalizedItem[]; removed: number } {
  const seen = new Map<string, NormalizedItem>();
  let removed = 0;

  for (const item of items) {
    const key = [
      item.description.toLowerCase().replace(/\s+/g, " "),
      Math.round(item.qty * 100),
      Math.round(item.total * 100),
    ].join("|");

    if (seen.has(key)) {
      removed++;
    } else {
      seen.set(key, item);
    }
  }

  return { items: Array.from(seen.values()), removed };
}

// ---------------------------------------------------------------------------
// Document total extraction (from raw text)
// ---------------------------------------------------------------------------

export function extractDocumentTotal(text: string): number | null {
  const t = text.replace(/\u00A0/g, " ");

  const patterns = [
    /Grand\s+Total\s*\(excluding\s+GST\)\s*:?\s*\$?\s*([\d,]+\.?\d*)/i,
    /Grand\s+Total\s*\(excl\.?\s*GST\)\s*:?\s*\$?\s*([\d,]+\.?\d*)/i,
    /Grand\s+Total\s+excl\.?\s+GST\s*:?\s*\$?\s*([\d,]+\.?\d*)/i,
    /Grand\s+Total\s+ex\.?\s+GST\s*:?\s*\$?\s*([\d,]+\.?\d*)/i,
    /Grand\s+Total\s*:\s*\$?\s*([\d,]+\.?\d*)/i,
    /\bTOTAL\s+EXCL\.?\s+GST\b\s*:?\s*\$?\s*([\d,]+\.?\d*)/i,
    /\bTOTAL\b\s*:\s*\$?\s*([\d,]+\.?\d*)/i,
  ];

  for (const pattern of patterns) {
    const match = t.match(pattern);
    if (match) {
      const value = parseMoney(match[1]);
      if (value > 0 && Number.isFinite(value)) return value;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

export function normalizeItem(item: any): NormalizedItem {
  const flags: string[] = [];

  const desc = getDesc(item);
  const unit = getRawUnit(item);
  const frr = getRawFrr(item);
  const section = getRawSection(item);
  const rawSource = typeof item._raw === "string" ? item._raw : undefined;

  let qty = getRawQty(item);
  let rate = getRawRate(item);
  let total = getRawTotal(item);

  // Repair: if only total is present, set qty=1, rate=total
  if (total > 0 && qty <= 0 && rate <= 0) {
    qty = 1;
    rate = total;
    flags.push("qty_rate_inferred_from_total");
  }

  // Repair: if qty+rate present but total missing, compute it
  if (total === 0 && qty > 0 && rate > 0) {
    total = parseFloat((qty * rate).toFixed(2));
    flags.push("total_computed_from_qty_rate");
  }

  // Repair: if rate missing but qty+total present, derive rate
  if (rate === 0 && qty > 0 && total > 0) {
    rate = parseFloat((total / qty).toFixed(4));
    flags.push("rate_derived_from_total_qty");
  }

  // Repair: if qty missing but rate+total present, derive qty
  if (qty === 0 && rate > 0 && total > 0) {
    const derived = total / rate;
    if (Math.abs(Math.round(derived) - derived) < 0.01) {
      qty = Math.round(derived);
      flags.push("qty_derived_from_total_rate");
    } else {
      qty = 1;
      flags.push("qty_defaulted_to_1");
    }
  }

  // Sanity check: verify qty * rate ≈ total (within 2%)
  if (qty > 0 && rate > 0 && total > 0) {
    const computed = qty * rate;
    const diff = Math.abs(computed - total) / total;
    if (diff > 0.02) {
      flags.push(`arithmetic_mismatch:qty=${qty}*rate=${rate}=${computed.toFixed(2)},total=${total}`);
    }
  }

  return {
    description: desc,
    qty,
    unit,
    rate,
    total,
    section,
    frr,
    scope_category: classifyScope(desc),
    is_optional: isOptional(desc),
    is_adjustment: item.is_adjustment ?? false,
    raw_source: rawSource,
    validation_flags: [
      ...(Array.isArray(item.validation_flags) ? item.validation_flags : []),
      ...flags,
    ],
  };
}

// ---------------------------------------------------------------------------
// Totalling
// ---------------------------------------------------------------------------

export function sumTotals(items: Array<{ total: number }>): number {
  return items.reduce((sum, item) => sum + (Number.isFinite(item.total) ? item.total : 0), 0);
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

export function reconcileToDocumentTotal(
  items: NormalizedItem[],
  documentTotal: number | null,
): ReconciliationResult {
  const baseItems = items.filter((i) => !i.is_optional);
  const optItems = items.filter((i) => i.is_optional);

  let finalItems: NormalizedItem[];

  if (documentTotal !== null) {
    const baseTotal = sumTotals(baseItems);
    const basePlusOptTotal = sumTotals([...baseItems, ...optItems]);
    const diffBase = Math.abs(documentTotal - baseTotal);
    const diffWithOpt = Math.abs(documentTotal - basePlusOptTotal);
    finalItems = diffWithOpt < diffBase ? [...baseItems, ...optItems] : baseItems;
  } else {
    finalItems = [...baseItems, ...optItems];
  }

  const itemsTotal = parseFloat(sumTotals(finalItems).toFixed(2));
  let remainderAmount = 0;
  let hasAdjustment = false;

  if (documentTotal !== null) {
    remainderAmount = parseFloat((documentTotal - itemsTotal).toFixed(2));
    const tolerance = Math.max(5, documentTotal * 0.001);

    if (Math.abs(remainderAmount) > tolerance) {
      hasAdjustment = true;
      finalItems.push({
        description: "Unparsed remainder (auto-adjustment to match document total)",
        qty: 1,
        unit: "ea",
        rate: remainderAmount,
        total: remainderAmount,
        section: "",
        frr: "",
        scope_category: "Adjustment",
        is_optional: false,
        is_adjustment: true,
        validation_flags: ["reconciliation_adjustment"],
      });
    }
  }

  return { finalItems, itemsTotal, documentTotal, remainderAmount, hasAdjustment };
}

// ---------------------------------------------------------------------------
// Confidence scoring
// ---------------------------------------------------------------------------

function scoreConfidence(
  cleanCount: number,
  rawCount: number,
  documentTotal: number | null,
  rowTotal: number,
  warnings: string[],
): number {
  let score = 1.0;

  // Penalize if a lot of items were dropped
  if (rawCount > 0) {
    const retentionRate = cleanCount / rawCount;
    if (retentionRate < 0.5) score -= 0.2;
    else if (retentionRate < 0.75) score -= 0.1;
  }

  // Penalize if totals diverge significantly from document total
  if (documentTotal && documentTotal > 0) {
    const variance = Math.abs(rowTotal - documentTotal) / documentTotal;
    if (variance > 0.05) score -= 0.2;
    else if (variance > 0.01) score -= 0.1;
  }

  // Penalize per warning
  score -= warnings.length * 0.03;

  return parseFloat(Math.max(0.1, Math.min(1.0, score)).toFixed(2));
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

/**
 * processParsingPipeline
 *
 * Accepts raw LLM or regex items plus the extracted document text,
 * runs the full post-processing pipeline, and returns a consistent shape.
 *
 * Backward-compatible: all original fields on ParsingResult are still present.
 */
export function processParsingPipeline(
  rawItems: any[],
  extractedText: string,
): PostProcessResult {
  const warnings: string[] = [];

  console.log(`[Parsing v4] Starting with ${rawItems.length} raw items`);

  // --- 1. Extract document total from raw text ---
  const documentTotal = extractDocumentTotal(extractedText);
  console.log(
    `[Parsing v4] Document total: ${documentTotal != null ? `$${documentTotal.toFixed(2)}` : "N/A"}`,
  );

  // --- 2. Normalize all fields ---
  const normalized = rawItems.map(normalizeItem);

  // --- 3. Remove junk rows (empty / no meaningful data) ---
  const junkRemoved = normalized.filter((item) => {
    if (isJunkRow(item)) {
      console.log(`[Parsing v4] Junk row dropped: "${item.description}"`);
      return false;
    }
    return true;
  });

  // --- 4a. Remove labeled summary rows ---
  const labelFiltered = junkRemoved.filter((item) => {
    if (isSummaryRow(item)) {
      console.log(`[Parsing v4] Summary row removed: "${item.description}" ($${item.total})`);
      return false;
    }
    return true;
  });

  // --- 4b. Arithmetic total detection (only if label filter caught nothing) ---
  let afterSummaryFilter = labelFiltered;
  if (labelFiltered.length === junkRemoved.length && junkRemoved.length > 1) {
    const arithmeticTotals = junkRemoved.filter((item) => isArithmeticTotal(item, junkRemoved));
    if (arithmeticTotals.length === 1) {
      console.log(
        `[Parsing v4] Arithmetic total removed: "${arithmeticTotals[0].description}" ($${arithmeticTotals[0].total})`,
      );
      afterSummaryFilter = junkRemoved.filter((item) => item !== arithmeticTotals[0]);
    }
  }

  // --- 5. Deduplicate ---
  const { items: deduped, removed: dupeCount } = dedupeItems(afterSummaryFilter);
  if (dupeCount > 0) {
    warnings.push(`${dupeCount} duplicate row(s) removed`);
    console.log(`[Parsing v4] Deduplication removed ${dupeCount} rows`);
  }

  // --- 6. Row totals are already computed in normalizeItem ---
  //        Collect items that had arithmetic mismatches
  for (const item of deduped) {
    const mismatch = item.validation_flags.find((f) => f.startsWith("arithmetic_mismatch"));
    if (mismatch) warnings.push(`Arithmetic mismatch on: "${item.description}" — ${mismatch}`);
  }

  // --- 7. Scope category already classified in normalizeItem ---

  // --- 8. FRR already preserved in normalizeItem ---

  // --- 9. Reconcile against document total ---
  const reconciliation = reconcileToDocumentTotal(deduped, documentTotal);

  if (reconciliation.hasAdjustment) {
    warnings.push(
      `Reconciliation adjustment of $${reconciliation.remainderAmount.toFixed(2)} added to match document total`,
    );
  }

  const rowTotal = parseFloat(sumTotals(reconciliation.finalItems).toFixed(2));
  const finalTotalAmount = documentTotal ?? rowTotal;
  const cleanItemCount = reconciliation.finalItems.filter((i) => !i.is_adjustment).length;

  // --- 10. Confidence ---
  const confidence = scoreConfidence(
    cleanItemCount,
    rawItems.length,
    documentTotal,
    rowTotal,
    warnings,
  );

  console.log(
    `[Parsing v4] Final: ${reconciliation.finalItems.length} items (${cleanItemCount} real), ` +
    `$${rowTotal.toFixed(2)} row total, confidence=${confidence}`,
  );

  return {
    // New standard shape
    items: reconciliation.finalItems,
    confidence,
    warnings,
    row_total: rowTotal,
    clean_item_count: cleanItemCount,

    // Backward-compat fields
    rawItems,
    finalItems: reconciliation.finalItems,
    rawItemsCount: rawItems.length,
    finalItemsCount: reconciliation.finalItems.length,
    itemsTotal: reconciliation.itemsTotal,
    documentTotal,
    remainderAmount: reconciliation.remainderAmount,
    hasAdjustment: reconciliation.hasAdjustment,
    finalTotalAmount,
    parsingVersion: PARSING_VERSION,
  };
}
