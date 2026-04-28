/**
 * scopeConsensusPrompts — three independent classifier prompts used by
 * the consensus engine plus a final consistency-check prompt.
 *
 * Each variant produces output in the SAME JSON shape as v4 (rows[] with
 * row_index/scope/confidence/basis/detected_section/rationale_short)
 * so the existing LLM runner, parser and normaliser can be reused
 * without forks.
 *
 * The three variants are:
 *   1. structural  — layout signals only (section banners, table titles,
 *      subtotal boundaries, page continuation). Must ignore row wording.
 *   2. semantic    — row wording only (description phrasing, markers
 *      like "by others", "TBC", "alternate"). Must ignore layout.
 *   3. commercial  — commercial quote logic only (priced vs unpriced,
 *      subtotal math, provisional / allowance wording, zero rows,
 *      markup/PS3/QA). Treats rows as financial items, not scope items.
 *
 * A 4th prompt is used for the consistency pass: given a set of rows
 * that share a heading but received conflicting classifications, it
 * re-evaluates them as a group.
 */

const COMMON_OUTPUT_SHAPE = `OUTPUT — STRICT JSON:
{
  "rows": [
    {
      "row_index": 0,
      "scope": "Main" | "Optional" | "Excluded" | "Metadata",
      "confidence": 0-100,
      "basis": "section" | "table" | "carryover" | "row_text",
      "detected_section": "<heading used or empty>",
      "rationale_short": "<=200 chars"
    }
  ],
  "summary": {
    "main_count": 0,
    "optional_count": 0,
    "excluded_count": 0,
    "metadata_count": 0,
    "main_total": 0,
    "optional_total": 0
  }
}

Rules:
- Return JSON only. No prose. No markdown fences.
- Every row_index in the input MUST appear exactly once.
- confidence is an integer 0-100.`;

export const STRUCTURAL_PROMPT = `You are a scope-classification engine for a construction quote parser.

Your ONLY job on this pass is to classify every row using DOCUMENT
STRUCTURE. You must IGNORE the semantic wording of each row. Treat the
description field as an opaque identifier — do not use trigger words
like "optional", "by others", "TBC", "alternate", "allowance" to decide
the class. Only use them if they appear in headers_above, table_title
or page_title.

Classes:
  Main      — rows under a base / tender / main / included scope section.
  Optional  — rows under a banner that explicitly scopes them optional:
              "ITEMS WITH CONFIRMATION / OPTIONAL SCOPE", "ADD TO SCOPE",
              "Estimate items / Not shown on drawings", "Provisional",
              "Alternates", "Separate Price".
  Excluded  — rows under an Exclusions / Not Included / By Others banner.
  Metadata  — rows where the description itself is a subtotal / grand
              total / GST / page total (the row IS the roll-up).

Priority order (highest wins):
  1. Section / banner heading in headers_above
  2. table_title for this page
  3. Subheading most recently above (last entry in headers_above)
  4. Subtotal ownership (subtotal belongs to the section above it)
  5. Carryover from previous page when no fresh heading

If none of 1-5 give a clear class, default to Main with confidence <= 50
and basis="row_text". Do NOT classify as Optional/Excluded based on
row wording alone — that is the semantic pass's job.

basis MUST be one of "section" | "table" | "carryover" | "row_text".

${COMMON_OUTPUT_SHAPE}`;

export const SEMANTIC_PROMPT = `You are a scope-classification engine for a construction quote parser.

Your ONLY job on this pass is to classify every row using the SEMANTIC
WORDING of its description. You must IGNORE document structure signals
— treat headers_above, table_title, page_title and previous_rows /
next_rows as unavailable. Read the description field only.

Classes & strong keyword signals:
  Optional — "optional", "alternate", "alternative", "separate price",
             "extra over", "add to scope", "if accepted", "if required",
             "price on application", "architectural/structural details".
  Excluded — "by others", "NIC", "not included", "not in contract",
             "by client", "by main contractor", "excluded", "no allowance",
             "rate only", "reference only", "tbc" (when not a qty).
  Metadata — the description IS a subtotal / grand total / GST /
             carried forward / page total — i.e. it names a roll-up.
  Main     — everything else (default for real work items).

If the wording is neutral (generic item description) default to Main.

basis for this pass should be "row_text" unless the description itself
names a section (e.g. "— Block 30 Subtotal").

${COMMON_OUTPUT_SHAPE}`;

export const COMMERCIAL_PROMPT = `You are a scope-classification engine for a construction quote parser.

Your ONLY job on this pass is to apply COMMERCIAL QUOTE LOGIC. Treat
each row as a financial item. Focus on qty/unit_price/total_price and
money-flavoured wording.

Classes:
  Metadata — the row is a bookkeeping roll-up:
             - description matches subtotal / section total / block total /
               building total / page total / grand total / tender total /
               total ex GST / GST / carried forward / brought forward.
             - total_price is present but qty and unit_price are both null,
               AND the description names a section name + "total".
  Optional — priced row that carries commercial "optional" semantics:
             - "provisional sum", "PS allowance", "allowance",
               "alternate", "separate price", "extra over",
               "price on application", "POA", "if accepted",
               "architectural/structural details" — AND it has a price.
  Excluded — zero or null-priced row whose wording says work is done
             elsewhere: "by others", "NIC", "by main contractor",
             "by client", "reference only", "rate only".
  Main     — any other priced row that represents real work (including
             lump sums for labour, prep, P&G, preliminaries, margin,
             PS3/QA, freight — these are MAIN scope, not metadata).

Do NOT classify rows as Optional purely because they sit under a banner.
Structural inheritance is the structural pass's job.

basis for this pass should usually be "row_text". Use "table" only when
table_title explicitly names a commercial category (e.g.
"Provisional Sums", "Allowances").

${COMMON_OUTPUT_SHAPE}`;

export const CONSISTENCY_PROMPT = `You are a scope-consistency reviewer for a construction quote parser.

You will receive a small set of ROWS that share the same structural
heading (same detected_section and same page/table) but received
CONFLICTING classifications from three independent passes.

Your job: re-classify every row in the group as a coherent block.
Rules:
  - Prefer a single class for the whole group unless there is a clear
    structural or commercial reason to split (e.g. a subtotal row
    inside the group stays Metadata).
  - If the shared heading is an Optional/Excluded banner, the whole
    group follows that banner unless a row is itself a Metadata
    roll-up.
  - If the shared heading is a Main/base banner, the whole group is
    Main unless a row is itself Metadata, or its wording unambiguously
    marks it Excluded ("by others", "NIC") or Optional ("provisional",
    "alternate", "separate price").
  - Never invent a new heading. Reuse the detected_section given.

${COMMON_OUTPUT_SHAPE}`;
