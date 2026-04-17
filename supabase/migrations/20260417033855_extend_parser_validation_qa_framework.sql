/*
  # Extend Parser Validation — Full QA Framework

  ## Changes to parser_validation_runs
  Adds expanded ground truth fields, error categorisation, batch/shadow support.
  Uses IF NOT EXISTS guards — safe to run against existing table.

  ### New Columns
  - `expected_optional_total` — tester-declared optional scope total
  - `expected_item_count_min` / `expected_item_count_max` — acceptable item count range
  - `expected_has_optional` — tester declares whether optional scope should be detected
  - `expected_has_exclusions` — tester declares whether exclusions should be present
  - `error_category` — auto-tagged root cause when a run fails
  - `run_mode` — manual | batch | shadow
  - `batch_id` — groups batch runs together (uuid)
  - `shadow_candidate_result` — candidate parser output (shadow mode only)
  - `shadow_diff` — computed diff between current and candidate

  ## New Table: parser_golden_benchmarks
  Registry of known benchmark files used for batch / golden dataset mode.
  Each row stores the storage path + full expected ground truth.

  ## Security
  - RLS enabled on new table
  - Consistent with existing parser_validation_runs policies
*/

-- -----------------------------------------------------------------------
-- Extend parser_validation_runs
-- -----------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parser_validation_runs' AND column_name = 'expected_optional_total'
  ) THEN
    ALTER TABLE parser_validation_runs ADD COLUMN expected_optional_total numeric NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parser_validation_runs' AND column_name = 'expected_item_count_min'
  ) THEN
    ALTER TABLE parser_validation_runs ADD COLUMN expected_item_count_min integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parser_validation_runs' AND column_name = 'expected_item_count_max'
  ) THEN
    ALTER TABLE parser_validation_runs ADD COLUMN expected_item_count_max integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parser_validation_runs' AND column_name = 'expected_has_optional'
  ) THEN
    ALTER TABLE parser_validation_runs ADD COLUMN expected_has_optional boolean;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parser_validation_runs' AND column_name = 'expected_has_exclusions'
  ) THEN
    ALTER TABLE parser_validation_runs ADD COLUMN expected_has_exclusions boolean;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parser_validation_runs' AND column_name = 'error_category'
  ) THEN
    ALTER TABLE parser_validation_runs ADD COLUMN error_category text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parser_validation_runs' AND column_name = 'run_mode'
  ) THEN
    ALTER TABLE parser_validation_runs ADD COLUMN run_mode text NOT NULL DEFAULT 'manual';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parser_validation_runs' AND column_name = 'batch_id'
  ) THEN
    ALTER TABLE parser_validation_runs ADD COLUMN batch_id uuid;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parser_validation_runs' AND column_name = 'shadow_candidate_result'
  ) THEN
    ALTER TABLE parser_validation_runs ADD COLUMN shadow_candidate_result jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parser_validation_runs' AND column_name = 'shadow_diff'
  ) THEN
    ALTER TABLE parser_validation_runs ADD COLUMN shadow_diff jsonb;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pvr_batch_id ON parser_validation_runs(batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pvr_run_mode ON parser_validation_runs(run_mode);
CREATE INDEX IF NOT EXISTS idx_pvr_error_category ON parser_validation_runs(error_category) WHERE error_category IS NOT NULL;

-- -----------------------------------------------------------------------
-- parser_golden_benchmarks
-- Registry of benchmark files for batch golden-dataset mode
-- -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS parser_golden_benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid REFERENCES organisations(id) NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  label text NOT NULL DEFAULT '',
  filename text NOT NULL DEFAULT '',
  storage_path text NOT NULL DEFAULT '',
  expected_family text NOT NULL DEFAULT '',
  expected_total numeric NOT NULL DEFAULT 0,
  expected_optional_total numeric NOT NULL DEFAULT 0,
  expected_item_count_min integer,
  expected_item_count_max integer,
  expected_has_optional boolean,
  expected_has_exclusions boolean,
  notes text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pgb_organisation_id ON parser_golden_benchmarks(organisation_id);
CREATE INDEX IF NOT EXISTS idx_pgb_expected_family ON parser_golden_benchmarks(expected_family);

ALTER TABLE parser_golden_benchmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view benchmarks"
  ON parser_golden_benchmarks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organisation_members om
      WHERE om.organisation_id = parser_golden_benchmarks.organisation_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

CREATE POLICY "Org members can insert benchmarks"
  ON parser_golden_benchmarks FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organisation_members om
      WHERE om.organisation_id = parser_golden_benchmarks.organisation_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

CREATE POLICY "Org members can update benchmarks"
  ON parser_golden_benchmarks FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organisation_members om
      WHERE om.organisation_id = parser_golden_benchmarks.organisation_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organisation_members om
      WHERE om.organisation_id = parser_golden_benchmarks.organisation_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

CREATE POLICY "Org members can delete benchmarks"
  ON parser_golden_benchmarks FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organisation_members om
      WHERE om.organisation_id = parser_golden_benchmarks.organisation_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );
