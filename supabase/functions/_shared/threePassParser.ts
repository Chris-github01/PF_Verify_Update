/**
 * Three-Pass Document-Agnostic Quote Parser
 *
 * Architecture:
 *   PASS 1 — Structural Analysis
 *     LLM reads the full document, identifies section headings and classifies
 *     each into: included | optional | exclusions | provisional | alternates | by_others
 *     Returns a section map with page/line ranges and headings.
 *
 *   PASS 2 — Row Extraction
 *     LLM extracts every priced row within each detected section.
 *     Each row inherits the scope tag of its nearest preceding heading.
 *     No heading = included (default).
 *
 *   PASS 3 — Arithmetic Reconciliation
 *     Sum included rows independently.
 *     Sum optional rows independently.
 *     Compare both against stated totals found in the document.
 *     Return variance + recommended contract value.
 *
 * Design principles:
 *   - No vendor or supplier-specific logic
 *   - LLM is the primary parser
 *   - Deterministic regex only for total extraction (validation layer)
 *   - Rows inherit section status from nearest heading until new heading begins
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScopeCategory =
  | "included"
  | "optional"
  | "exclusion"
  | "provisional"
  | "alternate"
  | "by_others";

export interface DetectedSection {
  heading: string;
  scope: ScopeCategory;
  start_line: number;
  reasoning: string;
}

export interface ParsedLineItem {
  description: string;
  qty: number;
  unit: string;
  rate: number;
  total: number;
  scope: ScopeCategory;
  section_heading: string;
  frr: string;
  raw_source: string;
  line_number?: number;
}

export interface Pass1Result {
  sections: DetectedSection[];
  document_type: string;
  has_summary_page: boolean;
  stated_grand_total: number | null;
  stated_subtotal: number | null;
  reasoning: string;
  confidence: number;
}

export interface Pass2Result {
  items: ParsedLineItem[];
  warnings: string[];
  confidence: number;
  raw_section_items: Record<string, ParsedLineItem[]>;
}

export interface ThreePassOutput {
  items: ParsedLineItem[];
  sections: DetectedSection[];
  totals: {
    included_items_total: number;
    optional_total: number;
    provisional_total: number;
    alternate_total: number;
    stated_subtotal: number | null;
    stated_grand_total: number | null;
    recommended_contract_value: number;
    variance_to_stated: number | null;
    variance_percent: number | null;
  };
  confidence: number;
  warnings: string[];
  reasoning: string;
  parser_used: string;
}

// ---------------------------------------------------------------------------
// Pass 1 system prompt — structural analysis
// ---------------------------------------------------------------------------

const PASS1_SYSTEM_PROMPT = `You are a construction document analyst performing structural analysis of a subcontractor quote.

## YOUR TASK
Read the document and identify all section headings. For each heading, determine what scope category its contents belong to.

## SCOPE CATEGORIES

**included** — standard contract work. All priced rows under this heading are part of the base contract value.
Examples: "Scope of Works", "Contract Works", "Base Bid", "Schedule of Rates", "Bill of Quantities", trade names (Electrical, Hydraulics, Fire Protection, etc.), level names (Level 1, Ground Floor, Basement), room names, system names.

**optional** — work outside the base contract, priced for consideration.
Examples: "Optional Extras", "Optional Scope", "Add to Scope", "Alternates", "Add Alt", "Addendum", "Options", any heading containing the word "optional" or "alternate".

**provisional** — allowances for undefined work, not yet confirmed.
Examples: "Provisional Sum", "PS Items", "PC Sum", "Prime Cost Sum", "Provisional Allowance".

**alternate** — alternative approach to base-scope work (replaces, not adds).
Examples: "Alternate 1", "Alt A", "Alternative Option".

**exclusion** — items listed as NOT included in the contract.
Examples: "Exclusions", "Not Included", "NIC", "By Others", "Scope Exclusions", "Items Not in Contract".

**by_others** — work to be performed by a party other than this subcontractor.
Examples: "By Others", "Builder's Work", "Structural by Others", "Civil by Main Contractor".

## RULES
- Default scope is **included** when no heading is present
- A heading governs all rows below it until the next heading
- Look for visual separators: blank lines, ALL CAPS text, underlines, numbering
- A document may have no section headings — that is valid (all rows = included)
- Do NOT classify individual rows here — only headings/sections

## WHAT TO IGNORE
Summary rows, total rows, cover pages, terms and conditions, qualifications text — these are not section headings for pricing purposes.

## RETURN FORMAT (strict JSON):
{
  "sections": [
    {
      "heading": "exact text of the heading",
      "scope": "included|optional|exclusion|provisional|alternate|by_others",
      "start_line": approximate_line_number_or_0,
      "reasoning": "why this scope was assigned"
    }
  ],
  "document_type": "itemized_schedule|lump_sum|mixed|summary_only|unknown",
  "has_summary_page": true|false,
  "stated_grand_total": number_or_null,
  "stated_subtotal": number_or_null,
  "reasoning": "overall document structure summary"
}`;

// ---------------------------------------------------------------------------
// Pass 2 system prompt — row extraction with inherited scope
// ---------------------------------------------------------------------------

const PASS2_SYSTEM_PROMPT = `You are a construction quote line-item extractor.

## YOUR TASK
Extract every priced row from this document. Each row must inherit the scope from its section heading.

## SECTION MAP PROVIDED
You will be given a section map from a prior structural analysis. Use it to assign the correct scope to each row based on which section the row appears under.

## ROW EXTRACTION RULES

Extract a row when it has ALL of the following:
- A description (what is being supplied or done)
- A total price (numeric dollar value)
- A quantity (use 1 if lump sum)

Optional fields (extract if present):
- Unit (ea, m, lm, m², m³, hr, LS, set, etc.)
- Rate (unit price — may be absent for lump sums)
- FRR/fire rating (e.g. "90/90/-", "60 min", "FRL 120/-/-")

## SCOPE INHERITANCE
- Each row inherits the scope of the nearest preceding section heading
- If no section heading precedes a row, the scope is "included"
- A new heading resets the inherited scope for all subsequent rows

## ROWS TO SKIP — NEVER extract these:
- Rows labelled: Total, Sub-Total, Grand Total, Net Total, Contract Sum, Quote Total, Tender Sum, Section Total, Page Total, Carried Forward, B/F, Brought Forward
- Section header rows with no dollar values
- Rows where the value equals the arithmetic sum of all other rows
- Blank rows, narrative-only rows, terms/conditions text

## UNIT NORMALISATION
If unit is blank, "0", "-", "N/A" → use "ea" for single items, "LS" for lump sums

## MULTI-LINE DESCRIPTIONS
If a row has numbers on a separate line from its description, join them into one item.

## RETURN FORMAT (strict JSON):
{
  "items": [
    {
      "description": "string",
      "qty": number,
      "unit": "string",
      "rate": number_or_0,
      "total": number,
      "scope": "included|optional|exclusion|provisional|alternate|by_others",
      "section_heading": "heading this item belongs to",
      "frr": "string or empty string",
      "raw_source": "verbatim original text"
    }
  ],
  "warnings": ["string"],
  "confidence": number_0_to_1
}`;

// ---------------------------------------------------------------------------
// Pass 3 — arithmetic reconciliation (pure computation, no LLM needed)
// ---------------------------------------------------------------------------

function reconcile(
  items: ParsedLineItem[],
  statedGrandTotal: number | null,
  statedSubTotal: number | null,
): ThreePassOutput["totals"] {
  const includedItems = items.filter((i) => i.scope === "included");
  const optionalItems = items.filter((i) => i.scope === "optional");
  const provisionalItems = items.filter((i) => i.scope === "provisional");
  const alternateItems = items.filter((i) => i.scope === "alternate");

  const includedTotal = includedItems.reduce((s, i) => s + (i.total ?? 0), 0);
  const optionalTotal = optionalItems.reduce((s, i) => s + (i.total ?? 0), 0);
  const provisionalTotal = provisionalItems.reduce((s, i) => s + (i.total ?? 0), 0);
  const alternateTotal = alternateItems.reduce((s, i) => s + (i.total ?? 0), 0);

  const benchmarkTotal = statedGrandTotal ?? statedSubTotal ?? null;

  let varianceToStated: number | null = null;
  let variancePercent: number | null = null;

  if (benchmarkTotal && benchmarkTotal > 0 && includedTotal > 0) {
    varianceToStated = includedTotal - benchmarkTotal;
    variancePercent = (varianceToStated / benchmarkTotal) * 100;
  }

  const recommendedContractValue = includedTotal > 0 ? includedTotal : (benchmarkTotal ?? 0);

  return {
    included_items_total: includedTotal,
    optional_total: optionalTotal,
    provisional_total: provisionalTotal,
    alternate_total: alternateTotal,
    stated_subtotal: statedSubTotal,
    stated_grand_total: statedGrandTotal,
    recommended_contract_value: recommendedContractValue,
    variance_to_stated: varianceToStated,
    variance_percent: variancePercent,
  };
}

// ---------------------------------------------------------------------------
// Regex total extractor — for summary page validation
// ---------------------------------------------------------------------------

export function extractStatedTotals(text: string): {
  grand_total: number | null;
  sub_total: number | null;
  gst: number | null;
  total_incl_gst: number | null;
} {
  const t = text.replace(/\u00A0/g, " ").replace(/\s+/g, " ");

  const parseMoney = (s: string): number | null => {
    const cleaned = s.replace(/[^0-9.]/g, "");
    const v = parseFloat(cleaned);
    return v > 0 && Number.isFinite(v) ? v : null;
  };

  const grab = (re: RegExp): number | null => {
    const m = t.match(re);
    return m ? parseMoney(m[1]) : null;
  };

  const grandTotal =
    grab(/Grand\s+Total\s*\(excl[^)]*\)\s*:?\s*\$?\s*([\d,]+\.?\d*)/i) ??
    grab(/Grand\s+Total\s+excl?\.?\s*GST\s*:?\s*\$?\s*([\d,]+\.?\d*)/i) ??
    grab(/Grand\s+Total\s+ex\.?\s*GST\s*:?\s*\$?\s*([\d,]+\.?\d*)/i) ??
    grab(/Total\s+\(excl?\.?\s*GST\)\s*:?\s*\$?\s*([\d,]+\.?\d*)/i) ??
    grab(/Contract\s+Sum\s*:?\s*\$?\s*([\d,]+\.?\d*)/i) ??
    grab(/Tender\s+Sum\s*:?\s*\$?\s*([\d,]+\.?\d*)/i) ??
    grab(/Grand\s+Total\s*:?\s*\$?\s*([\d,]+\.?\d*)/i) ??
    grab(/Quote\s+Total\s*:?\s*\$?\s*([\d,]+\.?\d*)/i) ??
    grab(/Net\s+Total\s*:?\s*\$?\s*([\d,]+\.?\d*)/i);

  const subTotal =
    grab(/Sub[\s-]?Total\s*:?\s*\$?\s*([\d,]+\.?\d*)/i) ??
    grab(/Subtotal\s*:?\s*\$?\s*([\d,]+\.?\d*)/i);

  const gst =
    grab(/GST\s*\(10%\)\s*:?\s*\$?\s*([\d,]+\.?\d*)/i) ??
    grab(/GST\s+Amount\s*:?\s*\$?\s*([\d,]+\.?\d*)/i) ??
    grab(/GST\s*:?\s*\$?\s*([\d,]+\.?\d*)/i);

  const totalInclGst =
    grab(/Grand\s+Total\s*\(incl[^)]*\)\s*:?\s*\$?\s*([\d,]+\.?\d*)/i) ??
    grab(/Total\s+\(incl\.?\s*GST\)\s*:?\s*\$?\s*([\d,]+\.?\d*)/i) ??
    grab(/Total\s+Including\s+GST\s*:?\s*\$?\s*([\d,]+\.?\d*)/i);

  return { grand_total: grandTotal, sub_total: subTotal, gst, total_incl_gst: totalInclGst };
}

// ---------------------------------------------------------------------------
// Chunking — needed for large documents
// ---------------------------------------------------------------------------

function chunkText(
  text: string,
  maxChars = 6000,
  overlapLines = 20,
): string[] {
  if (text.length <= maxChars) return [text];

  const lines = text.split("\n");
  const chunks: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    current.push(line);
    if (current.join("\n").length >= maxChars) {
      chunks.push(current.join("\n"));
      current = current.slice(Math.max(0, current.length - overlapLines));
    }
  }
  if (current.length) chunks.push(current.join("\n"));
  return chunks;
}

// ---------------------------------------------------------------------------
// OpenAI call helper
// ---------------------------------------------------------------------------

async function callLLM(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  timeoutMs = 50000,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_completion_tokens: maxTokens,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenAI ${res.status}: ${body.slice(0, 300)}`);
    }

    const data = await res.json() as { choices: { message: { content: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty OpenAI response");
    return JSON.parse(content);
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`LLM timeout after ${timeoutMs}ms`);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// PASS 1 — Structural analysis
// ---------------------------------------------------------------------------

async function runPass1(
  rawText: string,
  apiKey: string,
  model: string,
): Promise<Pass1Result> {
  const userPrompt = [
    "Analyse the structure of this construction subcontractor quote.",
    "Identify all section headings and classify each section's scope.",
    "",
    "DOCUMENT TEXT:",
    rawText.slice(0, 8000),
  ].join("\n");

  const raw = await callLLM(apiKey, model, PASS1_SYSTEM_PROMPT, userPrompt, 2048, 30000) as Record<string, unknown>;

  return {
    sections: (raw.sections as DetectedSection[]) ?? [],
    document_type: (raw.document_type as string) ?? "unknown",
    has_summary_page: (raw.has_summary_page as boolean) ?? false,
    stated_grand_total: (raw.stated_grand_total as number | null) ?? null,
    stated_subtotal: (raw.stated_subtotal as number | null) ?? null,
    reasoning: (raw.reasoning as string) ?? "",
    confidence: 0.8,
  };
}

// ---------------------------------------------------------------------------
// PASS 2 — Row extraction per chunk, with section map injected
// ---------------------------------------------------------------------------

async function runPass2(
  rawText: string,
  sections: DetectedSection[],
  apiKey: string,
  model: string,
): Promise<Pass2Result> {
  const sectionMapText =
    sections.length > 0
      ? JSON.stringify(sections, null, 2)
      : "No sections detected — treat all rows as included scope.";

  const chunks = chunkText(rawText, 6000, 20);
  const allItems: ParsedLineItem[] = [];
  const allWarnings: string[] = [];
  let confSum = 0;

  for (let i = 0; i < chunks.length; i++) {
    const userPrompt = [
      `SECTION MAP (from structural analysis):`,
      sectionMapText,
      ``,
      `CHUNK ${i + 1} of ${chunks.length}:`,
      `Extract every priced row. Assign scope based on the section map above.`,
      ``,
      chunks[i],
    ].join("\n");

    try {
      const raw = await callLLM(apiKey, model, PASS2_SYSTEM_PROMPT, userPrompt, 8192, 45000) as Record<string, unknown>;

      const rawItems = (raw.items as ParsedLineItem[]) ?? [];
      const validItems = rawItems.filter(
        (item) =>
          item.description &&
          typeof item.total === "number" &&
          item.total > 0,
      );

      allItems.push(...validItems);
      allWarnings.push(...((raw.warnings as string[]) ?? []));
      confSum += typeof raw.confidence === "number" ? (raw.confidence as number) : 0.75;

      console.log(
        `[ThreePass] Pass2 chunk ${i + 1}/${chunks.length} → ${validItems.length} items`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      allWarnings.push(`Chunk ${i + 1} extraction failed: ${msg}`);
      console.error(`[ThreePass] Pass2 chunk ${i + 1} error:`, msg);
    }
  }

  // Group by section for reference
  const rawSectionItems: Record<string, ParsedLineItem[]> = {};
  for (const item of allItems) {
    const key = item.section_heading || "Ungrouped";
    if (!rawSectionItems[key]) rawSectionItems[key] = [];
    rawSectionItems[key].push(item);
  }

  return {
    items: allItems,
    warnings: allWarnings,
    confidence: chunks.length > 0 ? confSum / chunks.length : 0,
    raw_section_items: rawSectionItems,
  };
}

// ---------------------------------------------------------------------------
// Post-processing — dedup, normalise, filter carry-forwards
// ---------------------------------------------------------------------------

const SKIP_DESCRIPTION_RE =
  /^(total[s]?|sub[\s-]?total|grand\s+total|net\s+total|contract\s+(sum|value|total)|quote\s+total|tender\s+sum|project\s+total|lump\s+sum\s+total|gst|margin|p\s*&\s*g|carried\s+forward|c\s*\/\s*f|b\s*\/\s*f|brought\s+forward|page\s+(sub[\s-]?)?total|section\s+total)$/i;

function postProcess(items: ParsedLineItem[]): {
  items: ParsedLineItem[];
  warnings: string[];
} {
  const warnings: string[] = [];

  let filtered = items.filter((item) => {
    const desc = (item.description ?? "").trim();
    if (SKIP_DESCRIPTION_RE.test(desc)) {
      warnings.push(`Skipped summary row: "${desc}" ($${item.total})`);
      return false;
    }
    if (!item.total || item.total <= 0) return false;
    return true;
  });

  const rowSum = filtered.reduce((s, i) => s + i.total, 0);
  filtered = filtered.filter((item) => {
    const isGrandTotal =
      rowSum > 0 &&
      Math.abs(item.total - rowSum) / rowSum < 0.005 &&
      filtered.length > 1;
    if (isGrandTotal) {
      warnings.push(
        `Removed arithmetic-total row: "${item.description}" ($${item.total.toFixed(2)})`,
      );
      return false;
    }
    return true;
  });

  const seen = new Set<string>();
  filtered = filtered.filter((item) => {
    const key = item.raw_source
      ? item.raw_source.trim().slice(0, 120)
      : `${item.description}|${item.qty}|${item.rate}|${item.total}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  filtered = filtered.map((item) => ({
    ...item,
    unit:
      !item.unit || item.unit === "0" || item.unit === "-" || item.unit === "N/A"
        ? item.qty === 1 ? "LS" : "ea"
        : item.unit,
    qty: item.qty > 0 ? item.qty : 1,
    rate: item.rate > 0 ? item.rate : item.total,
    scope: item.scope ?? "included",
    frr: item.frr ?? "",
    raw_source: item.raw_source ?? "",
    section_heading: item.section_heading ?? "",
  }));

  return { items: filtered, warnings };
}

// ---------------------------------------------------------------------------
// Confidence scoring
// ---------------------------------------------------------------------------

function computeConfidence(params: {
  pass1Confidence: number;
  pass2Confidence: number;
  itemCount: number;
  variancePercent: number | null;
  warnings: string[];
}): number {
  const { pass1Confidence, pass2Confidence, itemCount, variancePercent, warnings } = params;

  let score = (pass1Confidence + pass2Confidence) / 2;

  if (itemCount === 0) return 0;
  if (itemCount < 3) score -= 0.20;
  else if (itemCount >= 10) score += 0.05;

  if (variancePercent !== null) {
    const absV = Math.abs(variancePercent);
    if (absV > 20) score -= 0.20;
    else if (absV > 5) score -= 0.10;
    else if (absV < 1) score += 0.05;
  }

  const criticalWarnings = warnings.filter((w) =>
    w.includes("failed") || w.includes("timeout"),
  ).length;
  score -= criticalWarnings * 0.05;

  return Math.min(1.0, Math.max(0, score));
}

// ---------------------------------------------------------------------------
// Variance explanation
// ---------------------------------------------------------------------------

function buildReasoning(
  pass1: Pass1Result,
  totals: ThreePassOutput["totals"],
  warnings: string[],
): string {
  const parts: string[] = [];

  parts.push(`Document type: ${pass1.document_type}.`);

  if (pass1.sections.length > 0) {
    const scopeSummary = pass1.sections
      .map((s) => `"${s.heading}" → ${s.scope}`)
      .join(", ");
    parts.push(`Sections detected: ${scopeSummary}.`);
  } else {
    parts.push("No explicit section headings — all rows treated as included scope.");
  }

  parts.push(
    `Included items total: $${totals.included_items_total.toFixed(2)}.`,
  );

  if (totals.optional_total > 0) {
    parts.push(`Optional scope total: $${totals.optional_total.toFixed(2)}.`);
  }

  if (totals.stated_grand_total !== null) {
    parts.push(`Stated grand total: $${totals.stated_grand_total.toFixed(2)}.`);
    if (totals.variance_percent !== null) {
      const dir = totals.variance_percent > 0 ? "above" : "below";
      parts.push(
        `Line-item total is ${Math.abs(totals.variance_percent).toFixed(2)}% ${dir} stated total.`,
      );
    }
  } else {
    parts.push("No stated grand total found — line-item total is authoritative.");
  }

  parts.push(`Recommended contract value: $${totals.recommended_contract_value.toFixed(2)}.`);

  if (warnings.length > 0) {
    parts.push(`${warnings.length} warning(s) generated.`);
  }

  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function runThreePassParser(params: {
  rawText: string;
  supplierName?: string;
  apiKey: string;
  model: string;
}): Promise<ThreePassOutput> {
  const { rawText, supplierName, apiKey, model } = params;
  const allWarnings: string[] = [];

  console.log(
    `[ThreePass] Starting — supplier="${supplierName ?? "unknown"}" chars=${rawText.length}`,
  );

  // Regex total extraction — done upfront for reconciliation
  const statedTotals = extractStatedTotals(rawText);
  console.log("[ThreePass] Stated totals from regex:", statedTotals);

  // PASS 1 — structural analysis
  console.log("[ThreePass] Pass 1: structural analysis");
  let pass1: Pass1Result;
  try {
    pass1 = await runPass1(rawText, apiKey, model);
    console.log(
      `[ThreePass] Pass 1 complete: ${pass1.sections.length} sections, type=${pass1.document_type}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    allWarnings.push(`Pass 1 (structural analysis) failed: ${msg}`);
    console.error("[ThreePass] Pass 1 error:", msg);
    pass1 = {
      sections: [],
      document_type: "unknown",
      has_summary_page: false,
      stated_grand_total: statedTotals.grand_total,
      stated_subtotal: statedTotals.sub_total,
      reasoning: "Pass 1 failed",
      confidence: 0.3,
    };
  }

  // PASS 2 — row extraction
  console.log("[ThreePass] Pass 2: row extraction");
  let pass2: Pass2Result;
  try {
    pass2 = await runPass2(rawText, pass1.sections, apiKey, model);
    console.log(`[ThreePass] Pass 2 complete: ${pass2.items.length} raw items`);
    allWarnings.push(...pass2.warnings);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    allWarnings.push(`Pass 2 (row extraction) failed: ${msg}`);
    console.error("[ThreePass] Pass 2 error:", msg);
    pass2 = {
      items: [],
      warnings: [msg],
      confidence: 0,
      raw_section_items: {},
    };
  }

  // Post-processing
  const { items: cleanItems, warnings: cleanWarnings } = postProcess(pass2.items);
  allWarnings.push(...cleanWarnings);
  console.log(`[ThreePass] Post-processing: ${pass2.items.length} → ${cleanItems.length} items`);

  // Resolve stated totals (prefer regex over LLM-reported, as regex is deterministic)
  const statedGrandTotal =
    statedTotals.grand_total ??
    pass1.stated_grand_total ??
    null;

  const statedSubTotal =
    statedTotals.sub_total ??
    pass1.stated_subtotal ??
    null;

  // PASS 3 — arithmetic reconciliation
  console.log("[ThreePass] Pass 3: arithmetic reconciliation");
  const totals = reconcile(cleanItems, statedGrandTotal, statedSubTotal);

  console.log(
    `[ThreePass] Pass 3 complete: included=$${totals.included_items_total.toFixed(2)}` +
    ` optional=$${totals.optional_total.toFixed(2)}` +
    ` stated=${statedGrandTotal ?? "N/A"}` +
    ` variance=${totals.variance_percent !== null ? totals.variance_percent.toFixed(2) + "%" : "N/A"}`,
  );

  if (totals.variance_percent !== null && Math.abs(totals.variance_percent) > 5) {
    const dir = totals.variance_percent > 0 ? "above" : "below";
    allWarnings.push(
      `Line-item included total ($${totals.included_items_total.toFixed(2)}) is ` +
      `${Math.abs(totals.variance_percent).toFixed(2)}% ${dir} stated grand total ` +
      `($${statedGrandTotal?.toFixed(2) ?? "unknown"}). Review recommended.`,
    );
  }

  const confidence = computeConfidence({
    pass1Confidence: pass1.confidence,
    pass2Confidence: pass2.confidence,
    itemCount: cleanItems.length,
    variancePercent: totals.variance_percent,
    warnings: allWarnings,
  });

  const reasoning = buildReasoning(pass1, totals, allWarnings);

  console.log(
    `[ThreePass] Final: items=${cleanItems.length} confidence=${confidence.toFixed(2)}`,
  );

  return {
    items: cleanItems,
    sections: pass1.sections,
    totals,
    confidence,
    warnings: allWarnings,
    reasoning,
    parser_used: "three_pass_document_agnostic_v1",
  };
}
