/*
  # Auto-Adjudication Tables

  Creates the persistence layer for the Auto-Adjudication Mode.

  ## New Tables

  1. `adjudication_decision_runs`
     - One row per auto-adjudication run
     - Stores final outcome, confidence score, recommended supplier, config version, and full result JSON
     - Linked to project, trade, and optional user

  2. `adjudication_supplier_rankings`
     - One row per supplier per run
     - Stores full score breakdown and ranking outcome
     - Linked back to the decision run

  3. `adjudication_decision_reasons`
     - Optional structured reason log for audit traceability
     - Captures recommendation reasons, warnings, block reasons, and manual review reasons

  ## Security
  - RLS enabled on all tables
  - Authenticated users can read runs for projects they are members of
  - Service role has full access for backend writes

  ## Notes
  - All tables support soft audit via created_at timestamps
  - Persistence failures must not block user workflow
*/

CREATE TABLE IF NOT EXISTS adjudication_decision_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  trade text NOT NULL DEFAULT '',
  final_outcome text NOT NULL,
  recommended_supplier_id uuid NULL,
  recommended_supplier_name text NULL,
  cheapest_supplier_id uuid NULL,
  cheapest_supplier_name text NULL,
  recommendation_confidence_score numeric(5,4) NOT NULL DEFAULT 0,
  recommendation_summary text NOT NULL DEFAULT '',
  adjudication_mode text NOT NULL DEFAULT 'auto',
  config_version text NOT NULL DEFAULT 'v1.0.0',
  supplier_count integer NOT NULL DEFAULT 0,
  eligible_supplier_count integer NOT NULL DEFAULT 0,
  result_json jsonb NULL,
  run_by_user_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE adjudication_decision_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view adjudication runs for their projects"
  ON adjudication_decision_runs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organisation_members om
      JOIN projects p ON p.organisation_id = om.organisation_id
      WHERE p.id = adjudication_decision_runs.project_id
        AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can insert adjudication runs"
  ON adjudication_decision_runs FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Service role can update adjudication runs"
  ON adjudication_decision_runs FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS adjudication_supplier_rankings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES adjudication_decision_runs(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL,
  supplier_name text NOT NULL DEFAULT '',
  submitted_total numeric(14,2) NOT NULL DEFAULT 0,
  normalised_total numeric(14,2) NULL,
  gate_status text NOT NULL DEFAULT 'pending',
  overall_score numeric(5,4) NOT NULL DEFAULT 0,
  price_position_score numeric(5,4) NOT NULL DEFAULT 0,
  scope_strength_score numeric(5,4) NOT NULL DEFAULT 0,
  validation_integrity_score numeric(5,4) NOT NULL DEFAULT 0,
  behaviour_trust_score numeric(5,4) NOT NULL DEFAULT 0,
  variation_risk_score numeric(5,4) NOT NULL DEFAULT 0,
  recommendation_eligible boolean NOT NULL DEFAULT false,
  rank_position integer NOT NULL DEFAULT 0,
  ranking_summary text NOT NULL DEFAULT '',
  ranking_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  ranking_warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE adjudication_supplier_rankings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view supplier rankings"
  ON adjudication_supplier_rankings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM adjudication_decision_runs adr
      JOIN organisation_members om ON TRUE
      JOIN projects p ON p.id = adr.project_id AND p.organisation_id = om.organisation_id
      WHERE adr.id = adjudication_supplier_rankings.run_id
        AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can insert supplier rankings"
  ON adjudication_supplier_rankings FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS adjudication_decision_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES adjudication_decision_runs(id) ON DELETE CASCADE,
  reason_type text NOT NULL,
  reason_text text NOT NULL,
  supplier_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE adjudication_decision_reasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view adjudication reasons"
  ON adjudication_decision_reasons FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM adjudication_decision_runs adr
      JOIN organisation_members om ON TRUE
      JOIN projects p ON p.id = adr.project_id AND p.organisation_id = om.organisation_id
      WHERE adr.id = adjudication_decision_reasons.run_id
        AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can insert adjudication reasons"
  ON adjudication_decision_reasons FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_adjudication_runs_project_id ON adjudication_decision_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_adjudication_runs_created_at ON adjudication_decision_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_adjudication_rankings_run_id ON adjudication_supplier_rankings(run_id);
CREATE INDEX IF NOT EXISTS idx_adjudication_reasons_run_id ON adjudication_decision_reasons(run_id);
