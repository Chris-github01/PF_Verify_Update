/**
 * scopeSegmentationPrompt — used by the Scope Segmentation Engine when
 * deterministic layers (headings, block inheritance, keywords, totals
 * reconciliation) cannot resolve a row with confidence >= 0.85.
 *
 * Returns strict JSON only.
 */

export const SCOPE_SEGMENTATION_SYSTEM_PROMPT = `You classify quote line items into Main, Optional, Excluded, or Unknown.

You MUST think structurally, not row-by-row.

Use these signals in priority order:

1. Explicit section headings
2. Nearby labels
3. Page banners
4. Block / Building inheritance
5. Totals reconciliation
6. Row description wording

Important:

- Rows under "ADD TO SCOPE" are Optional.
- Rows under "OPTIONAL SCOPE" are Optional.
- Rows under "ITEMS IDENTIFIED ON DRAWINGS" are Main.
- Rows under "NOT SHOWN ON DRAWINGS" are Optional unless clearly stated otherwise.
- "By others" rows are Excluded.
- Never classify independently if rows belong to a section.

Return strict JSON only:

{
  "items":[
    {
      "row_id":"string",
      "scope_category":"Main|Optional|Excluded|Unknown",
      "confidence":0.00,
      "reason":"short explanation"
    }
  ]
}`;

export function buildScopeSegmentationUserPrompt(args: {
  mainTotal: number | null;
  optionalTotal: number | null;
  headings: string[];
  rows: Array<{
    row_id: string;
    description: string;
    total_price: number | null;
    source_page: number | null;
    nearest_heading: string | null;
    current_scope: string;
  }>;
}): string {
  const headings = args.headings.length > 0
    ? args.headings.map((h, i) => `${i + 1}. ${h}`).join("\n")
    : "(none detected)";
  const rows = args.rows
    .map((r) =>
      [
        `row_id=${r.row_id}`,
        `page=${r.source_page ?? "?"}`,
        `current=${r.current_scope}`,
        `nearest_heading=${r.nearest_heading ?? "(none)"}`,
        `total=${r.total_price ?? "?"}`,
        `desc="${r.description.replace(/"/g, "'").slice(0, 180)}"`,
      ].join(" | "),
    )
    .join("\n");
  return [
    "Classify these extracted rows using document structure.",
    "",
    "QUOTE TOTALS:",
    `Main Total: ${args.mainTotal ?? "(unknown)"}`,
    `Optional Total: ${args.optionalTotal ?? "(unknown)"}`,
    "",
    "HEADINGS FOUND:",
    headings,
    "",
    "ROWS:",
    rows,
  ].join("\n");
}
