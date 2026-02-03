/*
  # BOQ Builder + Tags & Clarifications System

  1. New Tables
    - `boq_lines` - Owner baseline BOQ lines (normalised scope)
      - Identity: id, projectId, moduleKey, boqLineId, trade, systemGroup, systemName
      - Location: drawingSpecRef, locationZone, elementAsset
      - Technical attributes: frrRating, substrate, serviceType, penetrationSizeOpening
      - Commercial: quantity, unit, systemVariantProduct, installMethodBuildup, constraintsAccess
      - Baseline: baselineIncluded, baselineScopeNotes, baselineMeasureRule, baselineAllowanceType, baselineAllowanceValue
      - Version control: version, createdAt, updatedAt

    - `boq_tenderer_map` - Each tenderer's position against each BOQ line
      - Maps tenderers to BOQ lines
      - Tracks includedStatus (included/excluded/unclear/missing)
      - Stores tenderer qty, rate, amount, notes
      - Links to clarification tags

    - `scope_gaps` - Gap register for missing/unclear scope
      - Tracks missing, unclear, excluded, under_measured, unpriced items
      - Links to BOQ lines and tenderers
      - Includes risk assessment and commercial treatment
      - Status tracking and closure evidence

    - `tag_library` - Standard pre-created tags
      - System-wide tag templates
      - Categories: commercial, technical, programme, qa, hse, access, design
      - Cost impact tracking
      - Risk statements

    - `project_tags` - Tags used on specific projects (includes custom)
      - Project-specific instances of tags
      - Dual-party collaboration columns (main contractor + supplier)
      - Agreement status tracking
      - Links to BOQ lines

    - `boq_exports` - Export audit trail
      - Tracks all BOQ exports
      - Stores metadata and inputs snapshot
      - File URLs for download

  2. Security
    - Enable RLS on all tables
    - Policies for authenticated users with organisation membership
    - Service role bypass for automated processes

  3. Indexes
    - Foreign key indexes for performance
    - Composite indexes for common queries
*/

-- =====================================================================
-- TABLE: boq_lines
-- =====================================================================
CREATE TABLE IF NOT EXISTS boq_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  module_key text NOT NULL CHECK (module_key IN ('passive_fire', 'active_fire', 'electrical', 'plumbing', 'hvac')),
  boq_line_id text NOT NULL,

  -- Identity
  trade text,
  system_group text,
  system_name text NOT NULL,
  drawing_spec_ref text,
  location_zone text,
  element_asset text,

  -- Technical Attributes
  frr_rating text,
  substrate text,
  service_type text,
  penetration_size_opening text,
  quantity numeric NOT NULL DEFAULT 0,
  unit text NOT NULL,
  system_variant_product text,
  install_method_buildup text,
  constraints_access text,

  -- Baseline Commercial
  baseline_included boolean NOT NULL DEFAULT true,
  baseline_scope_notes text,
  baseline_measure_rule text,
  baseline_allowance_type text CHECK (baseline_allowance_type IN ('none', 'ps', 'pc', 'contingency')),
  baseline_allowance_value numeric,

  -- Version Control
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(project_id, module_key, boq_line_id)
);

CREATE INDEX IF NOT EXISTS idx_boq_lines_project ON boq_lines(project_id);
CREATE INDEX IF NOT EXISTS idx_boq_lines_module ON boq_lines(module_key);
CREATE INDEX IF NOT EXISTS idx_boq_lines_project_module ON boq_lines(project_id, module_key);

ALTER TABLE boq_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view BOQ lines for their organisation's projects"
  ON boq_lines FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = boq_lines.project_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

CREATE POLICY "Users can insert BOQ lines for their organisation's projects"
  ON boq_lines FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = boq_lines.project_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

CREATE POLICY "Users can update BOQ lines for their organisation's projects"
  ON boq_lines FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = boq_lines.project_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

CREATE POLICY "Users can delete BOQ lines for their organisation's projects"
  ON boq_lines FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = boq_lines.project_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

-- =====================================================================
-- TABLE: boq_tenderer_map
-- =====================================================================
CREATE TABLE IF NOT EXISTS boq_tenderer_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  module_key text NOT NULL CHECK (module_key IN ('passive_fire', 'active_fire', 'electrical', 'plumbing', 'hvac')),
  boq_line_id uuid NOT NULL REFERENCES boq_lines(id) ON DELETE CASCADE,
  tenderer_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,

  -- Mapping Status
  included_status text NOT NULL CHECK (included_status IN ('included', 'excluded', 'unclear', 'missing')) DEFAULT 'unclear',

  -- Tenderer Pricing
  tenderer_qty numeric,
  tenderer_rate numeric,
  tenderer_amount numeric,
  tenderer_notes text,

  -- Clarification Tags (stored as array of tag IDs)
  clarification_tag_ids text[] DEFAULT ARRAY[]::text[],

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(boq_line_id, tenderer_id)
);

CREATE INDEX IF NOT EXISTS idx_boq_tenderer_map_project ON boq_tenderer_map(project_id);
CREATE INDEX IF NOT EXISTS idx_boq_tenderer_map_boq_line ON boq_tenderer_map(boq_line_id);
CREATE INDEX IF NOT EXISTS idx_boq_tenderer_map_tenderer ON boq_tenderer_map(tenderer_id);

ALTER TABLE boq_tenderer_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view tenderer mappings for their organisation's projects"
  ON boq_tenderer_map FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = boq_tenderer_map.project_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

CREATE POLICY "Users can insert tenderer mappings for their organisation's projects"
  ON boq_tenderer_map FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = boq_tenderer_map.project_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

CREATE POLICY "Users can update tenderer mappings for their organisation's projects"
  ON boq_tenderer_map FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = boq_tenderer_map.project_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

CREATE POLICY "Users can delete tenderer mappings for their organisation's projects"
  ON boq_tenderer_map FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = boq_tenderer_map.project_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

-- =====================================================================
-- TABLE: scope_gaps
-- =====================================================================
CREATE TABLE IF NOT EXISTS scope_gaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  module_key text NOT NULL CHECK (module_key IN ('passive_fire', 'active_fire', 'electrical', 'plumbing', 'hvac')),
  gap_id text NOT NULL,
  boq_line_id uuid REFERENCES boq_lines(id) ON DELETE SET NULL,
  tenderer_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,

  -- Gap Details
  gap_type text NOT NULL CHECK (gap_type IN ('missing', 'unclear', 'excluded', 'under_measured', 'unpriced', 'lump_sum_unallocated')),
  description text NOT NULL,
  expected_requirement text,
  risk_if_not_included text,

  -- Commercial Treatment
  commercial_treatment text CHECK (commercial_treatment IN ('include', 'ps', 'separate_price', 'contingency', 'rfi')),
  target_closeout_date date,

  -- Ownership & Status
  owner_role text CHECK (owner_role IN ('qs', 'engineer', 'tenderer', 'admin')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  closure_evidence text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(project_id, module_key, gap_id)
);

CREATE INDEX IF NOT EXISTS idx_scope_gaps_project ON scope_gaps(project_id);
CREATE INDEX IF NOT EXISTS idx_scope_gaps_module ON scope_gaps(module_key);
CREATE INDEX IF NOT EXISTS idx_scope_gaps_boq_line ON scope_gaps(boq_line_id);
CREATE INDEX IF NOT EXISTS idx_scope_gaps_status ON scope_gaps(status);

ALTER TABLE scope_gaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view scope gaps for their organisation's projects"
  ON scope_gaps FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = scope_gaps.project_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

CREATE POLICY "Users can insert scope gaps for their organisation's projects"
  ON scope_gaps FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = scope_gaps.project_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

CREATE POLICY "Users can update scope gaps for their organisation's projects"
  ON scope_gaps FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = scope_gaps.project_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

CREATE POLICY "Users can delete scope gaps for their organisation's projects"
  ON scope_gaps FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = scope_gaps.project_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

-- =====================================================================
-- TABLE: tag_library
-- =====================================================================
CREATE TABLE IF NOT EXISTS tag_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL CHECK (module_key IN ('passive_fire', 'active_fire', 'electrical', 'plumbing', 'hvac', 'all')),

  -- Classification
  category text NOT NULL CHECK (category IN ('commercial', 'technical', 'programme', 'qa', 'hse', 'access', 'design')),
  title text NOT NULL,
  statement text NOT NULL,
  risk_if_not_agreed text,

  -- Commercial Impact
  default_position text CHECK (default_position IN ('included', 'excluded', 'ps', 'client_supply', 'by_others')),
  cost_impact_type text CHECK (cost_impact_type IN ('none', 'ps', 'dayworks', 'vo_rate', 'to_be_priced')),
  estimate_allowance numeric,
  evidence_ref text,

  -- System Flag
  is_system_default boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tag_library_module ON tag_library(module_key);
CREATE INDEX IF NOT EXISTS idx_tag_library_category ON tag_library(category);
CREATE INDEX IF NOT EXISTS idx_tag_library_system ON tag_library(is_system_default);

ALTER TABLE tag_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view tag library"
  ON tag_library FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Platform admins can manage tag library"
  ON tag_library FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE user_id = auth.uid()
        AND is_active = true
    )
  );

-- =====================================================================
-- TABLE: project_tags
-- =====================================================================
CREATE TABLE IF NOT EXISTS project_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  module_key text NOT NULL CHECK (module_key IN ('passive_fire', 'active_fire', 'electrical', 'plumbing', 'hvac')),
  tag_id text NOT NULL,

  -- Classification
  category text NOT NULL CHECK (category IN ('commercial', 'technical', 'programme', 'qa', 'hse', 'access', 'design')),
  trade text,
  linked_boq_line_id text,

  -- Tag Content
  title text NOT NULL,
  statement text NOT NULL,
  risk_if_not_agreed text,

  -- Commercial Impact
  default_position text CHECK (default_position IN ('included', 'excluded', 'ps', 'client_supply', 'by_others')),
  cost_impact_type text CHECK (cost_impact_type IN ('none', 'ps', 'dayworks', 'vo_rate', 'to_be_priced')),
  estimate_allowance numeric,
  evidence_ref text,

  -- Dual-Party Collaboration
  main_contractor_name text,
  main_contractor_comment text,
  supplier_name text,
  supplier_comment text,
  agreement_status text CHECK (agreement_status IN ('proposed', 'accepted', 'rejected', 'needs_revision')) DEFAULT 'proposed',
  final_contract_clause_ref text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(project_id, module_key, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_project_tags_project ON project_tags(project_id);
CREATE INDEX IF NOT EXISTS idx_project_tags_module ON project_tags(module_key);
CREATE INDEX IF NOT EXISTS idx_project_tags_category ON project_tags(category);
CREATE INDEX IF NOT EXISTS idx_project_tags_boq_line ON project_tags(linked_boq_line_id);

ALTER TABLE project_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view project tags for their organisation's projects"
  ON project_tags FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = project_tags.project_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

CREATE POLICY "Users can insert project tags for their organisation's projects"
  ON project_tags FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = project_tags.project_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

CREATE POLICY "Users can update project tags for their organisation's projects"
  ON project_tags FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = project_tags.project_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

CREATE POLICY "Users can delete project tags for their organisation's projects"
  ON project_tags FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = project_tags.project_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

-- =====================================================================
-- TABLE: boq_exports
-- =====================================================================
CREATE TABLE IF NOT EXISTS boq_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  module_key text NOT NULL CHECK (module_key IN ('passive_fire', 'active_fire', 'electrical', 'plumbing', 'hvac')),

  -- Export Details
  export_type text NOT NULL CHECK (export_type IN ('baseline_boq', 'awarded_boq', 'tags_register', 'full_pack')),
  export_version integer NOT NULL DEFAULT 1,

  -- Audit Trail
  generated_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),

  -- File Storage
  file_url text,
  storage_key text,

  -- Metadata
  inputs_snapshot jsonb,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_boq_exports_project ON boq_exports(project_id);
CREATE INDEX IF NOT EXISTS idx_boq_exports_module ON boq_exports(module_key);
CREATE INDEX IF NOT EXISTS idx_boq_exports_type ON boq_exports(export_type);

ALTER TABLE boq_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view BOQ exports for their organisation's projects"
  ON boq_exports FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = boq_exports.project_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

CREATE POLICY "Users can insert BOQ exports for their organisation's projects"
  ON boq_exports FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = boq_exports.project_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

-- =====================================================================
-- WORKFLOW TRACKING
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'boq_builder_completed'
  ) THEN
    ALTER TABLE projects ADD COLUMN boq_builder_completed boolean DEFAULT false;
    ALTER TABLE projects ADD COLUMN boq_builder_completed_at timestamptz;
    ALTER TABLE projects ADD COLUMN boq_builder_skip_reason text;
  END IF;
END $$;

-- =====================================================================
-- SEED DATA: Standard Tag Library
-- =====================================================================
INSERT INTO tag_library (module_key, category, title, statement, risk_if_not_agreed, default_position, cost_impact_type, estimate_allowance, is_system_default) VALUES
  ('passive_fire', 'commercial', 'Site Surveys & Verifications', 'Contractor to conduct site surveys to verify existing conditions before commencing work. Any discrepancies to be notified immediately.', 'Unverified conditions may lead to variations and delays', 'included', 'none', NULL, true),
  ('passive_fire', 'commercial', 'Provisional Sum - Additional Penetrations', 'Provisional sum for additional penetrations discovered during construction phase.', 'Unbudgeted cost exposure', 'ps', 'ps', 15000, true),
  ('passive_fire', 'technical', 'Fire Stopping Materials Specification', 'All fire stopping materials to be third-party certified and compliant with local fire regulations.', 'Non-compliant installations requiring rework', 'included', 'none', NULL, true),
  ('passive_fire', 'technical', 'Testing & Certification', 'Contractor to provide testing and certification for all fire stopping works as per specification.', 'Non-compliant handover', 'included', 'ps', 5000, true),
  ('passive_fire', 'programme', 'Access Coordination', 'Contractor responsible for coordinating access with other trades. Access equipment cost included.', 'Programme delays and additional access costs', 'included', 'none', NULL, true),
  ('passive_fire', 'qa', 'Quality Inspections', 'Third-party quality inspections at completion milestones. Minimum 2 inspections required.', 'Quality issues discovered at handover', 'included', 'ps', 3000, true),
  ('passive_fire', 'hse', 'Health & Safety Compliance', 'Contractor to comply with all H&S regulations and provide method statements and risk assessments.', 'Safety incidents and project suspension', 'included', 'none', NULL, true),
  ('passive_fire', 'access', 'Out of Hours Working', 'Standard working hours apply. Out of hours work requires prior approval and will be charged at daywork rates.', 'Programme delays if out of hours work required', 'excluded', 'dayworks', NULL, true),
  ('passive_fire', 'design', 'Design Changes', 'Contractor price based on current design. Any design changes to be priced as variations.', 'Scope creep and cost overruns', 'excluded', 'vo_rate', NULL, true),
  ('electrical', 'commercial', 'Cable Testing & Commissioning', 'All cable testing and commissioning included in contract sum.', 'Non-operational systems at handover', 'included', 'none', NULL, true),
  ('electrical', 'commercial', 'Provisional Sum - Additional Cable Runs', 'Provisional sum for additional cable runs not shown on drawings.', 'Unbudgeted cost exposure', 'ps', 'ps', 20000, true),
  ('electrical', 'technical', 'Cable Specification', 'All cables to comply with local electrical standards and manufacturer specifications.', 'Non-compliant installations', 'included', 'none', NULL, true),
  ('electrical', 'programme', 'Switchboard Access', 'Client to provide access to existing switchboards for new connections.', 'Programme delays', 'client_supply', 'none', NULL, true),
  ('hvac', 'commercial', 'System Commissioning', 'Full system commissioning and performance testing included.', 'Non-operational systems', 'included', 'ps', 8000, true),
  ('hvac', 'commercial', 'Provisional Sum - Ductwork Modifications', 'Provisional sum for ductwork modifications discovered during installation.', 'Unbudgeted cost exposure', 'ps', 'ps', 25000, true),
  ('hvac', 'technical', 'Equipment Warranties', 'All HVAC equipment to be supplied with manufacturer warranties (minimum 12 months).', 'Equipment failures without recourse', 'included', 'none', NULL, true),
  ('hvac', 'access', 'Ceiling Access', 'Client to provide safe access to ceiling spaces. Additional access equipment excluded.', 'Programme delays and cost overruns', 'excluded', 'dayworks', NULL, true),
  ('plumbing', 'commercial', 'Pressure Testing', 'All pipework to be pressure tested and certified before handover.', 'Leaks and system failures', 'included', 'ps', 4000, true),
  ('plumbing', 'commercial', 'Provisional Sum - Additional Connections', 'Provisional sum for additional connections not shown on drawings.', 'Unbudgeted cost exposure', 'ps', 'ps', 12000, true),
  ('plumbing', 'technical', 'Material Standards', 'All plumbing materials to comply with local plumbing codes and standards.', 'Non-compliant installations', 'included', 'none', NULL, true),
  ('active_fire', 'commercial', 'System Integration & Testing', 'Full fire alarm system integration, commissioning, and testing included.', 'Non-operational fire systems', 'included', 'ps', 10000, true),
  ('active_fire', 'commercial', 'Provisional Sum - Additional Devices', 'Provisional sum for additional fire alarm devices required during construction.', 'Unbudgeted cost exposure', 'ps', 'ps', 18000, true),
  ('active_fire', 'technical', 'Fire Alarm Certification', 'Contractor to provide fire alarm certification from approved certifying authority.', 'Building non-compliant for occupation', 'included', 'ps', 5000, true),
  ('active_fire', 'qa', 'Witness Testing', 'Client representative to witness all fire alarm testing. 48 hours notice required.', 'Testing delays', 'included', 'none', NULL, true),
  ('all', 'commercial', 'Payment Terms', 'Payment terms: 30 days from date of tax invoice. Retention as per main contract.', 'Cash flow issues', 'included', 'none', NULL, true),
  ('all', 'commercial', 'Variations Procedure', 'All variations to be approved in writing before proceeding. Variations priced at schedule rates or daywork.', 'Disputed variations', 'included', 'none', NULL, true),
  ('all', 'programme', 'Programme Coordination', 'Contractor to coordinate with main contractor and other trades. Programme changes require written notice.', 'Programme delays and disruptions', 'included', 'none', NULL, true),
  ('all', 'hse', 'Site Inductions', 'All contractor personnel to complete site induction before commencing work.', 'Safety incidents', 'included', 'none', NULL, true),
  ('all', 'qa', 'As-Built Documentation', 'Contractor to provide as-built documentation within 14 days of practical completion.', 'Incomplete handover', 'included', 'none', NULL, true)
ON CONFLICT DO NOTHING;