/*
  # Add source column to parser_version_comparisons

  1. Changes
    - Adds `source` text column to `parser_version_comparisons` to distinguish
      between `live_import` (shadow mode from real user imports) and
      `vault_batch` (bulk Parse From PDF Vault runs).
    - Backfills existing rows that came from the vault bulk runner based on
      metadata.source.
    - Adds an index for filtering by source.

  2. Notes
    - Column is nullable for forward compatibility; all new writes set it.
    - No data loss: additive-only change.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parser_version_comparisons' AND column_name = 'source'
  ) THEN
    ALTER TABLE parser_version_comparisons ADD COLUMN source text;
  END IF;
END $$;

UPDATE parser_version_comparisons
SET source = COALESCE(source, metadata->>'source', 'live_import')
WHERE source IS NULL;

CREATE INDEX IF NOT EXISTS idx_parser_version_comparisons_source
  ON parser_version_comparisons (source, created_at DESC);