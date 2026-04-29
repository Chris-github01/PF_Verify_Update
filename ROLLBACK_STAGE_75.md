# Rollback — Stage 7.5 (Line Item Recovery Engine)

Stage 7.5 is a hidden fallback that runs ONLY when Stage 7 returns zero or
unusably low-quality line items. When Stage 7 is healthy the recovery engine
returns the original items unchanged. To disable or fully remove it, follow
the steps below.

## Option A — Instant disable (no code changes)

1. Set the edge-function environment variable:

       ENABLE_STAGE_75_RECOVERY=false

2. The recovery engine short-circuits on load and returns the original items.
   No redeploy required; the flag is read at call time.

## Option B — Full revert

1. Set `ENABLE_STAGE_75_RECOVERY=false` (belt-and-braces).
2. Restore the backed-up pipeline file:

       cp supabase/functions/_shared/parser_v2/runParserV2.ts.pre_stage75_backup \
          supabase/functions/_shared/parser_v2/runParserV2.ts

3. Remove the recovery module:

       rm supabase/functions/_shared/lineItemRecovery.ts

4. Redeploy the edge functions that embed the parser:

   - parse_quote_with_extractor
   - process_parsing_job
   - bulk_compare_vault_pdf
   - parse_quote_llm_fallback
   - test_parsing_v3
   - validate_parser

5. Re-run parser tests against a known-good quote and the Summerset Milldale
   failing quote to confirm behaviour matches the pre-Stage-7.5 baseline.

## Files touched by Stage 7.5

Created:
- `supabase/functions/_shared/lineItemRecovery.ts`
- `ROLLBACK_STAGE_75.md`

Modified:
- `supabase/functions/_shared/parser_v2/runParserV2.ts` (added import +
  one call site immediately after Stage 7 extraction).

Backed up:
- `supabase/functions/_shared/parser_v2/runParserV2.ts.pre_stage75_backup`

## Safety notes

- If `extractedLineItems.length > 0` and quality gates pass, the engine is a
  no-op and returns the original array reference untouched.
- Recovery output preserves the `ParsedLineItemV2` contract (item_number,
  description, total_price, scope_category, trade, etc.) so downstream stages
  (Deterministic Totals, Scope Marker Detection, Validation, Mapping) behave
  identically.
- All activations log `[stage_7_5] activated=...` and add an anomaly entry
  `stage_7_5_activated:<reason>` so activations are traceable.
