/**
 * Document-Agnostic Three-Pass Parsing Prompts
 *
 * Architecture:
 *   PASS 1 — Structural analysis: section headings → scope classification
 *   PASS 2 — Row extraction: every priced row inherits scope from nearest heading
 *   PASS 3 — Arithmetic reconciliation (pure computation, no LLM)
 *
 * Principles:
 *   - No vendor or supplier-specific logic anywhere in these prompts
 *   - LLM determines scope from document structure, not hardcoded keywords
 *   - Rows inherit the scope of the nearest preceding heading until a new heading begins
 *   - Summary page totals are validation only — line items are primary truth
 */

// ---------------------------------------------------------------------------
// PASS 1 — Structural Analysis
// ---------------------------------------------------------------------------

export const PASS1_STRUCTURAL_SYSTEM_PROMPT = `You are a construction document analyst performing structural analysis of a subcontractor quote.

## YOUR TASK
Read the document and identify all section headings. For each heading, determine what scope category its contents belong to.

## SCOPE CATEGORIES

**included** — standard contract work, part of the base contract value.
Signals: trade names, level/floor names, room names, system names, "Scope of Works", "Contract Works", "Base Bid", "Schedule of Rates", "Bill of Quantities", numbered work packages.

**optional** — work outside the base contract, priced for consideration but not yet committed.
Signals: any heading containing the words "optional", "alternate", "add to scope", "add alt", "addendum", "options".

**provisional** — allowances for undefined or approximate work.
Signals: "Provisional Sum", "PS Items", "PC Sum", "Prime Cost Sum", "Provisional Allowance", "Provisional Items".

**alternate** — alternative approach to base-scope work (replaces rather than adds).
Signals: "Alternate 1", "Alt A", "Alternative Option", "Alt Bid".

**exclusion** — items explicitly listed as NOT included in this contract.
Signals: "Exclusions", "Not Included", "NIC", "Scope Exclusions", "Items Not in Contract", "Items Excluded".

**by_others** — work to be performed by another party.
Signals: "By Others", "By Main Contractor", "Builder's Work", "Civil by Others".

## RULES
- Default scope is **included** when no heading is present
- A heading governs all rows beneath it until the next heading appears
- Look for visual separators: blank lines, ALL CAPS text, underlines, numbering schemes
- A document may have no explicit section headings — that is valid (all rows = included)
- Do NOT classify individual rows here — only section headings

## WHAT TO IGNORE
Summary rows, total rows, cover pages, terms and conditions, qualifications narratives — these are not pricing section headings.

## RETURN FORMAT (strict JSON, no markdown):
{
  "sections": [
    {
      "heading": "exact heading text as it appears in the document",
      "scope": "included|optional|exclusion|provisional|alternate|by_others",
      "start_line": 0,
      "reasoning": "one sentence explaining the scope assignment"
    }
  ],
  "document_type": "itemized_schedule|lump_sum|mixed|summary_only|unknown",
  "has_summary_page": true|false,
  "stated_grand_total": number_or_null,
  "stated_subtotal": number_or_null,
  "reasoning": "brief summary of overall document structure"
}`;

export function buildPass1Prompt(documentText: string): string {
  return [
    "Analyse the structure of this construction subcontractor quote.",
    "Identify all section headings and classify each section's scope category.",
    "Do not extract individual line items — focus only on document structure.",
    "",
    "DOCUMENT TEXT:",
    documentText.slice(0, 8000),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// PASS 2 — Row Extraction with Inherited Scope
// ---------------------------------------------------------------------------

export const PASS2_EXTRACTION_SYSTEM_PROMPT = `You are a construction quote line-item extractor.

## YOUR TASK
Extract every priced row from the document. Assign scope to each row based on the section map provided.

## SCOPE INHERITANCE (CRITICAL RULE)
- Each row inherits the scope of the nearest preceding section heading in the section map
- If no section heading precedes a row, assign scope = "included"
- When a new heading appears, all subsequent rows inherit that heading's scope
- This continues until another heading resets it

## WHAT TO EXTRACT
A row qualifies when it has ALL of:
- A description (what is being supplied or installed)
- A total price (a positive dollar amount)
- A quantity (use 1 for lump sum items)

Extract even when optional fields are absent:
- Unit (ea, m, lm, m², m³, hr, LS, set, nr, item...) — use "LS" if lump sum, "ea" otherwise
- Rate (unit price) — may be absent for lump sums; set to 0 if not present
- FRR / fire resistance rating — only if explicitly stated (e.g. "90/90/-", "60 min", "FRL 120/-/-")

## ROWS TO SKIP — NEVER extract:
- Rows labelled exactly: Total, Sub-Total, Grand Total, Net Total, Contract Sum, Quote Total, Tender Sum, Section Total, Page Total, Carried Forward, B/F, Brought Forward, Lump Sum Total, GST, Margin, P&G
- Section header rows that have no dollar value
- Rows whose value equals the sum of all other rows (arithmetic grand total row)
- Blank rows or rows containing only narrative/terms text

## MULTI-LINE DESCRIPTIONS
If a row's description appears on one line and its numbers (qty, rate, total) appear on the next line, join them into a single item.

## UNIT NORMALISATION
- Blank, "0", "-", "N/A" → use "ea" for counted items, "LS" for lump sums
- Preserve all other unit strings exactly as they appear

## CONFIDENCE SCORING
Return a confidence value 0–1:
  0.90–1.00: clean structured table, all rows clear, section context unambiguous
  0.70–0.89: good extraction, minor structure issues
  0.50–0.69: partial extraction or ambiguous section boundaries
  0.00–0.49: very uncertain, poor document structure

## RETURN FORMAT (strict JSON, no markdown):
{
  "items": [
    {
      "description": "string",
      "qty": number,
      "unit": "string",
      "rate": number,
      "total": number,
      "scope": "included|optional|exclusion|provisional|alternate|by_others",
      "section_heading": "the heading this item falls under, or empty string",
      "frr": "fire resistance rating string, or empty string",
      "raw_source": "verbatim original text of this row"
    }
  ],
  "warnings": ["string"],
  "confidence": number
}`;

export function buildPass2Prompt(
  chunkText: string,
  sectionMap: unknown[],
  chunkIndex: number,
  totalChunks: number,
): string {
  const sectionMapText =
    sectionMap.length > 0
      ? JSON.stringify(sectionMap, null, 2)
      : "No sections detected — treat all rows as included scope.";

  return [
    `SECTION MAP (from structural analysis — use this to assign scope to each row):`,
    sectionMapText,
    ``,
    `CHUNK ${chunkIndex + 1} of ${totalChunks}:`,
    `Extract every priced row. Assign scope based on the section map above using the inheritance rule.`,
    ``,
    chunkText,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Legacy two-pass prompts — retained for backward compatibility
// Used by callers that have not yet migrated to the three-pass architecture
// ---------------------------------------------------------------------------

export const PARSING_V5_SYSTEM_PROMPT = `You are extracting line items from construction quotes.
Return ONLY real cost lines (items/services).

There are TWO valid item formats:

**A) Itemised lines** (preferred):
- description (required)
- quantity (required)
- total price (required)
- unit OPTIONAL (ea, m, lm, hr, etc.)
- rate OPTIONAL (can be calculated from qty and total)

**B) Lump sum / service lines**:
- description (required)
- total price (required)
- quantity defaults to 1
- unit = "LS" or leave blank
- rate OPTIONAL

SKIP summary/subtotal lines such as:
- Any heading followed by a dollar total (section subtotal)
- "TOTAL $..." / "Subtotal" / "Grand Total" / "P&G" / "GST"
- Any line that aggregates other lines
- Lines where the description is ONLY a summary keyword: "Total", "Totals", "Grand Total", "Contract Sum", "Quote Total", "Tender Sum", "Net Total", "Overall Total", "Project Total", "Contract Value"
- CRITICAL: If a line's value equals the sum of all other lines, it is a total row — SKIP IT

IMPORTANT:
- Multi-line descriptions are common: join lines when numbers appear on the next line
- If you can see a total price but rate is missing, keep the item (rate=null)
- If you can see a total price but unit is missing, keep the item (unit=null)
- Keep items even if they look unusual — high recall is preferred

Output JSON format:
{
  "items": [
    {
      "description": "...",
      "qty": number,
      "unit": "ea|m|LS|..." or null,
      "rate": number or null,
      "total": number,
      "page": number,
      "raw_text": "original line(s)"
    }
  ],
  "confidence": number,
  "warnings": []
}`;

export const PARSING_V5_RECALL_PROMPT = `Extract ALL line items from this quote text.
Include ANY line that looks like it has a cost, even if you are unsure about the format.
Be generous — summaries will be removed in the cleanup pass.

CHUNK TEXT:
{text}

DETERMINISTIC CANDIDATES (pre-extracted via regex):
{candidates}

Your task: Confirm the candidates above and find ANY additional items they missed.`;

export const PARSING_V5_CLEANUP_PROMPT = `Review these extracted items and remove any that are clearly summaries or duplicates.

EXTRACTED ITEMS:
{items}

Rules:
1. Remove section totals/subtotals (e.g. "Electrical $762,874.50")
2. Remove duplicates (keep the most detailed version)
3. Validate totals where rate exists: abs(qty * rate - total) should be < 5% of total
4. Flag suspicious items in warnings
5. CRITICAL: Remove any item whose description is only a summary keyword: "Total", "Grand Total", "Contract Sum", "Quote Total", "Tender Sum", "Net Total", "Overall Total", "Project Total", "Contract Value"
6. CRITICAL: If any item's value equals the arithmetic sum of all other items, remove it — it is a grand total row

Return cleaned items in same JSON format.`;

export function buildRecallPrompt(chunkText: string, candidates: unknown[]): string {
  const candidatesText =
    candidates.length > 0
      ? JSON.stringify(candidates, null, 2)
      : "None found — find all items manually";

  return PARSING_V5_RECALL_PROMPT
    .replace("{text}", chunkText)
    .replace("{candidates}", candidatesText);
}

export function buildCleanupPrompt(items: unknown[]): string {
  return PARSING_V5_CLEANUP_PROMPT.replace("{items}", JSON.stringify(items, null, 2));
}

async function callGPT(
  userPrompt: string,
  openaiKey: string,
  temperature: number,
): Promise<{ items: unknown[]; warnings: string[] }> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: PARSING_V5_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json() as { choices: { message: { content: string } }[] };
  return JSON.parse(data.choices[0].message.content) as { items: unknown[]; warnings: string[] };
}

export async function twoPassExtraction(
  chunkText: string,
  candidates: unknown[],
  openaiKey: string,
  pageNumber?: number,
): Promise<{ items: unknown[]; warnings: string[] }> {
  const recallPrompt = buildRecallPrompt(chunkText, candidates);
  const recallItems = await callGPT(recallPrompt, openaiKey, 0.3);

  const cleanupPrompt = buildCleanupPrompt(recallItems.items ?? []);
  const cleanedItems = await callGPT(cleanupPrompt, openaiKey, 0.1);

  const itemsWithPage = ((cleanedItems.items ?? []) as Record<string, unknown>[]).map((item) => ({
    ...item,
    page: item.page ?? pageNumber,
  }));

  return {
    items: itemsWithPage,
    warnings: [
      ...(recallItems.warnings ?? []),
      ...(cleanedItems.warnings ?? []),
    ],
  };
}
