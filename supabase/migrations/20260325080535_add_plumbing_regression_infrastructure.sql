/*
  # Plumbing Regression Suite Infrastructure

  ## Summary
  Extends the existing regression suite tables with the infrastructure needed
  for Phase 5 plumbing parser historical regression testing.

  ## New Tables
  - `regression_suite_case_results` — stores per-case results for each suite run,
    including expected JSON, live output, shadow output, diff, pass/fail verdict,
    failure reasons, and metrics.

  ## Modified Tables
  - `regression_suites` — adds `is_active`, `config_json`, `updated_at` columns
  - `regression_suite_cases` — adds `case_label`, `is_must_pass`, `notes` columns
  - `regression_suite_runs` — adds `recommendation`, `cases_total`, `cases_passed`,
    `cases_failed_minor`, `cases_failed_major`, `cases_failed_critical` columns

  ## Security
  - RLS enabled on new table
  - Platform admins can read/write all regression data
  - Regular users have no access

  ## Notes
  1. All changes are purely additive — no existing columns are dropped or renamed
  2. The regression data is admin-only and never exposed to customer-facing routes
  3. `is_must_pass` flags critical historical known-bad cases that must pass before beta
*/

-- ─── Extend regression_suites ────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'regression_suites' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE regression_suites ADD COLUMN is_active boolean DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'regression_suites' AND column_name = 'config_json'
  ) THEN
    ALTER TABLE regression_suites ADD COLUMN config_json jsonb DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'regression_suites' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE regression_suites ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- ─── Extend regression_suite_cases ───────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'regression_suite_cases' AND column_name = 'case_label'
  ) THEN
    ALTER TABLE regression_suite_cases ADD COLUMN case_label text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'regression_suite_cases' AND column_name = 'is_must_pass'
  ) THEN
    ALTER TABLE regression_suite_cases ADD COLUMN is_must_pass boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'regression_suite_cases' AND column_name = 'notes'
  ) THEN
    ALTER TABLE regression_suite_cases ADD COLUMN notes text;
  END IF;
END $$;

-- ─── Extend regression_suite_runs ────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'regression_suite_runs' AND column_name = 'recommendation'
  ) THEN
    ALTER TABLE regression_suite_runs ADD COLUMN recommendation text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'regression_suite_runs' AND column_name = 'cases_total'
  ) THEN
    ALTER TABLE regression_suite_runs ADD COLUMN cases_total integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'regression_suite_runs' AND column_name = 'cases_passed'
  ) THEN
    ALTER TABLE regression_suite_runs ADD COLUMN cases_passed integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'regression_suite_runs' AND column_name = 'cases_failed_minor'
  ) THEN
    ALTER TABLE regression_suite_runs ADD COLUMN cases_failed_minor integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'regression_suite_runs' AND column_name = 'cases_failed_major'
  ) THEN
    ALTER TABLE regression_suite_runs ADD COLUMN cases_failed_major integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'regression_suite_runs' AND column_name = 'cases_failed_critical'
  ) THEN
    ALTER TABLE regression_suite_runs ADD COLUMN cases_failed_critical integer DEFAULT 0;
  END IF;
END $$;

-- ─── Create regression_suite_case_results ────────────────────────────────────
CREATE TABLE IF NOT EXISTS regression_suite_case_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suite_run_id uuid NOT NULL REFERENCES regression_suite_runs(id) ON DELETE CASCADE,
  suite_case_id uuid NOT NULL REFERENCES regression_suite_cases(id) ON DELETE CASCADE,
  module_key text NOT NULL DEFAULT 'plumbing_parser',
  source_type text NOT NULL DEFAULT '',
  source_id text NOT NULL DEFAULT '',
  expected_json jsonb DEFAULT '{}'::jsonb,
  live_output_json jsonb DEFAULT '{}'::jsonb,
  shadow_output_json jsonb DEFAULT '{}'::jsonb,
  diff_output_json jsonb DEFAULT '{}'::jsonb,
  pass_status text NOT NULL DEFAULT 'pass'
    CHECK (pass_status IN ('pass', 'fail_minor', 'fail_major', 'fail_critical')),
  severity text NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
  failure_reasons_json jsonb DEFAULT '[]'::jsonb,
  metrics_json jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE regression_suite_case_results ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_rscr_suite_run_id
  ON regression_suite_case_results (suite_run_id);

CREATE INDEX IF NOT EXISTS idx_rscr_suite_case_id
  ON regression_suite_case_results (suite_case_id);

CREATE INDEX IF NOT EXISTS idx_rscr_pass_status
  ON regression_suite_case_results (pass_status);

-- Platform admins can read all case results
CREATE POLICY "Platform admins can read regression case results"
  ON regression_suite_case_results FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE platform_admins.user_id = auth.uid()
      AND platform_admins.is_active = true
    )
  );

-- Platform admins can insert case results
CREATE POLICY "Platform admins can insert regression case results"
  ON regression_suite_case_results FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE platform_admins.user_id = auth.uid()
      AND platform_admins.is_active = true
    )
  );

-- Platform admins can update case results
CREATE POLICY "Platform admins can update regression case results"
  ON regression_suite_case_results FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE platform_admins.user_id = auth.uid()
      AND platform_admins.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE platform_admins.user_id = auth.uid()
      AND platform_admins.is_active = true
    )
  );
