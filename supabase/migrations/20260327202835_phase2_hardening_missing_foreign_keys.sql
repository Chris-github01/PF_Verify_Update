/*
  # Phase 2 Hardening: Add Missing Foreign Keys

  ## Summary
  Several Phase 2 tables have a `run_id` column referencing `shadow_runs.id`
  but were created without the FK constraint. This breaks PostgREST's embedded
  resource join syntax (`shadow_runs!inner`) used in the recommendation engine's
  `aggregateFailures()` function, causing it to return zero rows for every query.

  ## Tables Fixed
  - `shadow_run_failures` — add FK run_id → shadow_runs.id
  - `shadow_run_diagnostics` — add FK run_id → shadow_runs.id
  - `document_truth_validations` — add FK run_id → shadow_runs.id

  ## Security
  - No RLS changes. These are structural integrity fixes only.
  - All tables already have RLS enabled with appropriate policies.

  ## Notes
  - Uses IF NOT EXISTS pattern via DO block to be safe on re-run.
  - Existing data is preserved; the FK is added without validation to avoid
    blocking on any orphaned rows from pre-migration runs.
*/

-- shadow_run_failures: run_id → shadow_runs.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'shadow_run_failures'
      AND constraint_name = 'shadow_run_failures_run_id_fkey'
      AND constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE shadow_run_failures
      ADD CONSTRAINT shadow_run_failures_run_id_fkey
      FOREIGN KEY (run_id) REFERENCES shadow_runs(id)
      ON DELETE CASCADE
      NOT VALID;

    ALTER TABLE shadow_run_failures
      VALIDATE CONSTRAINT shadow_run_failures_run_id_fkey;
  END IF;
END $$;

-- shadow_run_diagnostics: run_id → shadow_runs.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'shadow_run_diagnostics'
      AND constraint_name = 'shadow_run_diagnostics_run_id_fkey'
      AND constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE shadow_run_diagnostics
      ADD CONSTRAINT shadow_run_diagnostics_run_id_fkey
      FOREIGN KEY (run_id) REFERENCES shadow_runs(id)
      ON DELETE CASCADE
      NOT VALID;

    ALTER TABLE shadow_run_diagnostics
      VALIDATE CONSTRAINT shadow_run_diagnostics_run_id_fkey;
  END IF;
END $$;

-- document_truth_validations: run_id → shadow_runs.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'document_truth_validations'
      AND constraint_name = 'document_truth_validations_run_id_fkey'
      AND constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE document_truth_validations
      ADD CONSTRAINT document_truth_validations_run_id_fkey
      FOREIGN KEY (run_id) REFERENCES shadow_runs(id)
      ON DELETE CASCADE
      NOT VALID;

    ALTER TABLE document_truth_validations
      VALIDATE CONSTRAINT document_truth_validations_run_id_fkey;
  END IF;
END $$;
