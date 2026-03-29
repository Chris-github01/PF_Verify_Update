/*
  # Add Variation Risk Predictor Tables

  ## Summary
  Creates the persistence layer for the Variation Risk Predictor intelligence module.
  This stores auditable prediction runs, per-supplier results, and detailed driver events.

  ## New Tables

  ### variation_risk_runs
  - One row per prediction run
  - Stores full result_json, config version, project/trade context, and summary metadata
  - Enables historical comparison and audit

  ### variation_risk_supplier_results
  - One row per supplier per run
  - Stores risk scores, exposure percentages, risk-adjusted values, confidence, data quality
  - Enables cross-run supplier tracking

  ### variation_risk_driver_events
  - One row per risk driver per supplier per run
  - Enables granular audit of which drivers contributed most to each prediction

  ## Security
  - RLS enabled on all three tables
  - Users can only read/write runs for projects they belong to via organisation_members
  - Service role bypass for backend writes
*/

CREATE TABLE IF NOT EXISTS variation_risk_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id),
  trade text NOT NULL DEFAULT '',
  config_version text NOT NULL DEFAULT 'v1.0.0',
  overall_data_quality text NOT NULL DEFAULT 'partial'
    CHECK (overall_data_quality IN ('sufficient', 'partial', 'insufficient')),
  recommendation_changed boolean NOT NULL DEFAULT false,
  cheapest_submitted_supplier text NOT NULL DEFAULT '',
  cheapest_risk_adjusted_supplier text NOT NULL DEFAULT '',
  executive_summary text NOT NULL DEFAULT '',
  result_json jsonb NOT NULL DEFAULT '{}',
  generated_at timestamptz NOT NULL DEFAULT now(),
  run_by_user_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS variation_risk_supplier_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES variation_risk_runs(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id),
  supplier_id text NOT NULL DEFAULT '',
  supplier_name text NOT NULL DEFAULT '',
  submitted_total numeric NOT NULL DEFAULT 0,
  normalised_total numeric,
  variation_risk_score numeric NOT NULL DEFAULT 0,
  variation_risk_level text NOT NULL DEFAULT 'moderate'
    CHECK (variation_risk_level IN ('low', 'moderate', 'high', 'critical')),
  predicted_exposure_percent numeric NOT NULL DEFAULT 0,
  predicted_exposure_value numeric NOT NULL DEFAULT 0,
  risk_adjusted_tender_value numeric NOT NULL DEFAULT 0,
  confidence_score numeric NOT NULL DEFAULT 0,
  data_quality text NOT NULL DEFAULT 'partial'
    CHECK (data_quality IN ('sufficient', 'partial', 'insufficient')),
  submitted_rank integer NOT NULL DEFAULT 0,
  risk_adjusted_rank integer NOT NULL DEFAULT 0,
  rank_changed boolean NOT NULL DEFAULT false,
  risk_summary text NOT NULL DEFAULT '',
  driver_summary text NOT NULL DEFAULT '',
  exposure_summary text NOT NULL DEFAULT '',
  adjusted_position_summary text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS variation_risk_driver_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES variation_risk_runs(id) ON DELETE CASCADE,
  supplier_id text NOT NULL DEFAULT '',
  supplier_name text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  score numeric NOT NULL DEFAULT 0,
  weight numeric NOT NULL DEFAULT 0,
  weighted_contribution numeric NOT NULL DEFAULT 0,
  severity text NOT NULL DEFAULT 'low'
    CHECK (severity IN ('minimal', 'low', 'moderate', 'high', 'critical')),
  reason text NOT NULL DEFAULT '',
  confidence_contribution numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_variation_risk_runs_project_id
  ON variation_risk_runs (project_id);
CREATE INDEX IF NOT EXISTS idx_variation_risk_runs_trade
  ON variation_risk_runs (trade);
CREATE INDEX IF NOT EXISTS idx_variation_risk_runs_generated_at
  ON variation_risk_runs (generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_variation_risk_supplier_results_run_id
  ON variation_risk_supplier_results (run_id);
CREATE INDEX IF NOT EXISTS idx_variation_risk_supplier_results_project_id
  ON variation_risk_supplier_results (project_id);

CREATE INDEX IF NOT EXISTS idx_variation_risk_driver_events_run_id
  ON variation_risk_driver_events (run_id);

ALTER TABLE variation_risk_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE variation_risk_supplier_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE variation_risk_driver_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view variation risk runs for their projects"
  ON variation_risk_runs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = variation_risk_runs.project_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

CREATE POLICY "Users can insert variation risk runs for their projects"
  ON variation_risk_runs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = project_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

CREATE POLICY "Service role can manage variation risk runs"
  ON variation_risk_runs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can view variation risk supplier results for their projects"
  ON variation_risk_supplier_results FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = variation_risk_supplier_results.project_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

CREATE POLICY "Users can insert variation risk supplier results for their projects"
  ON variation_risk_supplier_results FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = project_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

CREATE POLICY "Service role can manage variation risk supplier results"
  ON variation_risk_supplier_results FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can view variation risk driver events"
  ON variation_risk_driver_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM variation_risk_runs vrr
      JOIN projects p ON p.id = vrr.project_id
      JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE vrr.id = variation_risk_driver_events.run_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

CREATE POLICY "Users can insert variation risk driver events"
  ON variation_risk_driver_events FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM variation_risk_runs vrr
      JOIN projects p ON p.id = vrr.project_id
      JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE vrr.id = run_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

CREATE POLICY "Service role can manage variation risk driver events"
  ON variation_risk_driver_events FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
