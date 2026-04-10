/*
  # Dev Shadow Tables for VerifyTrade Next

  ## Purpose
  Isolated logging tables for the VerifyTrade Next development fork.
  Named with "dev_" prefix to avoid conflict with any existing shadow_runs table.

  ## New Tables

  ### dev_shadow_runs
  Records each shadow execution triggered by the VerifyTrade Next dev system.
  - `id` - UUID primary key
  - `run_type` - Type of analysis run (e.g. 'quote_intelligence')
  - `reference_id` - Optional external reference (nullable)
  - `input_payload` - Full input data as JSONB
  - `output_payload` - Analysis result as JSONB (nullable until complete)
  - `status` - 'running' | 'completed' | 'failed'
  - `error_message` - Error details on failure (nullable)
  - `duration_ms` - Execution time in milliseconds (nullable)
  - `created_at` - Timestamp

  ### dev_shadow_results
  Stores final analysed results linked to a dev_shadow_run.
  - `id` - UUID primary key
  - `shadow_run_id` - FK to dev_shadow_runs.id
  - `run_type` - Denormalised run type for querying
  - `reference_id` - Optional external reference (nullable)
  - `result` - Full result payload as JSONB
  - `created_at` - Timestamp

  ## Security
  - RLS enabled on both tables
  - Authenticated users can insert and read
  - No public access

  ## Notes
  - Completely isolated from production tables
  - The "dev_" prefix makes clear these are development-only
*/

CREATE TABLE IF NOT EXISTS dev_shadow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type text NOT NULL,
  reference_id text,
  input_payload jsonb NOT NULL DEFAULT '{}',
  output_payload jsonb,
  status text NOT NULL DEFAULT 'running',
  error_message text,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dev_shadow_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert dev shadow runs"
  ON dev_shadow_runs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read dev shadow runs"
  ON dev_shadow_runs
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update dev shadow runs"
  ON dev_shadow_runs
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS dev_shadow_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shadow_run_id uuid REFERENCES dev_shadow_runs(id) ON DELETE CASCADE,
  run_type text NOT NULL,
  reference_id text,
  result jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dev_shadow_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert dev shadow results"
  ON dev_shadow_results
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read dev shadow results"
  ON dev_shadow_results
  FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_dev_shadow_runs_run_type ON dev_shadow_runs(run_type);
CREATE INDEX IF NOT EXISTS idx_dev_shadow_runs_created_at ON dev_shadow_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dev_shadow_results_run_id ON dev_shadow_results(shadow_run_id);
CREATE INDEX IF NOT EXISTS idx_dev_shadow_results_run_type ON dev_shadow_results(run_type);
