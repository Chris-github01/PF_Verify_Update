/*
  # Phase 1 Shadow Intelligence: Benchmark Replay

  Creates the benchmark harness for testing shadow versions against adjudicated quotes.

  ## New Tables
  1. `benchmark_sets` — Named benchmark collections per module
     - name, module_key, description, active
  2. `benchmark_quotes` — Individual quote cases within a benchmark set
     - dataset_id, supplier_name, expected_total, expected_line_count
     - expected_classifications_json, expected_qualifications_json
     - expected_truth_json, tags_json
  3. `benchmark_replay_runs` — Replay execution results
     - benchmark_set_id, module_key, shadow_version
     - total_accuracy, line_accuracy, regression_count, critical_failures
     - pass_status, results_json

  ## Pass Scoring (weighted in code)
  - totals accuracy: 40%
  - line item correctness: 30%
  - failure severity: 20%
  - confidence calibration: 10%

  ## Notes
  - No live pipeline affected
  - Replay results stored separately from shadow_runs
  - Framework ready for future extension
*/

CREATE TABLE IF NOT EXISTS benchmark_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  module_key text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS benchmark_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  benchmark_set_id uuid NOT NULL REFERENCES benchmark_sets(id) ON DELETE CASCADE,
  dataset_id text NOT NULL,
  supplier_name text,
  expected_total numeric(16,2),
  expected_line_count integer,
  expected_classifications_json jsonb NOT NULL DEFAULT '{}',
  expected_qualifications_json jsonb NOT NULL DEFAULT '[]',
  expected_truth_json jsonb NOT NULL DEFAULT '{}',
  tags_json jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS benchmark_replay_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  benchmark_set_id uuid NOT NULL REFERENCES benchmark_sets(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  shadow_version text NOT NULL,
  total_accuracy numeric(5,2),
  line_accuracy numeric(5,2),
  regression_count integer NOT NULL DEFAULT 0,
  critical_failures integer NOT NULL DEFAULT 0,
  pass_status text NOT NULL DEFAULT 'pending' CHECK (pass_status IN ('pending','pass','fail','error')),
  results_json jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_benchmark_sets_module_key ON benchmark_sets(module_key);
CREATE INDEX IF NOT EXISTS idx_benchmark_quotes_set_id ON benchmark_quotes(benchmark_set_id);
CREATE INDEX IF NOT EXISTS idx_benchmark_replay_runs_set_id ON benchmark_replay_runs(benchmark_set_id);
CREATE INDEX IF NOT EXISTS idx_benchmark_replay_runs_module ON benchmark_replay_runs(module_key);

ALTER TABLE benchmark_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE benchmark_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE benchmark_replay_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Benchmark sets readable by authenticated"
  ON benchmark_sets FOR SELECT TO authenticated USING (true);

CREATE POLICY "Benchmark sets insertable by authenticated"
  ON benchmark_sets FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Benchmark sets updatable by authenticated"
  ON benchmark_sets FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Benchmark quotes readable by authenticated"
  ON benchmark_quotes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Benchmark quotes insertable by authenticated"
  ON benchmark_quotes FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Benchmark quotes deletable by authenticated"
  ON benchmark_quotes FOR DELETE TO authenticated USING (true);

CREATE POLICY "Benchmark replay runs readable by authenticated"
  ON benchmark_replay_runs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Benchmark replay runs insertable by authenticated"
  ON benchmark_replay_runs FOR INSERT TO authenticated WITH CHECK (true);
