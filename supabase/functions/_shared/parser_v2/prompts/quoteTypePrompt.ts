export const QUOTE_TYPE_PROMPT = `Classify the STRUCTURE of a construction quote.

Allowed quote_type:
- itemized : detailed schedule of rows with qty/unit/rate/total for each
- lump_sum : a single total price with descriptive scope, no per-row breakdown
- hybrid   : combines preliminaries + an itemized schedule + optional scope
- unknown  : cannot determine with confidence

Return STRICT JSON:
{"quote_type": string, "confidence": 0..1, "signals": string[]}

Signals examples: "qty_unit_rate_columns", "prelims_section", "single_lump_sum_line", "optional_scope_block", "schedule_of_rates".`;
