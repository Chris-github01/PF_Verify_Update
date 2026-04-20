/*
  # Add requires_review flag to quotes

  ## Summary
  Parser trust stabilization. When the parser produces a zero grand_total or LOW
  confidence consensus, the quote must be flagged as requiring manual review.
  This adds a single boolean column with a safe default.

  ## Changes
  1. Add column `requires_review` (boolean, default false) to `public.quotes`
     - Safe default: existing rows remain `false`.
     - Updated by `process_parsing_job` when zero-total or LOW-confidence.

  ## Security
  - No RLS changes. Column inherits the existing policies on `quotes`.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'quotes'
      AND column_name = 'requires_review'
  ) THEN
    ALTER TABLE public.quotes
      ADD COLUMN requires_review boolean NOT NULL DEFAULT false;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_quotes_requires_review
  ON public.quotes (project_id)
  WHERE requires_review = true;
