/*
  # Add completed_steps to scc_quote_imports

  ## Summary
  Adds a `completed_steps` array column to `scc_quote_imports` so the SCC Quote
  Workflow stepper can independently track which steps the user has fully completed,
  separate from the current active step.

  ## Changes
  - `scc_quote_imports`: new nullable column `completed_steps text[]` — stores the
    list of workflow step IDs (e.g. ['import', 'review_clean']) that the user has
    finished. Allows the stepper to show green checkmarks correctly after a page
    reload, even when the user is in the middle of a later step.

  ## Why this is needed
  Previously only `scc_workflow_step` was stored (the current step), so on reload
  the UI could only guess which prior steps were done. With `completed_steps`, the
  exact set of completed steps is persisted and restored directly.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scc_quote_imports' AND column_name = 'completed_steps'
  ) THEN
    ALTER TABLE scc_quote_imports ADD COLUMN completed_steps text[] DEFAULT '{}';
  END IF;
END $$;
