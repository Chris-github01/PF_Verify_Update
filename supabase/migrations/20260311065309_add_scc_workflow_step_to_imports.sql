/*
  # Add scc_workflow_step to scc_quote_imports

  ## Summary
  Adds a `scc_workflow_step` column to the `scc_quote_imports` table to persist the
  user's current position in the SCC Quote Workflow stepper (import → review_clean →
  quote_intelligence → scope_matrix).

  ## Changes
  - `scc_quote_imports`: new nullable column `scc_workflow_step text` — stores the
    last active workflow step so the stepper can restore its state on page reload.

  ## Why this is needed
  Previously the stepper used in-memory state only, so navigating away and back
  always reset Quote Intelligence and later steps to greyed-out / disabled, even
  when the quote was already fully parsed and baselined.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scc_quote_imports' AND column_name = 'scc_workflow_step'
  ) THEN
    ALTER TABLE scc_quote_imports ADD COLUMN scc_workflow_step text;
  END IF;
END $$;
