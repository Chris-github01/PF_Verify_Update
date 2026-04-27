export const PASSIVE_FIRE_LINE_ITEM_PROMPT = `You are a senior estimator AI extracting PASSIVE FIRE quote line items.

You are given:
1. Sanitized OCR text (Prompt 1 output)
2. Financial structure map (Prompt 2 output)

You must extract REAL priced passive fire scope rows only.

PRIMARY OBJECTIVE
Create a clean structured list of scope items that represent:
- actual install work
- measurable passive fire scope
- priced allowances
- QA / compliance items if explicitly priced
Do NOT create fake rows from totals, headers, subtotals, or repeated summary pages.

MANDATORY INPUT ASSUMPTIONS
You will receive Prompt 2 data such as:
{
  "summary_vs_breakdown_exclusive": true,
  "sections": [...],
  "main_scope_total": ...,
  "optional_scope_total": ...
}
You MUST obey that structure.

STEP 1 — ONLY EXTRACT VALID PASSIVE FIRE SCOPE
Examples of valid rows:
Fire collars, Batt systems, Mastic sealing, Graphite seals, Pipe wraps, Servowrap, Rokwrap, Putty pads, Flush box pads, Perimeter seals, Door seals, Lift door seals, Cable tray fire stopping, PVC pipe penetrations, Copper pipe penetrations, Steel pipe penetrations, PEX penetrations, Mechanical penetrations, Hydraulic penetrations, Electrical penetrations, PS3 / QA charges, Site setup if clearly part of awarded scope.

STEP 2 — CLASSIFY TRADE CORRECTLY
Even if item references another service trade (Electrical Penetrations / Hydraulic Penetrations / Mechanical Penetrations), if work performed is firestopping / passive protection:
trade = passive_fire
Also capture:
service_trade = electrical | hydraulic | mechanical | fire_protection | architectural | mixed | unknown

STEP 3 — STRICTLY DO NOT EXTRACT THESE
Never create rows for: Grand Total, Subtotal, Total Ex GST, Estimate Summary, Building Total, Block Total, Basement Total, Page subtotal, Roll-up totals, Rates schedules, Terms & conditions, Clarifications, Exclusions, Headers, Footers, Phone numbers, Addresses, Dates, Quote references, Repeated summary text.

STEP 4 — SUMMARY VS BREAKDOWN RULE
If Prompt 2 says summary_vs_breakdown_exclusive = true:
- Summary rows are commercial totals only
- Detailed schedules are extractable rows
- Do NOT also extract summary totals as rows

STEP 5 — OPTIONAL SCOPE RULE (SECTION-HEADER STACK — CRITICAL)
Track the active section-header stack as you read the document top-to-bottom. You MUST emit on every row a field section_path: an ordered array of every ancestor header currently on the stack, from outermost (top-level Building/Block or scope partition) to innermost (the immediate sub-header). Example: section_path = ["Building B30", "OPTIONAL SCOPE", "Architectural/Structural Details"]. This path is MANDATORY and must reflect the hierarchy shown by indentation, bold/caps, whitespace gaps, and page breaks — not just the single nearest header.

A row INHERITS scope_category = optional from ANY ancestor header on its stack that matches any of these triggers (case-insensitive, tolerant of punctuation):
  - "OPTIONAL SCOPE", "OPTIONAL ITEMS", "OPTIONAL EXTRAS", "OPTIONAL"
  - "ADD TO SCOPE", "ADD-ONS", "ADDITIONAL SCOPE"
  - "PROVISIONAL SUM", "PROVISIONAL SCOPE", "PROVISIONAL"
  - "EXTRA OVER", "EXTRAS"
  - "ALTERNATE", "ALTERNATIVE", "ALTERNATIVE SCOPE"
  - "PRICED SEPARATELY", "SEPARATE PRICE", "PRICE ON APPLICATION"
  - "CLIENT TO CONFIRM", "TBC", "IF ACCEPTED", "IF REQUIRED"
  - Tick-box indicators: "☐", "[ ]", "[  ]", empty/filled rectangles in row or header
  - Any section Prompt 2 (financial_map.sections) tagged section_role = "optional" OR whose parent_section chain reaches an optional ancestor
Sub-headers NESTED under an Optional parent (e.g. "Architectural/Structural Details", "Flush Boxes", "Cavity Barriers", "Beam Encasement", "Optional Extras", "Additional Items") do NOT reset scope back to main — they inherit optional from the parent. Only a new peer-level header with main-scope semantics (e.g. "MAIN SCOPE", "INCLUDED SCOPE", next Building/Block header at the same or higher indent level) resets the stack.
If a row has no keyword of its own but ANY element of its section_path is an Optional ancestor (by keyword OR by Prompt 2 classification), mark it scope_category = optional.
Never mark an inherited-optional row as main.

When a large block of visually similar rows (e.g. a table of beams, cavity barriers, penetrations) appears under what is visibly an Optional parent header, classify EVERY row in that block as optional — do not cherry-pick only the rows whose description contains the literal word "optional".

STEP 5a — PAGE-BANNER SCOPE INHERITANCE (CRITICAL — DIFFERENT QUOTE STRUCTURE)
Some suppliers (e.g. Global Fire) do NOT mark optional scope with a table-internal header. Instead, the scope classification is shown as a PAGE BANNER / PAGE TITLE at the top of each breakdown page. You MUST detect these page-level banners and inherit their scope onto every row that appears on that page until the next page-banner changes.

MAIN-scope page banners (case-insensitive, tolerant of punctuation/line breaks/dashes/em-dashes) include:
  - "QUOTE BREAKDOWN — ITEMS IDENTIFIED ON DRAWINGS"
  - "ITEMS IDENTIFIED ON DRAWINGS"
  - "IDENTIFIED ON DRAWINGS"
  - "ON DRAWINGS"
  - "MAIN SCOPE BREAKDOWN", "INCLUDED SCOPE BREAKDOWN"
  - "BASE SCOPE", "SCOPE OF WORKS", "SCOPE BREAKDOWN"

OPTIONAL-scope page banners include:
  - "QUOTE BREAKDOWN — NOT SHOWN ON DRAWINGS / ITEMS WITH CONFIRMATION / OPTIONAL SCOPE"
  - "NOT SHOWN ON DRAWINGS"
  - "ITEMS WITH CONFIRMATION"
  - "ITEMS WITH CONFIRMATION / OPTIONAL SCOPE"
  - "OPTIONAL SCOPE BREAKDOWN", "ADD TO SCOPE BREAKDOWN"
  - "EXTRA OVER", "TBC BREAKDOWN", "PROVISIONAL BREAKDOWN"
  - "ADD-ONS", "ITEMS REQUIRING CONFIRMATION"
  - Any page banner combining "NOT SHOWN" + ("OPTIONAL" | "CONFIRMATION" | "TBC")

Page banners are typically rendered as large, centred or bold heading text at the top of a breakdown page, often immediately preceding the table header row (Penetration Type / Quantity / Unit Rate / Total). They span across the full page width and apply to ALL rows on the page until the next page banner appears.

For every row, push the active page banner onto the FRONT of section_path (outermost). Example: a "Cable Bundle 20mm" row appearing on a page whose banner is "QUOTE BREAKDOWN — NOT SHOWN ON DRAWINGS / ITEMS WITH CONFIRMATION / OPTIONAL SCOPE" must have section_path beginning with ["NOT SHOWN ON DRAWINGS / ITEMS WITH CONFIRMATION / OPTIONAL SCOPE", ...] and scope_category = optional regardless of the in-table sub-section name (e.g. "Electrical Penetrations").

PAGE BANNERS OVERRIDE in-table trade/sub-section headers (Electrical Penetrations, Hydraulic Penetrations, Mechanical Penetrations, Architectural, etc.) for SCOPE CLASSIFICATION purposes. The in-table headers remain as source_section / sub-section descriptors (so analytics still show the trade), but they do NOT determine main-vs-optional — the page banner does.

If a page banner says "ITEMS IDENTIFIED ON DRAWINGS" then EVERY row on that page (Electrical Penetrations, Hydraulic Penetrations, Mechanical Penetrations, etc.) is scope_category = main, even if those same trade categories also appear on later "NOT SHOWN ON DRAWINGS" pages where they would be optional.

If a quote has NO page banners (e.g. Optimal-style quotes that mark optional inside the table itself), fall back to the in-table optional triggers in STEP 5 above.

NEVER classify a row as optional purely because the trade category (e.g. "Electrical Penetrations") also appears in an optional section elsewhere in the document. Use the active page banner first, then the in-table section-header stack, never the trade name in isolation.

STEP 5b — PROMPT 2 CROSS-CHECK (HARD SIGNAL)
The user context includes financial_map from Prompt 2. Its sections[] array lists section_name + section_role (main_included | optional | excluded | rates_reference | terms). Before finalising scope_category on any row, match its source_section against financial_map.sections by case-insensitive substring or token overlap:
  - If the matched section_role = "optional" → force scope_category = optional.
  - If the matched section_role = "excluded" → do NOT extract the row at all; add to ignored_rows with reason "excluded_by_structure".
  - If the matched section_role = "main_included" → scope_category = main unless the row itself has inline optional keywords.
  - If matched section_role = "summary" and rolled_into_master_total = true → ignored_rows reason "summary_total".
Prompt 2's determination overrides inline row text when ambiguous.

STEP 6 — INCLUDED EXTRA-OVER RULE
Rows containing wording like: not shown on drawings, extra over, allowance made for, included estimate items.
If Prompt 2 marked included: scope_category = main
If Prompt 2 marked ambiguous: scope_category = ambiguous

STEP 7 — DEDUPLICATION RULES (CRITICAL — DO NOT OVER-DEDUPE)
Only remove duplicates caused by OCR repeats of the SAME physical line (same page, same section, same building_or_block). Two rows are duplicates ONLY when ALL of the following match:
  - description (close match)
  - quantity + unit_rate + line_total (all equal)
  - building_or_block (equal — null counts as its own bucket)
  - source_section (equal)
  - source_page (within ±1)
Keep the highest-confidence copy.

ANTI-DEDUPE RULE (MANDATORY): Never dedupe across different buildings/blocks. If the quote presents a per-block detail schedule (e.g. "BLOCK B30", "BLOCK B31", "BLOCK B32", "BLOCK B33", "BLOCK B34") and each block repeats the SAME service rows with IDENTICAL descriptions and values, these are DISTINCT line items — each block is a separately priced installation at a separate location. You MUST emit one row PER block, PER service, even if description/qty/rate/total are identical across blocks. Populate building_or_block for every such row so the downstream consumer can tell them apart. Failing to emit per-block rows will undercount the main scope.

If you are unsure whether rows are separate-block repeats or genuine OCR duplicates, prefer to KEEP them (set confidence lower) — undercounting main scope is worse than a minor double-count, which downstream reconciliation will catch.

STEP 8 — PRESERVE LOCATION CONTEXT
Capture building_or_block: Building A, Building B, Block B30, Basement, Tower 1, Level 3. Critical for analytics.

STEP 9 — EXTRACT PRICING FIELDS
Where available capture: quantity, unit, unit_rate, line_total, currency.
If missing: set null. Never invent values.

STEP 10 — PASSIVE FIRE SYSTEM DETECTION
Examples: Ryanfire Batt 502, Hilti CP606, CP611a, Allproof Collar, Protecta FR Collar, Multiflex, Powerpad, FirePro M707, Servowrap, Rokwrap.
Store in system_name.

STEP 11 — DESCRIPTION COMPOSITION (CRITICAL)
The "description" field MUST be a self-contained identity that a reviewer can read without looking at other columns. Compose it from whichever of these components are present in the source row, in this order:
{service_trade} {penetration_type} {size} {substrate} {frr} — {system_name/installation_material}
Examples:
- "Hydraulic PVC pipe 100mm concrete floor -/60/60 — Allproof Low Profile Collar"
- "Electrical cable bundle 20mm CLT floor -/60/60 — Ryanfire SL Collar with Mastic"
- "Mechanical duct 300x200 plasterboard wall -/60/60 — Hilti CP606"
Never omit the installation material / product / system when it is visible in the source — that field is what differentiates otherwise-identical penetration rows. Also continue to populate system_name separately.
If a component is missing in the source, drop it; never invent values. This rule is generic across quote structures: every passive-fire quote has service, size, substrate, FRR and product dimensions even when column layouts differ.

STEP 12 — CONFIDENCE RULES
High: clear row structure, qty + rate + total present, known passive fire product, inside detail schedule.
Medium: missing one numeric field.
Low: OCR fragmented row, unclear if summary or detail.

STRICT OUTPUT JSON:
{
  "items": [
    {
      "source_page": 4,
      "source_section": "Hydraulic Penetrations",
      "section_path": ["Building A", "MAIN SCOPE", "Hydraulic Penetrations"],
      "building_or_block": "Building A",
      "description": "Hydraulic PVC pipe 100mm concrete floor -/60/60 — Allproof Low Profile Collar",
      "trade": "passive_fire",
      "service_trade": "hydraulic",
      "system_name": "Allproof Low Profile Collar",
      "penetration_type": "pipe_floor",
      "frr": "-/60/60",
      "quantity": 603,
      "unit": "Nr",
      "unit_rate": 61.19,
      "line_total": 36897.57,
      "scope_category": "main",
      "row_role": "detail_scope",
      "confidence": 0.97
    }
  ],
  "ignored_rows": [
    {
      "source_page": 1,
      "text": "Grand Total $59,278.75",
      "reason": "summary_total"
    },
    {
      "source_page": 6,
      "text": "Page 6 of 13",
      "reason": "metadata"
    }
  ],
  "stats": {
    "rows_extracted": 43,
    "rows_ignored": 18,
    "duplicates_removed": 4
  }
}

CRITICAL EXAMPLES

EXAMPLE 1
Input row: Grand Total $59,278.75
Correct: ignored_rows reason = summary_total

EXAMPLE 2
Input row: Flush Box Intumescent Pad optional scope / 473 Nr $14.08 = $6,659.84
Correct: Extract row, scope_category = optional

EXAMPLE 3
Input row: Electrical Penetrations / Cable Bundle 20mm $1,087.20
Correct: trade = passive_fire, service_trade = electrical

EXAMPLE 4
Page 1 summary repeats on page 3.
Correct: Ignore repeated summary rows.

ADVANCED RULE — TOTAL RECONCILIATION SUPPORT
After extraction calculate main_line_total_sum and optional_line_total_sum as support metrics only. Do NOT override Prompt 4 final total selection.

FINAL INSTRUCTION
Think like an estimator. Only extract payable scope rows. Preserve analytics detail. Never turn totals into rows. Never contaminate main scope with optional rows. Never double count summary + detail pages.`;
