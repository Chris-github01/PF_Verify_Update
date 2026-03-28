/*
  # CDE Tender Decision Engine - Database Tables

  Creates 5 tables for the Comparative Decision Engine (CDE), a platform-admin
  shadow module for structured tender decision analysis.

  Tables: cde_supplier_profiles, cde_behaviour_analysis, cde_variation_exposure,
          cde_cost_projections, cde_decision_snapshots

  Security: RLS enabled, platform admins only.
*/

CREATE TABLE IF NOT EXISTS cde_supplier_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  supplier_name text NOT NULL,
  quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL,
  quoted_total numeric(18,2) DEFAULT 0,
  item_count integer DEFAULT 0,
  scope_coverage_pct numeric(5,2) DEFAULT 0,
  historical_variation_rate numeric(5,4) DEFAULT 0,
  late_delivery_count integer DEFAULT 0,
  rfi_response_score numeric(3,2) DEFAULT 0,
  programme_risk_score numeric(3,2) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE cde_supplier_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can select cde_supplier_profiles"
  ON cde_supplier_profiles FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));

CREATE POLICY "Platform admins can insert cde_supplier_profiles"
  ON cde_supplier_profiles FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));

CREATE POLICY "Platform admins can update cde_supplier_profiles"
  ON cde_supplier_profiles FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));

CREATE INDEX IF NOT EXISTS idx_cde_supplier_profiles_project ON cde_supplier_profiles(project_id);

CREATE TABLE IF NOT EXISTS cde_behaviour_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  supplier_name text NOT NULL,
  risk_tier text NOT NULL DEFAULT 'medium' CHECK (risk_tier IN ('low', 'medium', 'high', 'critical')),
  behaviour_class text NOT NULL DEFAULT 'standard',
  confidence_score numeric(3,2) DEFAULT 0.5,
  flags jsonb DEFAULT '[]',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE cde_behaviour_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can select cde_behaviour_analysis"
  ON cde_behaviour_analysis FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));

CREATE POLICY "Platform admins can insert cde_behaviour_analysis"
  ON cde_behaviour_analysis FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));

CREATE INDEX IF NOT EXISTS idx_cde_behaviour_project ON cde_behaviour_analysis(project_id);

CREATE TABLE IF NOT EXISTS cde_variation_exposure (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  supplier_name text NOT NULL,
  exposure_amount numeric(18,2) DEFAULT 0,
  exposure_pct numeric(5,2) DEFAULT 0,
  likelihood_score numeric(3,2) DEFAULT 0.5,
  category_breakdown jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE cde_variation_exposure ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can select cde_variation_exposure"
  ON cde_variation_exposure FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));

CREATE POLICY "Platform admins can insert cde_variation_exposure"
  ON cde_variation_exposure FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));

CREATE INDEX IF NOT EXISTS idx_cde_variation_project ON cde_variation_exposure(project_id);

CREATE TABLE IF NOT EXISTS cde_cost_projections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  supplier_name text NOT NULL,
  quoted_total numeric(18,2) DEFAULT 0,
  projected_total numeric(18,2) DEFAULT 0,
  contingency_applied numeric(18,2) DEFAULT 0,
  risk_premium numeric(18,2) DEFAULT 0,
  confidence_band_low numeric(18,2) DEFAULT 0,
  confidence_band_high numeric(18,2) DEFAULT 0,
  projection_basis text DEFAULT 'historical',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE cde_cost_projections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can select cde_cost_projections"
  ON cde_cost_projections FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));

CREATE POLICY "Platform admins can insert cde_cost_projections"
  ON cde_cost_projections FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));

CREATE INDEX IF NOT EXISTS idx_cde_cost_project ON cde_cost_projections(project_id);

CREATE TABLE IF NOT EXISTS cde_decision_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  run_id text NOT NULL,
  recommended_supplier text,
  runner_up_supplier text,
  decision_basis text DEFAULT 'weighted_score',
  overall_confidence numeric(3,2) DEFAULT 0,
  ranked_suppliers jsonb DEFAULT '[]',
  decision_state jsonb DEFAULT '{}',
  justification text DEFAULT '',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE cde_decision_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can select cde_decision_snapshots"
  ON cde_decision_snapshots FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));

CREATE POLICY "Platform admins can insert cde_decision_snapshots"
  ON cde_decision_snapshots FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));

CREATE UNIQUE INDEX IF NOT EXISTS idx_cde_decision_run_id ON cde_decision_snapshots(run_id);
CREATE INDEX IF NOT EXISTS idx_cde_decision_project ON cde_decision_snapshots(project_id);
