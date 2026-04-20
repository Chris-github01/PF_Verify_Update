/*
  # Add Totals Trust Layer to Quotes

  Adds evidence snapshot and confidence tracking for parser totals decisions.
  Supports the Totals Trust Layer hardening: preventing HIGH-confidence totals
  from being overwritten by lower-confidence reparses, and persisting an
  auditable evidence record for every totals decision.

  1. New Columns on `quotes`
     - `totals_confidence` (text) — HIGH / MEDIUM / LOW, mirrors resolution_confidence
       but specifically scoped to the totals decision
     - `totals_evidence` (jsonb) — snapshot of labelled totals, summed scopes,
       tolerance used, deltas, notes, and resolution source at decision time

  2. Security
     - No policy changes (inherits existing quotes RLS)

  3. Notes
     1. `resolution_confidence` already exists and continues to be written
     2. `totals_confidence` is additive; it is not removed from existing rows
     3. `totals_evidence` defaults to NULL for legacy rows
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotes' AND column_name = 'totals_confidence'
  ) THEN
    ALTER TABLE quotes ADD COLUMN totals_confidence text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotes' AND column_name = 'totals_evidence'
  ) THEN
    ALTER TABLE quotes ADD COLUMN totals_evidence jsonb;
  END IF;
END $$;
