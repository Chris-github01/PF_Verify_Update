/*
  # Behaviour Intelligence Database Tables

  ## Summary
  Creates the supplier behaviour persistence layer that tracks commercial patterns
  across multiple tenders. This enables the system to evaluate suppliers not just
  on this tender in isolation, but against their historical commercial behaviour.

  None of these tables modify existing parser or adjudication logic.

  ## New Tables

  ### 1. ci_supplier_behaviour_profiles
  Rolling intelligence profile per supplier per organisation and trade type.
  Recalculated (upserted) each time a new tender analysis runs for this supplier.
  One row per (organisation_id, supplier_name, trade_type).

  ### 2. ci_supplier_behaviour_events
  Append-only event log of commercially significant observations per tender run.
  Examples: low_core_scope_coverage, high_exclusion_density, failed_decision_gate.

  ### 3. ci_supplier_tender_snapshots
  Tender-level intelligence snapshot stored at analysis time. Used for:
  - Auditing decisions
  - Recalculating behaviour profiles
  - Trend analysis over time

  ## Security
  - RLS enabled on all tables
  - Authenticated org members can read/write their organisation's data
*/

CREATE TABLE IF NOT EXISTS ci_supplier_behaviour_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  supplier_name text NOT NULL,
  trade_type text NOT NULL DEFAULT 'general',
  total_tenders_seen integer NOT NULL DEFAULT 0,
  total_wins integer NOT NULL DEFAULT 0,
  avg_core_scope_coverage_pct numeric NOT NULL DEFAULT 0,
  avg_secondary_scope_coverage_pct numeric NOT NULL DEFAULT 0,
  avg_excluded_scope_count numeric NOT NULL DEFAULT 0,
  avg_risk_scope_count numeric NOT NULL DEFAULT 0,
  avg_unknown_scope_count numeric NOT NULL DEFAULT 0,
  avg_variation_exposure_score numeric NOT NULL DEFAULT 0,
  historical_red_flag_count integer NOT NULL DEFAULT 0,
  behaviour_risk_rating text NOT NULL DEFAULT 'unknown'
    CHECK (behaviour_risk_rating IN ('green', 'amber', 'red', 'unknown')),
  confidence_score numeric NOT NULL DEFAULT 0,
  trend_direction text NOT NULL DEFAULT 'stable'
    CHECK (trend_direction IN ('improving', 'stable', 'deteriorating', 'unknown')),
  trend_summary text NOT NULL DEFAULT '',
  last_tender_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, supplier_name, trade_type)
);

ALTER TABLE ci_supplier_behaviour_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read behaviour profiles"
  ON ci_supplier_behaviour_profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = ci_supplier_behaviour_profiles.organisation_id
      AND organisation_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can insert behaviour profiles"
  ON ci_supplier_behaviour_profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = ci_supplier_behaviour_profiles.organisation_id
      AND organisation_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can update behaviour profiles"
  ON ci_supplier_behaviour_profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = ci_supplier_behaviour_profiles.organisation_id
      AND organisation_members.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = ci_supplier_behaviour_profiles.organisation_id
      AND organisation_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can delete behaviour profiles"
  ON ci_supplier_behaviour_profiles FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = ci_supplier_behaviour_profiles.organisation_id
      AND organisation_members.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_ci_behaviour_profiles_org ON ci_supplier_behaviour_profiles(organisation_id);
CREATE INDEX IF NOT EXISTS idx_ci_behaviour_profiles_supplier ON ci_supplier_behaviour_profiles(supplier_name);

-- Behaviour event log

CREATE TABLE IF NOT EXISTS ci_supplier_behaviour_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  supplier_name text NOT NULL,
  trade_type text NOT NULL DEFAULT 'general',
  event_type text NOT NULL,
  event_subtype text,
  event_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  severity text NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'warning', 'critical')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ci_supplier_behaviour_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read behaviour events"
  ON ci_supplier_behaviour_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = ci_supplier_behaviour_events.organisation_id
      AND organisation_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can insert behaviour events"
  ON ci_supplier_behaviour_events FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = ci_supplier_behaviour_events.organisation_id
      AND organisation_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can update behaviour events"
  ON ci_supplier_behaviour_events FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = ci_supplier_behaviour_events.organisation_id
      AND organisation_members.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = ci_supplier_behaviour_events.organisation_id
      AND organisation_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can delete behaviour events"
  ON ci_supplier_behaviour_events FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = ci_supplier_behaviour_events.organisation_id
      AND organisation_members.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_ci_behaviour_events_org ON ci_supplier_behaviour_events(organisation_id);
CREATE INDEX IF NOT EXISTS idx_ci_behaviour_events_project ON ci_supplier_behaviour_events(project_id);
CREATE INDEX IF NOT EXISTS idx_ci_behaviour_events_supplier ON ci_supplier_behaviour_events(supplier_name);

-- Tender-level intelligence snapshots

CREATE TABLE IF NOT EXISTS ci_supplier_tender_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL,
  supplier_name text NOT NULL,
  trade_type text NOT NULL DEFAULT 'general',
  submitted_total numeric,
  normalised_total numeric,
  core_scope_coverage_pct numeric NOT NULL DEFAULT 0,
  secondary_scope_coverage_pct numeric NOT NULL DEFAULT 0,
  excluded_scope_count integer NOT NULL DEFAULT 0,
  risk_scope_count integer NOT NULL DEFAULT 0,
  unknown_scope_count integer NOT NULL DEFAULT 0,
  scope_confidence_score numeric NOT NULL DEFAULT 0,
  likely_variation_exposure_score numeric NOT NULL DEFAULT 0,
  decision_gate_status text NOT NULL DEFAULT 'pending'
    CHECK (decision_gate_status IN ('pass', 'warn', 'fail', 'pending')),
  gate_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  was_recommended boolean NOT NULL DEFAULT false,
  was_lowest_price boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ci_supplier_tender_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read tender snapshots"
  ON ci_supplier_tender_snapshots FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = ci_supplier_tender_snapshots.organisation_id
      AND organisation_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can insert tender snapshots"
  ON ci_supplier_tender_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = ci_supplier_tender_snapshots.organisation_id
      AND organisation_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can update tender snapshots"
  ON ci_supplier_tender_snapshots FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = ci_supplier_tender_snapshots.organisation_id
      AND organisation_members.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = ci_supplier_tender_snapshots.organisation_id
      AND organisation_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can delete tender snapshots"
  ON ci_supplier_tender_snapshots FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = ci_supplier_tender_snapshots.organisation_id
      AND organisation_members.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_ci_tender_snapshots_org ON ci_supplier_tender_snapshots(organisation_id);
CREATE INDEX IF NOT EXISTS idx_ci_tender_snapshots_project ON ci_supplier_tender_snapshots(project_id);

-- Decision gate results table

CREATE TABLE IF NOT EXISTS ci_decision_gate_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL,
  supplier_name text NOT NULL,
  gate_status text NOT NULL DEFAULT 'pending'
    CHECK (gate_status IN ('pass', 'warn', 'fail', 'pending')),
  gate_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  gate_summary text NOT NULL DEFAULT '',
  can_be_recommended boolean NOT NULL DEFAULT false,
  can_be_best_tenderer boolean NOT NULL DEFAULT false,
  override_required boolean NOT NULL DEFAULT false,
  override_applied boolean NOT NULL DEFAULT false,
  override_reason text,
  override_by uuid REFERENCES auth.users(id),
  override_at timestamptz,
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ci_decision_gate_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read gate results"
  ON ci_decision_gate_results FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = ci_decision_gate_results.organisation_id
      AND organisation_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can insert gate results"
  ON ci_decision_gate_results FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = ci_decision_gate_results.organisation_id
      AND organisation_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can update gate results"
  ON ci_decision_gate_results FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = ci_decision_gate_results.organisation_id
      AND organisation_members.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = ci_decision_gate_results.organisation_id
      AND organisation_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can delete gate results"
  ON ci_decision_gate_results FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = ci_decision_gate_results.organisation_id
      AND organisation_members.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_ci_gate_results_project ON ci_decision_gate_results(project_id);
CREATE INDEX IF NOT EXISTS idx_ci_gate_results_quote ON ci_decision_gate_results(quote_id);
