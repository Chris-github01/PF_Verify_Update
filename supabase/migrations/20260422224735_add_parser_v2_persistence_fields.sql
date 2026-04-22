/*
  # Parser V2 persistence fields

  Adds columns to `quotes` and `parsing_jobs` to persist the Parser V2
  final record (`passive_fire_final`) and the supporting structure,
  selector, and validation outputs. This lets every UI surface read V2
  results directly instead of relying on the admin-only version
  comparison table.

  1. Changes
    - `quotes` table gains:
      - `parser_primary` (text) — which parser produced the totals: 'v2' | 'v1' | 'v1_fallback'
      - `parser_fallback_reason` (text, nullable) — reason V2 was not used
      - `passive_fire_final` (jsonb, nullable) — full composed final record
      - `parser_v2_confidence` (numeric, nullable)
      - `parser_v2_review_status` (text, nullable)
      - `parser_v2_comparison_safe` (boolean, nullable)
      - `parser_v2_quote_type` (text, nullable)
      - `parser_v2_total_ex_gst` (numeric, nullable)
      - `parser_v2_total_inc_gst` (numeric, nullable)
      - `parser_v2_optional_total` (numeric, nullable)
      - `parser_v1_total` (numeric, nullable) — preserved V1 total for fallback comparison
    - `parsing_jobs` table gains:
      - `parser_v2_output` (jsonb, nullable) — full ParserV2Output for debug view

  2. Security
    - No RLS changes — these are additive columns on tables that already
      have RLS policies.

  3. Notes
    - All columns nullable; existing rows remain untouched.
    - `parser_primary` defaults to 'v1' for existing rows so Quote Select
      continues to read the legacy totals until the row is reparsed.
*/

ALTER TABLE IF EXISTS quotes
  ADD COLUMN IF NOT EXISTS parser_primary text DEFAULT 'v1',
  ADD COLUMN IF NOT EXISTS parser_fallback_reason text,
  ADD COLUMN IF NOT EXISTS passive_fire_final jsonb,
  ADD COLUMN IF NOT EXISTS parser_v2_confidence numeric,
  ADD COLUMN IF NOT EXISTS parser_v2_review_status text,
  ADD COLUMN IF NOT EXISTS parser_v2_comparison_safe boolean,
  ADD COLUMN IF NOT EXISTS parser_v2_quote_type text,
  ADD COLUMN IF NOT EXISTS parser_v2_total_ex_gst numeric,
  ADD COLUMN IF NOT EXISTS parser_v2_total_inc_gst numeric,
  ADD COLUMN IF NOT EXISTS parser_v2_optional_total numeric,
  ADD COLUMN IF NOT EXISTS parser_v1_total numeric;

ALTER TABLE IF EXISTS parsing_jobs
  ADD COLUMN IF NOT EXISTS parser_v2_output jsonb;

CREATE INDEX IF NOT EXISTS quotes_parser_primary_idx ON quotes(parser_primary);
