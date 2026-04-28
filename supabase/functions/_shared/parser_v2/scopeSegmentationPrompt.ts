/**
 * scopeSegmentationPrompt — Stage 10 v3 (LLM Native).
 *
 * The LLM is the SOLE classifier. No deterministic fallback exists.
 * Every row must be classified into one of four categories:
 *
 *   Main      — priced row that contributes to the base contract scope
 *   Optional  — priced row that is local-additional / add-to-scope /
 *               not-shown-on-drawings / TBC / alternate / upgrade
 *   Excluded  — explicitly out of scope (by others, not included,
 *               rate only, no allowance, NIC, by client, etc.) OR a
 *               zero-value reference row that wording marks excluded
 *   Metadata  — non-priced bookkeeping (subtotals, grand totals,
 *               GST lines, page totals, summary roll-ups). These are
 *               NOT real cost rows and must not be summed into any
 *               scope total.
 *
 * Critical reset rule: section context resets at any of these
 * heading markers — BLOCK <id>, LOT <id>, LEVEL <id>, UNIT <id>,
 * BUILDING <id>, AREA <id>, SECTION <id>. An "OPTIONAL SCOPE"
 * heading earlier in the document does NOT carry forward through
 * later block/lot/level resets — each new block starts fresh as
 * Main unless its own local heading says otherwise.
 *
 * Optional is local, not global. A row is Optional only if its
 * IMMEDIATE local heading or row wording marks it optional.
 */

export const SCOPE_SEGMENTATION_SYSTEM_PROMPT_V3 =
  `You are the sole scope-classification engine for a construction quote parser.

Classify every row into exactly one of:
  Main
  Optional
  Excluded
  Metadata

Rules — read carefully:

1. Context is LOCAL, not global.
   The most recent heading above a row is the strongest signal.
   When you see any of these heading markers, RESET the section
   context for everything that follows them:
     BLOCK <id>, LOT <id>, LEVEL <id>, UNIT <id>,
     BUILDING <id>, AREA <id>, SECTION <id>.
   An "OPTIONAL SCOPE" heading earlier in the document does NOT
   carry forward through a later "BLOCK 31" reset. Each new block
   begins as Main unless its own local heading or wording says
   otherwise.

2. Reasoning priority (highest to lowest):
   a. Local heading directly above the row (within the current section reset window).
   b. Subtotal labels nearby (e.g. "Block 30 Subtotal", "Optional Total").
   c. Same-page structural cues (column headings, table title, page banner).
   d. Repeated patterns across blocks (B30 row structure ≈ B31 row structure → infer matching scopes).
   e. Row wording itself (TBC, alternate, by others, no allowance).
   f. Price behaviour (zero with "by others" → Excluded; zero alone → not automatically Excluded).
   g. Cross-page continuity only when explicit (e.g. "continued from page 4").

3. Optional is LOCAL.
   Mark a row Optional only when:
     - Its closest local heading says optional / add to scope / not shown
       on drawings / items with confirmation / TBC / alternate / upgrade /
       extra over / can be removed, OR
     - Row wording itself contains those markers, OR
     - It is positioned under a clearly-separated optional pricing block
       on the same page (visible separation, not assumed).
   If a later block-reset heading (BLOCK 31, LEVEL 2, UNIT 14, etc.)
   appears between the optional heading and the row, the row is NOT Optional.

4. Excluded means truly out of scope.
   By others / not included / no allowance / rate only / NIC / by client /
   by main contractor / no tested solution / reference only.
   A zero-dollar row is NOT automatically Excluded — only if its wording
   says so.

5. Metadata is bookkeeping only.
   Sub Total, Subtotal, Block 30 Total, Page Total, Quote Summary line,
   GST, Grand Total, Total Ex GST, Tender Total, Carried Forward.
   Never include Metadata in any scope total.

6. Repeated-block intelligence.
   If you can see structurally identical row sequences under different
   block headings (Block 30 vs Block 31), assume matching rows belong
   to the same scope category as long as no local optional/excluded
   heading separates them.

7. Self-check before returning.
   - Have you reset context at every BLOCK/LOT/LEVEL/UNIT/BUILDING/AREA/SECTION marker?
   - Have you avoided letting a single OPTIONAL heading poison later blocks?
   - Are subtotals/grand totals Metadata, not Main?
   - Are zero-value "by others" rows Excluded, not Optional?
   - Are repeated block structures consistently classified?

Output strict JSON only, in this exact shape:

{
  "stage10_version": "llm_native_v3",
  "status": "ok",
  "runtime_ms": 0,
  "rows": [
    {
      "row_index": 0,
      "scope": "Main",
      "confidence": 0.95,
      "section_id": "BLOCK 30",
      "group_id": "B30 base schedule",
      "rationale_short": "under BLOCK 30 base schedule, no optional heading in scope",
      "heading_basis": "BLOCK 30"
    }
  ],
  "warnings": [],
  "summary": {
    "main_count": 0,
    "optional_count": 0,
    "excluded_count": 0,
    "metadata_count": 0,
    "block_resets_seen": 0,
    "overall_confidence": "HIGH"
  }
}

Constraints:
- Return JSON only. No prose. No markdown fences.
- Do not modify descriptions, prices, quantities, units. Only classify.
- Every row in the input MUST appear exactly once in "rows" output.
- "scope" must be one of: Main | Optional | Excluded | Metadata.
- "confidence" is a number between 0 and 1.
- If the document is genuinely ambiguous, prefer Main and lower confidence rather than Optional or Excluded.`;

export type ScopeRowPacket = {
  row_index: number;
  page: number | null;
  local_position: number | null;
  description: string;
  qty: number | null;
  unit: string | null;
  unit_price: number | null;
  total_price: number | null;
  zero_value_flag: boolean;
  headers_above: string[];
  headers_below: string[];
  page_title: string | null;
  previous_row_summary: string | null;
  next_row_summary: string | null;
};

export type ScopeUserPromptArgs = {
  supplier: string;
  trade: string;
  quote_type: string;
  page_count: number;
  rows: ScopeRowPacket[];
  chunk_label: string;
  is_chunked: boolean;
};

export function buildScopeUserPromptV3(args: ScopeUserPromptArgs): string {
  const rowsJson = JSON.stringify(args.rows);
  const header = [
    `Supplier: ${args.supplier || "(unknown)"}`,
    `Trade: ${args.trade || "(unknown)"}`,
    `Quote Type: ${args.quote_type || "(unknown)"}`,
    `Page Count: ${args.page_count}`,
    `Chunk: ${args.chunk_label}`,
    args.is_chunked
      ? "This input is a chunk of a larger row set. Some rows from adjacent chunks are included as context overlap — classify them too. Use the headers_above / headers_below / previous_row_summary / next_row_summary on each packet to anchor decisions; do not assume context from rows outside this chunk."
      : "This input contains the entire row set in a single pass.",
  ].join("\n");

  return [
    "Classify every row in this packet into Main, Optional, Excluded, or Metadata.",
    "",
    "DOCUMENT METADATA:",
    header,
    "",
    "ROW PACKETS:",
    rowsJson,
    "",
    "Return strict JSON in the schema specified by the system prompt. Every row_index in the input MUST appear exactly once in rows[].",
  ].join("\n");
}
