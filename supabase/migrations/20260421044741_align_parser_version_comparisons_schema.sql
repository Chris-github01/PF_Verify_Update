/*
  # Align parser_version_comparisons to canonical schema

  Canonical fields used by the Admin Console "Version Comparison" page:
    id, quote_id, supplier, trade, v1_total, v2_total, actual_total,
    winner, v1_runtime_ms, v2_runtime_ms, requires_review, created_at

  1. Changes
     - Rename `supplier_name` to `supplier`
     - Add consolidated `requires_review` boolean (replaces split v1/v2 flags)

  2. Notes
     - Existing auxiliary columns (quote_type, v1_requires_review,
       v2_requires_review, variance_pct, failure_cause, metadata) are kept for
       backward compatibility; they are no longer read by the UI.
     - RLS already enabled in the prior migration; no policy changes needed.
*/

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parser_version_comparisons'
      AND column_name = 'supplier_name'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parser_version_comparisons'
      AND column_name = 'supplier'
  ) THEN
    ALTER TABLE parser_version_comparisons RENAME COLUMN supplier_name TO supplier;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parser_version_comparisons'
      AND column_name = 'requires_review'
  ) THEN
    ALTER TABLE parser_version_comparisons
      ADD COLUMN requires_review boolean DEFAULT false;
  END IF;
END $$;
