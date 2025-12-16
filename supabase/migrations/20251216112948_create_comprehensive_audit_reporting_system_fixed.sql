/*
  # Create Comprehensive Multi-Tenant Audit & Reporting System
  
  1. New Tables Created
    - suppliers: Supplier master data per organisation
    - audits: Audit records with risk scores and recommendations
    - audit_findings: Individual findings per audit (gaps, compliance issues, etc.)
    - audit_exports: Generated export files (PDF/Excel)
    - audit_events: Immutable ledger of all system events
    - system_config: Admin-configurable settings for calculations
  
  2. Extended Tables
    - quotes: Added audit-relevant fields (source_type, parse_status, etc.)
    - quote_items: Added normalized fields for matching and confidence
  
  3. Security
    - Enable RLS on all new tables
    - Add tenant-scoped policies for multi-tenancy
    - Add role-based access control
  
  4. Indexes
    - Add performance indexes for reporting queries
    - Add composite indexes for common filter combinations
*/

-- ============================================================================
-- 1. CREATE SUPPLIERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name text NOT NULL,
  contact_email text,
  contact_phone text,
  address text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_org_id ON suppliers(organisation_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view suppliers in their org"
  ON suppliers FOR SELECT
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members 
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Platform admins can view all suppliers"
  ON suppliers FOR SELECT
  TO authenticated
  USING (is_platform_admin());

CREATE POLICY "Org admins can manage suppliers"
  ON suppliers FOR ALL
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin') AND status = 'active'
    )
  );

-- ============================================================================
-- 2. EXTEND QUOTES TABLE WITH AUDIT FIELDS
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quotes' AND column_name = 'supplier_id'
  ) THEN
    ALTER TABLE quotes ADD COLUMN supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL;
    CREATE INDEX idx_quotes_supplier_id ON quotes(supplier_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quotes' AND column_name = 'source_type'
  ) THEN
    ALTER TABLE quotes ADD COLUMN source_type text CHECK (source_type IN ('pdf', 'excel', 'manual'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quotes' AND column_name = 'original_filename'
  ) THEN
    ALTER TABLE quotes ADD COLUMN original_filename text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quotes' AND column_name = 'currency'
  ) THEN
    ALTER TABLE quotes ADD COLUMN currency text DEFAULT 'NZD';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quotes' AND column_name = 'uploaded_by_user_id'
  ) THEN
    ALTER TABLE quotes ADD COLUMN uploaded_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quotes' AND column_name = 'uploaded_at'
  ) THEN
    ALTER TABLE quotes ADD COLUMN uploaded_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quotes' AND column_name = 'parsed_at'
  ) THEN
    ALTER TABLE quotes ADD COLUMN parsed_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quotes' AND column_name = 'parse_status'
  ) THEN
    ALTER TABLE quotes ADD COLUMN parse_status text DEFAULT 'pending' CHECK (parse_status IN ('pending', 'processing', 'success', 'failed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quotes' AND column_name = 'parse_error'
  ) THEN
    ALTER TABLE quotes ADD COLUMN parse_error text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quotes' AND column_name = 'line_item_count'
  ) THEN
    ALTER TABLE quotes ADD COLUMN line_item_count integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quotes' AND column_name = 'module'
  ) THEN
    ALTER TABLE quotes ADD COLUMN module text DEFAULT 'passivefire';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quotes' AND column_name = 'version'
  ) THEN
    ALTER TABLE quotes ADD COLUMN version text DEFAULT '1.0';
  END IF;
END $$;

-- ============================================================================
-- 3. EXTEND QUOTE_ITEMS TABLE WITH NORMALIZED FIELDS
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quote_items' AND column_name = 'normalized_item_key'
  ) THEN
    ALTER TABLE quote_items ADD COLUMN normalized_item_key text;
    CREATE INDEX idx_quote_items_normalized_key ON quote_items(normalized_item_key);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quote_items' AND column_name = 'manufacturer_detected'
  ) THEN
    ALTER TABLE quote_items ADD COLUMN manufacturer_detected text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quote_items' AND column_name = 'system_detected'
  ) THEN
    ALTER TABLE quote_items ADD COLUMN system_detected text;
  END IF;

  CREATE INDEX IF NOT EXISTS idx_quote_items_confidence ON quote_items(confidence);
END $$;

-- ============================================================================
-- 4. CREATE AUDITS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  module text NOT NULL DEFAULT 'passivefire',
  audit_status text NOT NULL DEFAULT 'draft' CHECK (audit_status IN ('draft', 'in_progress', 'complete')),
  audited_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  audited_at timestamptz,
  duration_seconds integer,
  overall_risk_score_0_100 numeric(5,2),
  coverage_score_0_100 numeric(5,2),
  gaps_count integer DEFAULT 0,
  exclusions_count integer DEFAULT 0,
  compliance_flags_count integer DEFAULT 0,
  recommended_supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  recommendation_confidence numeric(5,2),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audits_org_id ON audits(organisation_id);
CREATE INDEX IF NOT EXISTS idx_audits_project_id ON audits(project_id);
CREATE INDEX IF NOT EXISTS idx_audits_status ON audits(audit_status);
CREATE INDEX IF NOT EXISTS idx_audits_created_at ON audits(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audits_risk_score ON audits(overall_risk_score_0_100);

ALTER TABLE audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view audits in their org"
  ON audits FOR SELECT
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members 
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Platform admins can view all audits"
  ON audits FOR SELECT
  TO authenticated
  USING (is_platform_admin());

CREATE POLICY "Org members can create audits"
  ON audits FOR INSERT
  TO authenticated
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member') AND status = 'active'
    )
  );

CREATE POLICY "Org admins can update audits"
  ON audits FOR UPDATE
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin') AND status = 'active'
    )
  );

-- ============================================================================
-- 5. CREATE AUDIT_FINDINGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('gap', 'exclusion', 'compliance', 'pricing_outlier', 'missing_system', 'scope_variance', 'quality_concern')),
  severity text NOT NULL CHECK (severity IN ('low', 'med', 'high', 'critical')),
  normalized_item_key text,
  title text NOT NULL,
  detail text,
  evidence_refs jsonb,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  estimated_cost_impact numeric,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_findings_audit_id ON audit_findings(audit_id);
CREATE INDEX IF NOT EXISTS idx_audit_findings_type ON audit_findings(type);
CREATE INDEX IF NOT EXISTS idx_audit_findings_severity ON audit_findings(severity);
CREATE INDEX IF NOT EXISTS idx_audit_findings_supplier_id ON audit_findings(supplier_id);

ALTER TABLE audit_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view findings for their org audits"
  ON audit_findings FOR SELECT
  TO authenticated
  USING (
    audit_id IN (
      SELECT id FROM audits 
      WHERE organisation_id IN (
        SELECT organisation_id FROM organisation_members 
        WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  );

CREATE POLICY "Platform admins can view all findings"
  ON audit_findings FOR SELECT
  TO authenticated
  USING (is_platform_admin());

CREATE POLICY "Org members can create findings"
  ON audit_findings FOR INSERT
  TO authenticated
  WITH CHECK (
    audit_id IN (
      SELECT id FROM audits 
      WHERE organisation_id IN (
        SELECT organisation_id FROM organisation_members 
        WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member') AND status = 'active'
      )
    )
  );

-- ============================================================================
-- 6. CREATE AUDIT_EXPORTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  export_type text NOT NULL CHECK (export_type IN ('pdf', 'excel', 'csv')),
  export_url text,
  file_size_bytes bigint,
  generated_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  generated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_exports_audit_id ON audit_exports(audit_id);
CREATE INDEX IF NOT EXISTS idx_audit_exports_generated_at ON audit_exports(generated_at DESC);

ALTER TABLE audit_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view exports for their org audits"
  ON audit_exports FOR SELECT
  TO authenticated
  USING (
    audit_id IN (
      SELECT id FROM audits 
      WHERE organisation_id IN (
        SELECT organisation_id FROM organisation_members 
        WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  );

CREATE POLICY "Platform admins can view all exports"
  ON audit_exports FOR SELECT
  TO authenticated
  USING (is_platform_admin());

-- ============================================================================
-- 7. CREATE AUDIT_EVENTS TABLE (IMMUTABLE LEDGER)
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('quote', 'audit', 'export', 'org', 'project', 'supplier', 'user')),
  entity_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('created', 'parsed', 'scored', 'recommended', 'exported', 'updated', 'deleted', 'approved', 'rejected')),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata_json jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_org_id ON audit_events(organisation_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON audit_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON audit_events(actor_user_id);

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view events for their org"
  ON audit_events FOR SELECT
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members 
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Platform admins can view all events"
  ON audit_events FOR SELECT
  TO authenticated
  USING (is_platform_admin());

CREATE POLICY "System can insert events"
  ON audit_events FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "No updates allowed on audit_events"
  ON audit_events FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY "No deletes allowed on audit_events"
  ON audit_events FOR DELETE
  TO authenticated
  USING (false);

-- ============================================================================
-- 8. CREATE SYSTEM_CONFIG TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL,
  description text,
  updated_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_config_key ON system_config(key);

ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can manage system config"
  ON system_config FOR ALL
  TO authenticated
  USING (is_platform_admin());

CREATE POLICY "All users can view system config"
  ON system_config FOR SELECT
  TO authenticated
  USING (true);

-- Insert default configuration values
INSERT INTO system_config (key, value, description) VALUES
  ('manual_review_hours_per_quote', '"2.5"'::jsonb, 'Average hours required for manual quote review'),
  ('manual_scope_matrix_hours_per_audit', '"4.0"'::jsonb, 'Average hours required for manual scope matrix creation'),
  ('labour_rate_per_hour_nzd', '"150"'::jsonb, 'Default labour rate in NZD per hour'),
  ('risk_avoidance_percent_low', '"0.25"'::jsonb, 'Risk avoidance percentage for low risk scores (<40)'),
  ('risk_avoidance_percent_med', '"0.75"'::jsonb, 'Risk avoidance percentage for medium risk scores (40-70)'),
  ('risk_avoidance_percent_high', '"1.5"'::jsonb, 'Risk avoidance percentage for high risk scores (>70)'),
  ('scenario_multiplier_conservative', '"0.5"'::jsonb, 'Conservative scenario multiplier'),
  ('scenario_multiplier_expected', '"1.0"'::jsonb, 'Expected scenario multiplier'),
  ('scenario_multiplier_aggressive', '"1.5"'::jsonb, 'Aggressive scenario multiplier')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- 9. BACKFILL EXISTING DATA
-- ============================================================================

UPDATE quotes SET
  source_type = CASE 
    WHEN filename LIKE '%.pdf' THEN 'pdf'
    WHEN filename LIKE '%.xlsx' OR filename LIKE '%.xls' THEN 'excel'
    ELSE 'pdf'
  END,
  original_filename = filename,
  currency = 'NZD',
  uploaded_by_user_id = created_by,
  uploaded_at = created_at,
  parsed_at = CASE WHEN status = 'completed' THEN created_at ELSE NULL END,
  parse_status = CASE 
    WHEN status = 'completed' THEN 'success'
    WHEN status = 'processing' THEN 'processing'
    WHEN status = 'failed' THEN 'failed'
    ELSE 'pending'
  END,
  line_item_count = COALESCE(items_count, 0),
  module = 'passivefire',
  version = '1.0'
WHERE source_type IS NULL;

UPDATE quote_items SET
  normalized_item_key = LOWER(REGEXP_REPLACE(COALESCE(description, ''), '[^a-zA-Z0-9]+', '_', 'g')),
  manufacturer_detected = NULL,
  system_detected = system_id
WHERE normalized_item_key IS NULL;

COMMENT ON TABLE suppliers IS 'Supplier master data per organisation';
COMMENT ON TABLE audits IS 'Audit records with risk scores and recommendations';
COMMENT ON TABLE audit_findings IS 'Individual findings per audit';
COMMENT ON TABLE audit_exports IS 'Generated export files';
COMMENT ON TABLE audit_events IS 'Immutable ledger of system events';
COMMENT ON TABLE system_config IS 'Admin-configurable system settings';
