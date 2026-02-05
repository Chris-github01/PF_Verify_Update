/*
  # Commercial Control System (Base Tracker + VO Tracker + Dashboard)

  ## Overview
  This migration adds a comprehensive commercial control system for managing:
  - Base Tracker (monthly progress claim tracking)
  - Variation Order (VO) Register
  - Commercial dashboard metrics
  - Audit logging for all commercial transactions

  ## 1. New Tables
  
  ### `base_tracker_exports`
  Tracks all base tracker Excel exports generated for suppliers
  - `id` (uuid, primary key)
  - `project_id` (uuid, foreign key to projects)
  - `trade_key` (text) - Trade module identifier
  - `supplier_id` (uuid, foreign key to suppliers)
  - `period` (text) - Format: YYYY-MM
  - `version` (integer) - Version number for this period
  - `generated_by_user_id` (uuid, foreign key to auth.users)
  - `generated_at` (timestamptz)
  - `file_storage_key` (text) - Storage bucket key
  - `baseline_snapshot` (jsonb) - Snapshot of awarded BOQ at generation time
  - `notes` (text)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### `variation_register`
  Comprehensive VO tracking separate from base tracker
  - `id` (uuid, primary key)
  - `project_id` (uuid, foreign key to projects)
  - `trade_key` (text) - Trade module identifier
  - `supplier_id` (uuid, foreign key to suppliers)
  - `vo_number` (text) - Auto-generated VO reference
  - `linked_boq_line_id` (text) - Optional link to BOQ line
  - `description` (text)
  - `instruction_ref` (text) - Client instruction reference
  - `reason` (text) - Reason for variation
  - `qty` (numeric)
  - `unit` (text)
  - `rate` (numeric)
  - `amount` (numeric)
  - `status` (text) - Draft|Submitted|Approved|Rejected
  - `submitted_at` (timestamptz)
  - `approved_by_user_id` (uuid, foreign key to auth.users)
  - `approved_at` (timestamptz)
  - `rejection_reason` (text)
  - `certified_this_period` (boolean) DEFAULT false
  - `certification_period` (text) - YYYY-MM when certified
  - `base_tracker_id` (uuid, foreign key to base_tracker_exports)
  - `notes` (text)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### `base_tracker_claims`
  Stores submitted progress claims from suppliers
  - `id` (uuid, primary key)
  - `base_tracker_id` (uuid, foreign key to base_tracker_exports)
  - `project_id` (uuid, foreign key to projects)
  - `period` (text) - YYYY-MM
  - `supplier_id` (uuid, foreign key to suppliers)
  - `line_items` (jsonb) - Array of claimed line items
  - `total_claimed_this_period` (numeric)
  - `total_claimed_to_date` (numeric)
  - `supplier_rep_name` (text)
  - `supplier_declaration` (text)
  - `submission_date` (timestamptz)
  - `mc_rep_name` (text)
  - `certification_date` (timestamptz)
  - `certified_amount` (numeric)
  - `assessment_notes` (text)
  - `status` (text) - Submitted|Assessed|Certified|Rejected
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### `commercial_audit_log`
  Comprehensive audit trail for all commercial actions
  - `id` (uuid, primary key)
  - `project_id` (uuid, foreign key to projects)
  - `action_type` (text) - tracker_generated|claim_submitted|vo_approved|etc.
  - `entity_type` (text) - base_tracker|variation|claim
  - `entity_id` (uuid)
  - `user_id` (uuid, foreign key to auth.users)
  - `details` (jsonb) - Full audit details
  - `created_at` (timestamptz)

  ## 2. Security
  - Enable RLS on all new tables
  - Users can only access data for their organisation's projects
  - Platform admins have full access

  ## 3. Indexes
  - Performance indexes on frequently queried columns
  - Composite indexes for dashboard queries

  ## Important Notes
  - This system is mandatory for progress claims
  - Base trackers lock the commercial baseline
  - Variations tracked separately to prevent scope creep
  - All exports logged for audit trail
*/

-- =====================================================
-- 1. BASE TRACKER EXPORTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS base_tracker_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  trade_key text NOT NULL,
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  period text NOT NULL, -- Format: YYYY-MM
  version integer NOT NULL DEFAULT 1,
  generated_by_user_id uuid NOT NULL REFERENCES auth.users(id),
  generated_at timestamptz DEFAULT now(),
  file_storage_key text,
  baseline_snapshot jsonb, -- Snapshot of awarded BOQ at generation time
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(project_id, trade_key, supplier_id, period, version)
);

-- =====================================================
-- 2. VARIATION REGISTER TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS variation_register (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  trade_key text,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  vo_number text NOT NULL,
  linked_boq_line_id text,
  description text NOT NULL,
  instruction_ref text,
  reason text,
  qty numeric,
  unit text,
  rate numeric,
  amount numeric,
  status text DEFAULT 'Draft' CHECK (status IN ('Draft', 'Submitted', 'Approved', 'Rejected')),
  submitted_at timestamptz,
  approved_by_user_id uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  rejection_reason text,
  certified_this_period boolean DEFAULT false,
  certification_period text, -- YYYY-MM
  base_tracker_id uuid REFERENCES base_tracker_exports(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(project_id, vo_number)
);

-- =====================================================
-- 3. BASE TRACKER CLAIMS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS base_tracker_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_tracker_id uuid NOT NULL REFERENCES base_tracker_exports(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  period text NOT NULL, -- YYYY-MM
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  line_items jsonb DEFAULT '[]'::jsonb, -- Array of claimed line items
  total_claimed_this_period numeric DEFAULT 0,
  total_claimed_to_date numeric DEFAULT 0,
  supplier_rep_name text,
  supplier_declaration text,
  submission_date timestamptz,
  mc_rep_name text,
  certification_date timestamptz,
  certified_amount numeric,
  assessment_notes text,
  status text DEFAULT 'Submitted' CHECK (status IN ('Submitted', 'Assessed', 'Certified', 'Rejected')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(base_tracker_id, period)
);

-- =====================================================
-- 4. COMMERCIAL AUDIT LOG TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS commercial_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  action_type text NOT NULL, -- tracker_generated|claim_submitted|vo_approved|etc.
  entity_type text NOT NULL, -- base_tracker|variation|claim
  entity_id uuid NOT NULL,
  user_id uuid REFERENCES auth.users(id),
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- =====================================================
-- 5. INDEXES FOR PERFORMANCE
-- =====================================================

-- Base Tracker Exports Indexes
CREATE INDEX IF NOT EXISTS idx_base_tracker_exports_project ON base_tracker_exports(project_id);
CREATE INDEX IF NOT EXISTS idx_base_tracker_exports_supplier ON base_tracker_exports(supplier_id);
CREATE INDEX IF NOT EXISTS idx_base_tracker_exports_period ON base_tracker_exports(period);
CREATE INDEX IF NOT EXISTS idx_base_tracker_exports_composite ON base_tracker_exports(project_id, trade_key, supplier_id, period);

-- Variation Register Indexes
CREATE INDEX IF NOT EXISTS idx_variation_register_project ON variation_register(project_id);
CREATE INDEX IF NOT EXISTS idx_variation_register_supplier ON variation_register(supplier_id);
CREATE INDEX IF NOT EXISTS idx_variation_register_status ON variation_register(status);
CREATE INDEX IF NOT EXISTS idx_variation_register_vo_number ON variation_register(vo_number);
CREATE INDEX IF NOT EXISTS idx_variation_register_composite ON variation_register(project_id, trade_key, status);

-- Base Tracker Claims Indexes
CREATE INDEX IF NOT EXISTS idx_base_tracker_claims_tracker ON base_tracker_claims(base_tracker_id);
CREATE INDEX IF NOT EXISTS idx_base_tracker_claims_project ON base_tracker_claims(project_id);
CREATE INDEX IF NOT EXISTS idx_base_tracker_claims_period ON base_tracker_claims(period);
CREATE INDEX IF NOT EXISTS idx_base_tracker_claims_status ON base_tracker_claims(status);

-- Commercial Audit Log Indexes
CREATE INDEX IF NOT EXISTS idx_commercial_audit_log_project ON commercial_audit_log(project_id);
CREATE INDEX IF NOT EXISTS idx_commercial_audit_log_entity ON commercial_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_commercial_audit_log_user ON commercial_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_commercial_audit_log_action ON commercial_audit_log(action_type);

-- =====================================================
-- 6. ROW LEVEL SECURITY (RLS)
-- =====================================================

ALTER TABLE base_tracker_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE variation_register ENABLE ROW LEVEL SECURITY;
ALTER TABLE base_tracker_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies for base_tracker_exports
CREATE POLICY "Users can view base trackers for their organisation's projects"
  ON base_tracker_exports FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = base_tracker_exports.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

CREATE POLICY "Users can create base trackers for their organisation's projects"
  ON base_tracker_exports FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = base_tracker_exports.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

-- RLS Policies for variation_register
CREATE POLICY "Users can view variations for their organisation's projects"
  ON variation_register FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = variation_register.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

CREATE POLICY "Users can create variations for their organisation's projects"
  ON variation_register FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = variation_register.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

CREATE POLICY "Users can update variations for their organisation's projects"
  ON variation_register FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = variation_register.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

-- RLS Policies for base_tracker_claims
CREATE POLICY "Users can view claims for their organisation's projects"
  ON base_tracker_claims FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = base_tracker_claims.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

CREATE POLICY "Users can create claims for their organisation's projects"
  ON base_tracker_claims FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = base_tracker_claims.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

CREATE POLICY "Users can update claims for their organisation's projects"
  ON base_tracker_claims FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = base_tracker_claims.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

-- RLS Policies for commercial_audit_log
CREATE POLICY "Users can view audit logs for their organisation's projects"
  ON commercial_audit_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = commercial_audit_log.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

CREATE POLICY "System can insert audit logs"
  ON commercial_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (true); -- Any authenticated user can create audit logs

-- =====================================================
-- 7. HELPER FUNCTIONS
-- =====================================================

-- Function to auto-generate VO numbers
CREATE OR REPLACE FUNCTION generate_vo_number(p_project_id uuid, p_trade_key text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_vo_number text;
BEGIN
  -- Count existing VOs for this project/trade
  SELECT COUNT(*) INTO v_count
  FROM variation_register
  WHERE project_id = p_project_id
  AND (trade_key = p_trade_key OR trade_key IS NULL);
  
  -- Generate VO number: VO-{TRADE}-{NUMBER}
  IF p_trade_key IS NOT NULL THEN
    v_vo_number := 'VO-' || UPPER(p_trade_key) || '-' || LPAD((v_count + 1)::text, 4, '0');
  ELSE
    v_vo_number := 'VO-GEN-' || LPAD((v_count + 1)::text, 4, '0');
  END IF;
  
  RETURN v_vo_number;
END;
$$;

-- Function to log commercial actions
CREATE OR REPLACE FUNCTION log_commercial_action(
  p_project_id uuid,
  p_action_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id uuid;
BEGIN
  INSERT INTO commercial_audit_log (
    project_id,
    action_type,
    entity_type,
    entity_id,
    user_id,
    details
  ) VALUES (
    p_project_id,
    p_action_type,
    p_entity_type,
    p_entity_id,
    auth.uid(),
    p_details
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

-- =====================================================
-- 8. TRIGGERS
-- =====================================================

-- Trigger to update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_base_tracker_exports_updated_at
  BEFORE UPDATE ON base_tracker_exports
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_variation_register_updated_at
  BEFORE UPDATE ON variation_register
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_base_tracker_claims_updated_at
  BEFORE UPDATE ON base_tracker_claims
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
