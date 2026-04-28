/**
 * scopeSegmentationPrompt — LLM-primary classifier prompt for Stage 10.
 *
 * The LLM classifies every extracted row as Main / Optional / Excluded /
 * Unknown using full document context (page text excerpts, headings,
 * authoritative totals, supplier/trade/quote_type). Returns strict JSON.
 */

export const SCOPE_SEGMENTATION_SYSTEM_PROMPT =
  `You are a senior construction quote analyst specialising in passive fire protection quotes.

Your task is to classify each extracted quote row into one of four scope categories:

Main
Optional
Excluded
Unknown

You must classify based on the quote structure, not just the row description.

The same item description may appear as Main in one section and Optional in another. Therefore, always use page context, section headings, quote summary tables, page banners, block/building headings, and total reconciliation before relying on keywords.

Classification rules:

1. MAIN
Classify as Main when the row belongs to the base tender scope, included works, contract works, quote summary, estimate summary, items identified on drawings, penetration schedule, standard trade breakdown, building/block subtotal, or rows that make up the selected main total.

Main indicators include:
- Quote Summary
- Estimate Summary
- Items Identified on Drawings
- Base Scope
- Included Scope
- Main Works
- Contract Works
- Sub Total
- Building A / Building B / Block B30 base rows
- Penetrations listed as part of the primary schedule
- Rows contributing to the selected main total

2. OPTIONAL
Classify as Optional when the row belongs to optional scope, add-to-scope items, confirmation-required items, not-shown-on-drawings items, TBC items, alternate items, upgrades, extra-over items, or items that must be accepted/ticked/confirmed before inclusion.

Optional indicators include:
- Optional Scope
- Add to Scope
- Items With Confirmation
- Confirmation Required
- Not Shown on Drawings
- Estimate Items / Not Shown on Drawings
- Extra Over
- TBC Breakdown
- Optional Extras
- Can be removed
- Please confirm by ticking box
- Alternative / Alternate
- Upgrade
- Optional Flush Boxes
- Fire Door Perimeter Seals optional
- Lift Door Perimeter Seals TBC

3. EXCLUDED
Classify as Excluded when the row is explicitly not included in the price, by others, rate-only, zero-value reference only, no allowance, not part of scope, or excluded from the quoted works.

Excluded indicators include:
- By others
- Excluded
- Not included
- No allowance
- Rate only
- No tested solution
- NIC
- By client
- By main contractor
- Reference only

Important:
A zero-dollar row is not automatically Excluded unless wording says it is by others, no allowance, excluded, rate only, or not included.

4. UNKNOWN
Use Unknown only where the quote structure does not provide enough evidence.

Critical reasoning rules:
- Do not classify row-by-row in isolation.
- Classify rows according to the section they belong to.
- If a heading says "QUOTE BREAKDOWN ITEMS IDENTIFIED ON DRAWINGS", rows under it are Main.
- If a heading says "QUOTE BREAKDOWN NOT SHOWN ON DRAWINGS / ITEMS WITH CONFIRMATION / OPTIONAL SCOPE", rows under it are Optional.
- If a heading says "OPTIONAL SCOPE" or "ADD TO SCOPE", rows under it are Optional.
- If a heading says "Estimate items / Not shown on drawings", rows under it are Optional.
- If a quote summary separates base subtotal from add-to-scope subtotal, base subtotal rows are Main and add-to-scope rows are Optional.
- If rows mathematically reconcile to the selected main total, treat that as strong evidence for Main.
- If rows mathematically reconcile to the optional total, treat that as strong evidence for Optional.
- Do not change quantities, rates, totals, descriptions, FRR, service type, or mapped systems.
- Only classify scope.

Return strict JSON only.

Required JSON shape:

{
  "items": [
    {
      "row_id": "string",
      "scope_category": "Main | Optional | Excluded | Unknown",
      "confidence": 0.0,
      "reason": "brief evidence-based explanation",
      "evidence": {
        "page": 1,
        "heading": "text if known",
        "signal": "section_heading | page_banner | quote_summary | total_reconciliation | row_wording | fallback"
      }
    }
  ],
  "summary": {
    "main_sum": 0,
    "optional_sum": 0,
    "excluded_sum": 0,
    "unknown_sum": 0,
    "main_total_match": true,
    "optional_total_match": true,
    "overall_confidence": "HIGH | MEDIUM | LOW",
    "notes": []
  }
}`;

export type ScopeSegmentationLLMRow = {
  row_id: string;
  description: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total_price: number | null;
  source_page: number | null;
  current_scope_category: string;
  existing_confidence: number | null;
  parent_section: string | null;
  nearby_heading: string | null;
};

export type ScopeSegmentationLLMHeading = {
  page: number | null;
  heading: string;
  inferred_type: "Main" | "Optional" | "Excluded" | "Unknown";
};

export type ScopeSegmentationUserPromptArgs = {
  supplier: string;
  trade: string;
  quote_type: string;
  main_total: number | null;
  optional_total: number | null;
  grand_total: number | null;
  page_count: number;
  important_document_context: string;
  headings: ScopeSegmentationLLMHeading[];
  rows: ScopeSegmentationLLMRow[];
};

export function buildScopeSegmentationUserPrompt(
  args: ScopeSegmentationUserPromptArgs,
): string {
  const headingsBlock = args.headings.length === 0
    ? "(none detected)"
    : args.headings
      .map(
        (h, i) =>
          `${i + 1}. [page=${h.page ?? "?"}] [${h.inferred_type}] ${h.heading.slice(0, 200)}`,
      )
      .join("\n");

  const rowsJson = JSON.stringify(args.rows, null, 0);

  return [
    "Classify the following extracted quote rows into Main, Optional, Excluded, or Unknown.",
    "",
    "DOCUMENT CONTEXT:",
    `Supplier: ${args.supplier || "(unknown)"}`,
    `Trade: ${args.trade || "(unknown)"}`,
    `Quote Type: ${args.quote_type || "(unknown)"}`,
    `Selected Main Total Ex GST: ${formatNumber(args.main_total)}`,
    `Optional Total Ex GST: ${formatNumber(args.optional_total)}`,
    `Grand Total Ex GST: ${formatNumber(args.grand_total)}`,
    `Page Count: ${args.page_count}`,
    "",
    "IMPORTANT DOCUMENT TEXT:",
    args.important_document_context || "(none)",
    "",
    "HEADINGS / SECTION MARKERS:",
    headingsBlock,
    "",
    "ROWS TO CLASSIFY:",
    rowsJson,
    "",
    "Return only JSON in the required schema.",
  ].join("\n");
}

export function buildScopeSegmentationReviewPrompt(args: {
  main_total: number | null;
  optional_total: number | null;
  main_sum: number;
  optional_sum: number;
  rows: ScopeSegmentationLLMRow[];
  important_document_context: string;
  headings: ScopeSegmentationLLMHeading[];
}): string {
  const headingsBlock = args.headings.length === 0
    ? "(none detected)"
    : args.headings
      .map(
        (h, i) =>
          `${i + 1}. [page=${h.page ?? "?"}] [${h.inferred_type}] ${h.heading.slice(0, 200)}`,
      )
      .join("\n");

  return [
    "The first classification did not reconcile to the known totals.",
    "Review only the uncertain rows.",
    "Do not change high-confidence rows.",
    `Known Main Total: ${formatNumber(args.main_total)}`,
    `Current Main Sum: ${formatNumber(args.main_sum)}`,
    `Known Optional Total: ${formatNumber(args.optional_total)}`,
    `Current Optional Sum: ${formatNumber(args.optional_sum)}`,
    "",
    "IMPORTANT DOCUMENT TEXT:",
    args.important_document_context || "(none)",
    "",
    "HEADINGS / SECTION MARKERS:",
    headingsBlock,
    "",
    "UNCERTAIN ROWS:",
    JSON.stringify(args.rows, null, 0),
    "",
    "Return corrected classifications for uncertain rows only, in the required schema.",
  ].join("\n");
}

function formatNumber(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "(unknown)";
  return n.toFixed(2);
}
