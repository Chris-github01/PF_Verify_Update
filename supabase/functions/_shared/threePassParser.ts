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

const PASS1_SYSTEM_PROMPT = `You are a senior quantity surveyor and construction document analyst. Your task is to perform structural analysis of a subcontractor quote document.

## YOUR PRIMARY TASK
Identify every section heading in the document and classify its scope category. This section map will drive how every priced row is later bucketed — get this right.

## SCOPE CATEGORIES (DEFINITIONS)

**included** — Base contract work. The subcontractor is committing to deliver this for the stated price.
Signals: Trade names (Hydraulics, Electrical, Passive Fire, HVAC, Sprinkler, etc.), floor/level names (Level 1, Ground Floor, Lower Ground, Basement, Roof), room-type groupings (Bathrooms, Amenities, Kitchen, Plant Room), system names (Hot Water System, Chilled Water, Fire Hydrant), work-package headings (Scope of Works, Contract Works, Bill of Quantities, Schedule of Rates, Base Bid, Schedule A), any numbered section that contains priced line items without an "optional" or "alternate" qualifier.

**optional** — Additional scope that has been priced but is NOT committed. Accepting these items adds to the base contract.
Signals: Any heading containing the words: Optional, Option, Add Alt, Add to Scope, Addendum, Addition, Extra, Add-On, Variation. Must be a distinct section — not a single footnote inside a base-scope table.
CRITICAL: If a row inside an "included" section is labelled "Optional Extra" or "Add Allowance", treat it as optional scope — create a sub-section boundary for it even if no formal heading exists.

**provisional** — Work that is uncertain in quantity or definition. Money is reserved but final cost is not yet known.
Signals: Provisional Sum, PC Sum, Prime Cost, PS Items, Provisional Allowance, Contingency (only when formatted as a sum, not a percentage), Nominated Sub-Contractor Allowance.
CRITICAL: Do NOT classify ordinary base-scope items as provisional just because they have round numbers.

**alternate** — A different method or specification to deliver base-scope work. Accepting an alternate REPLACES the corresponding included item — it does not ADD to the total.
Signals: Alternate 1 / Alt A / Alternative Specification / Option B (when framed as a swap, not an addition), Value Engineering Alternate.
IMPORTANT: Alternate ≠ Optional. An alternate replaces; an optional adds. If ambiguous, check whether the heading implies addition (optional) or substitution (alternate).

**exclusion** — Items explicitly NOT included in this contract. No money is committed; the prime contractor must source this elsewhere.
Signals: Exclusions, Not Included, NIC, Items Not in Contract, Scope Exclusions, Items Excluded From This Quotation.

**by_others** — Work in scope but to be performed by another party (main contractor, another subcontractor, client).
Signals: By Others, By Main Contractor, Builder's Work in Connection, Civil Works by Others, Structural by Principal Contractor.

## NESTED AND SUBSECTION HANDLING

Documents often have hierarchies. Rules:
1. A top-level heading sets the scope for everything beneath it until a sibling-level heading appears.
2. A sub-heading INSIDE an included section may override the scope for its own rows. Example: "Optional Extras" appearing as a sub-heading inside a "Hydraulics" section — those rows become optional, not included.
3. Alternates may appear as sub-headings inside an included section — treat them as alternate scope.
4. Level/floor groupings (Level 1, Level 2, Basement, etc.) appearing inside a base-scope section are NOT separate scope buckets — they are structural subdivisions of the included scope.
5. Room-type groupings (Wet Areas, Bathrooms, Amenities) inside base scope are structural subdivisions — do NOT split them into separate scope categories.

## SUMMARY PAGE DETECTION

Identify if the document contains a summary page or totals page. These pages aggregate numbers already priced in the line-item schedules. Rules:
- A summary page contains rows like "Hydraulics $X", "Electrical $X", "Total $X" — where each row IS the total of an earlier detailed section.
- Do NOT treat a summary page as a priced section. Mark it as non-extractable.
- Set "has_summary_page": true when detected.
- Extract stated_grand_total and stated_subtotal from the summary page — these are for validation only.
- If a document has ONLY a summary page and no line-item schedule, set document_type to "summary_only".

## DOCUMENT TYPE CLASSIFICATION

- **itemized_schedule** — rows with qty, unit, rate, total (most structured quotes)
- **lump_sum** — sections priced as a single amount with no line-item breakdown
- **mixed** — some sections itemized, some lump sum
- **summary_only** — only a totals/summary page, no detailed line items
- **unknown** — cannot determine structure

## WHAT TO SKIP (NOT SECTION HEADINGS)
- Individual line items that happen to have bold text
- Arithmetic total rows ("Total this section $xxx")
- Cover page text, company names, project names, date lines
- Terms and conditions, qualifications, exclusions narrative (unless it IS a formal exclusions section)
- Page numbers, headers, footers

## RETURN FORMAT (strict JSON, no markdown, no code fences):
{
  "sections": [
    {
      "heading": "exact heading text as it appears",
      "scope": "included|optional|exclusion|provisional|alternate|by_others",
      "start_line": 0,
      "reasoning": "one sentence: why this scope was assigned"
    }
  ],
  "document_type": "itemized_schedule|lump_sum|mixed|summary_only|unknown",
  "has_summary_page": true,
  "stated_grand_total": null,
  "stated_subtotal": null,
  "reasoning": "2-3 sentence summary of overall document structure and any structural observations"
}`;

// ---------------------------------------------------------------------------
// Pass 2 system prompt — row extraction with inherited scope
// ---------------------------------------------------------------------------

const PASS2_SYSTEM_PROMPT = `You are a senior quantity surveyor extracting line items from a construction subcontractor quote. Your output feeds a commercial analysis engine — accuracy is critical.

## YOUR TASK
Extract every priced row from the chunk of document text provided. Use the section map (from Pass 1 structural analysis) to assign the correct scope to each row.

## SECTION MAP USAGE (CRITICAL)
You will receive a section_map listing headings and their scope categories.
- Scan the chunk text top-to-bottom.
- When you encounter text matching a section heading from the map, all subsequent rows inherit that heading's scope.
- This inheritance continues until the next section heading appears and resets it.
- If no section heading precedes a row in this chunk, use "included" as the default.
- If this chunk is a continuation of a previous chunk, the last active heading from the prior chunk may have been provided — use it as the starting scope.

## TABLE COLUMN RECOGNITION

Most construction quotes use tabular layouts. Identify the column structure before extracting:

**Standard columns (in order):** Item No. | Description | Qty | Unit | Rate | Total (or Amount)
**Variants:** Some tables omit Item No. Some use "Supply" and "Install" columns separately (sum them for the rate). Some use "Labour" and "Materials" columns (sum them for total). Some show only Description + Total (lump sum style).

Rules:
- When Supply + Install columns exist: rate = supply_rate + install_rate, total = supply_total + install_total
- When Labour + Materials exist: total = labour + materials (combined)
- When only a Total column exists with no Rate: set rate = total / qty (or 0 if qty is 1 and it is lump sum)
- The TOTAL column is the financial truth — never substitute row_total with qty × rate if a total column is present

## WHAT QUALIFIES AS A PRICED ROW

Extract a row when it has ALL three of:
1. A description string (what is being supplied, installed, or done)
2. A total dollar value (positive number, > 0)
3. A quantity (use 1 if lump sum, allowance, or supply-only item)

Also extract:
- Unit: preserve exactly as printed (ea, m, lm, m², m³, nr, hr, LS, set, item, allow). If blank/dash/N/A: use "LS" for single-value items, "ea" for countable items.
- Rate: unit price. If absent for a lump sum, set to 0.
- FRR: fire resistance rating — only if explicitly printed (e.g. "90/90/-", "FRL -/60/60", "60 min", "4 hour"). Leave as empty string if not stated.
- raw_source: copy the verbatim original line(s) from the document exactly.

## MULTI-LINE ROW MERGING

Construction quotes frequently split rows across two or three lines. Merge when:
- Line 1 contains a description only (no numbers)
- Line 2 contains numbers (qty, unit, rate, total) matching that description
- They are adjacent or separated only by whitespace

Also merge when OCR has split a single logical row across lines (look for dangling numbers without descriptions, or partial descriptions without numbers that are immediately adjacent).

Do NOT merge across section headings or across unrelated items.

## FRR / FIRE RATING PRESERVATION

Fire resistance ratings appear as: "90/90/-", "FRL 60/-/-", "-/60/60", "120 minute", "4 hour FRL", "FRR 90".
- Preserve the exact string in the "frr" field.
- A row may have an FRR even if it is not in a fire-related section (e.g. penetration seals in a plumbing quote).
- Do NOT invent an FRR — only extract if explicitly stated in the source row.

## ROWS TO SKIP — NEVER EXTRACT

Skip any row that is:
- A grand total or contract sum row: "Total", "Grand Total", "Contract Sum", "Quote Total", "Tender Sum", "Net Total", "Overall Total", "Project Total", "Contract Value", "Lump Sum Total"
- A section subtotal: "Section Total", "Sub-Total [section name]", "Carried Forward", "Brought Forward", "B/F", "C/F"
- A page total: "Page Total", "Total This Page", "Continued"
- A tax or margin row: "GST", "Tax", "Margin", "Markup", "OH&P", "Overhead and Profit"
- A P&G or preliminaries aggregation row (unless it is a standalone priced item, not a sum of others)
- A row whose dollar value equals the arithmetic sum of all other rows in the visible section (it is a redundant total)
- Blank rows, heading-only rows (no dollar value), narrative paragraphs, terms and conditions

## DUPLICATE PREVENTION ACROSS CHUNK OVERLAP

Chunks overlap by approximately 20 lines to prevent missed rows at chunk boundaries.
- If you see a row that appears verbatim or near-verbatim to a row you already extracted in this chunk, extract it only ONCE.
- When in doubt, prefer the version with more complete data (more columns filled).
- Do NOT flag non-duplicate rows as duplicates just because they are similar items (e.g., two identical fixtures on different floors are two separate rows).

## SCOPE ASSIGNMENT RULES

Always use the section map scope. Never override it based on the content of a row description alone, EXCEPT:
- A row description explicitly says "Optional Extra", "Add Allowance", or "Alternate [X]" AND no section heading has been seen — assign the appropriate scope (optional or alternate) to that row only.
- Exclusion/NIC items listed as bullet points under an "Exclusions" heading inherit the exclusion scope even if the heading is the only scope signal.

## CONFIDENCE SCORING

Return a confidence value 0.0 – 1.0:
- 0.90–1.00: Clean structured table, all rows clear, column alignment unambiguous, section context unambiguous
- 0.70–0.89: Good extraction, minor issues (a few rows missing rate, or one ambiguous section boundary)
- 0.50–0.69: Partial extraction — some rows skipped due to ambiguity, OCR noise, or unclear section assignment
- 0.30–0.49: Low confidence — significant structure problems, many rows uncertain, high chance of errors
- 0.00–0.29: Very low — near-illegible or non-standard document; extracted rows are best-effort guesses

Apply confidence PENALTIES for:
- Unclear or absent section headings in a multi-scope document (−0.10)
- More than 10% of rows have no qty or rate (−0.05 each issue)
- Detected duplicate rows (−0.10 per group of duplicates)
- Row totals inconsistent with qty × rate by >15% on more than 3 rows (−0.05)
- OCR noise clearly present (−0.05 to −0.15 depending on severity)

## RETURN FORMAT (strict JSON, no markdown, no code fences):
{
  "items": [
    {
      "description": "string — cleaned, complete description",
      "qty": number,
      "unit": "string",
      "rate": number,
      "total": number,
      "scope": "included|optional|exclusion|provisional|alternate|by_others",
      "section_heading": "exact heading from section map this item falls under, or empty string",
      "frr": "fire resistance rating string exactly as printed, or empty string",
      "raw_source": "verbatim original line(s) from document"
    }
  ],
  "warnings": ["string — describe any ambiguities, skipped rows, or OCR issues"],
  "confidence": 0.85
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

function repairJson(raw: string): string {
  let s = raw.trim();

  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");

  const firstBrace = s.indexOf("{");
  const firstBracket = s.indexOf("[");
  let start = -1;
  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    start = firstBrace;
  } else if (firstBracket !== -1) {
    start = firstBracket;
  }
  if (start > 0) s = s.slice(start);

  const lastBrace = s.lastIndexOf("}");
  const lastBracket = s.lastIndexOf("]");
  const end = Math.max(lastBrace, lastBracket);
  if (end !== -1 && end < s.length - 1) s = s.slice(0, end + 1);

  s = s.replace(/,\s*([}\]])/g, "$1");

  const openBraces = (s.match(/\{/g) ?? []).length;
  const closeBraces = (s.match(/\}/g) ?? []).length;
  const openBrackets = (s.match(/\[/g) ?? []).length;
  const closeBrackets = (s.match(/\]/g) ?? []).length;

  if (openBrackets > closeBrackets) {
    s = s + "]".repeat(openBrackets - closeBrackets);
  }
  if (openBraces > closeBraces) {
    s = s + "}".repeat(openBraces - closeBraces);
  }

  return s;
}

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
      const status = res.status;
      if (status === 429) throw new Error(`OpenAI rate limit (429): ${body.slice(0, 200)}`);
      if (status === 413) throw new Error(`OpenAI token limit (413): ${body.slice(0, 200)}`);
      throw new Error(`OpenAI ${status}: ${body.slice(0, 300)}`);
    }

    const data = await res.json() as { choices: { message: { content: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty OpenAI response");

    try {
      return JSON.parse(content);
    } catch {
      const repaired = repairJson(content);
      try {
        const parsed = JSON.parse(repaired);
        console.warn("[ThreePass] JSON repaired successfully");
        return parsed;
      } catch {
        throw new Error(`JSON parse failed after repair attempt. Raw length=${content.length}`);
      }
    }
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

export class PartialResultError extends Error {
  partialItems: ParsedLineItem[];
  chunksCompleted: number;

  constructor(partialItems: ParsedLineItem[], chunksCompleted: number, message: string) {
    super(message);
    this.name = "PartialResultError";
    this.partialItems = partialItems;
    this.chunksCompleted = chunksCompleted;
  }
}

const PASS2_SYSTEM_PROMPT_SHORT = `You are a quantity surveyor. Extract every priced line item from this construction quote text.

For each row output: description, qty (number), unit (string), rate (number), total (number), scope ("included"|"optional"|"exclusion"|"provisional"|"alternate"|"by_others"), section_heading (string), frr (string), raw_source (string).

Skip: grand totals, section subtotals, GST rows, page totals, blank rows.

Return strict JSON only: {"items": [...], "warnings": [], "confidence": 0.8}`;

async function runPass2(
  rawText: string,
  sections: DetectedSection[],
  apiKey: string,
  model: string,
  onChunkComplete?: (completed: number) => void,
  shorterPrompt?: boolean,
): Promise<Pass2Result> {
  const systemPrompt = shorterPrompt ? PASS2_SYSTEM_PROMPT_SHORT : PASS2_SYSTEM_PROMPT;

  const sectionMapText =
    sections.length > 0
      ? JSON.stringify(sections, null, 2)
      : "No sections detected — treat all rows as included scope.";

  const chunks = chunkText(rawText, 6000, 20);
  const allItems: ParsedLineItem[] = [];
  const allWarnings: string[] = [];
  let confSum = 0;
  let chunksSucceeded = 0;
  let chunksFailed = 0;

  for (let i = 0; i < chunks.length; i++) {
    const userPrompt = shorterPrompt
      ? [`CHUNK ${i + 1} of ${chunks.length}:`, ``, chunks[i]].join("\n")
      : [
          `SECTION MAP (from structural analysis):`,
          sectionMapText,
          ``,
          `CHUNK ${i + 1} of ${chunks.length}:`,
          `Extract every priced row. Assign scope based on the section map above.`,
          ``,
          chunks[i],
        ].join("\n");

    try {
      const raw = await callLLM(apiKey, model, systemPrompt, userPrompt, 8192, 45000) as Record<string, unknown>;

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
      chunksSucceeded++;

      console.log(
        `[ThreePass] Pass2 chunk ${i + 1}/${chunks.length} → ${validItems.length} items`,
      );

      if (onChunkComplete) onChunkComplete(chunksSucceeded);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      allWarnings.push(`Chunk ${i + 1} extraction failed: ${msg}`);
      console.error(`[ThreePass] Pass2 chunk ${i + 1} error:`, msg);
      chunksFailed++;
    }
  }

  if (chunksFailed > 0 && chunksSucceeded === 0) {
    throw new PartialResultError(
      allItems,
      chunksSucceeded,
      `All ${chunks.length} chunk(s) failed in Pass 2`,
    );
  }

  if (chunksFailed > 0 && chunksSucceeded > 0) {
    console.warn(
      `[ThreePass] Pass2 partial: ${chunksSucceeded}/${chunks.length} chunks succeeded, ${chunksFailed} failed`,
    );
    allWarnings.push(
      `Pass 2 partial extraction: ${chunksSucceeded} of ${chunks.length} chunks succeeded`,
    );
  }

  const rawSectionItems: Record<string, ParsedLineItem[]> = {};
  for (const item of allItems) {
    const key = item.section_heading || "Ungrouped";
    if (!rawSectionItems[key]) rawSectionItems[key] = [];
    rawSectionItems[key].push(item);
  }

  return {
    items: allItems,
    warnings: allWarnings,
    confidence: chunksSucceeded > 0 ? confSum / chunksSucceeded : 0,
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
  shorterPrompt?: boolean;
  onChunkComplete?: (completed: number) => void;
}): Promise<ThreePassOutput> {
  const { rawText, supplierName, apiKey, model, shorterPrompt = false, onChunkComplete } = params;
  const allWarnings: string[] = [];

  console.log(
    `[ThreePass] Starting — supplier="${supplierName ?? "unknown"}" chars=${rawText.length} shorterPrompt=${shorterPrompt}`,
  );

  // Regex total extraction — done upfront for reconciliation
  const statedTotals = extractStatedTotals(rawText);
  console.log("[ThreePass] Stated totals from regex:", statedTotals);

  // PASS 1 — structural analysis (skipped when shorterPrompt=true to reduce token pressure)
  let pass1: Pass1Result;
  if (shorterPrompt) {
    console.log("[ThreePass] Pass 1: skipped (shorterPrompt mode)");
    pass1 = {
      sections: [],
      document_type: "unknown",
      has_summary_page: false,
      stated_grand_total: statedTotals.grand_total,
      stated_subtotal: statedTotals.sub_total,
      reasoning: "Pass 1 skipped (shorterPrompt mode)",
      confidence: 0.5,
    };
  } else {
    console.log("[ThreePass] Pass 1: structural analysis");
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
  }

  // PASS 2 — row extraction
  console.log("[ThreePass] Pass 2: row extraction");
  let pass2: Pass2Result;
  try {
    pass2 = await runPass2(rawText, pass1.sections, apiKey, model, onChunkComplete, shorterPrompt);
    console.log(`[ThreePass] Pass 2 complete: ${pass2.items.length} raw items`);
    allWarnings.push(...pass2.warnings);
  } catch (err) {
    if (err instanceof PartialResultError && err.partialItems.length > 0) {
      console.warn(
        `[ThreePass] Pass 2 partial: ${err.partialItems.length} items from ${err.chunksCompleted} chunk(s)`,
      );
      allWarnings.push(`Pass 2 partial extraction: ${err.partialItems.length} items recovered`);
      pass2 = {
        items: err.partialItems,
        warnings: [`Partial extraction: ${err.chunksCompleted} chunk(s) completed before failure`],
        confidence: Math.min(0.5, 0.1 * err.chunksCompleted),
        raw_section_items: {},
      };
    } else {
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
