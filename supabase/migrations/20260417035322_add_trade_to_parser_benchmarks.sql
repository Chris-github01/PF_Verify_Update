/*
  # Add trade module field to parser_golden_benchmarks

  ## Changes
  - Adds `trade` column to `parser_golden_benchmarks` for per-trade accuracy tracking
  - Valid values: passive_fire, plumbing, electrical, carpentry, hvac, active_fire (or NULL)
  - Adds index for fast trade-based filtering

  ## Why
  Phase 4 commercial benchmark testing requires per-trade accuracy dashboards.
  Each benchmark quote belongs to a trade; the scorecard shows accuracy broken
  down by trade as well as parser family.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parser_golden_benchmarks' AND column_name = 'trade'
  ) THEN
    ALTER TABLE parser_golden_benchmarks ADD COLUMN trade text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_parser_golden_benchmarks_trade
  ON parser_golden_benchmarks(trade)
  WHERE trade IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parser_validation_runs' AND column_name = 'trade'
  ) THEN
    ALTER TABLE parser_validation_runs ADD COLUMN trade text;
  END IF;
END $$;
