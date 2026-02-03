/*
  # Fire Engineer Schedule System

  1. New Tables
    - `fire_engineer_schedules` - Metadata for uploaded fire engineer schedules
      - Schedule identification and versioning
      - File storage references
      - Active revision tracking
    
    - `fire_engineer_schedule_rows` - Parsed schedule rows with structured + raw data
      - Identity: solutionId, systemClassification
      - Technical: substrate, orientation, frrRating, serviceType
      - Dimensions: serviceSizeText, serviceSizeMinMm, serviceSizeMaxMm
      - Installation: insulationType, insulationThicknessMm
      - Compliance: testReference
      - Quality: rawText (required), parseConfidence (required)
    
    - `schedule_boq_links` - Manual and automatic links between schedule rows and BOQ lines
      - Link type tracking (manual vs auto)
      - Match quality metrics
      - Mismatch reason tracking
      - Persistent manual overrides

  2. Security
    - Enable RLS on all tables
    - Organisation-based access control
    - Service role bypass for automated processes

  3. Indexes
    - Foreign key indexes for performance
    - Composite indexes for common queries
    - Confidence and status filtering
*/

-- =====================================================================
-- TABLE: fire_engineer_schedules
-- =====================================================================
CREATE TABLE IF NOT EXISTS fire_engineer_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  module_key text NOT NULL CHECK (module_key = 'passive_fire'), -- Passive Fire specific
  
  -- Schedule Identification
  schedule_name text,
  revision_label text,
  
  -- Source File
  source_file_name text NOT NULL,
  source_storage_key text, -- Reference to storage bucket
  
  -- Import Tracking
  imported_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  
  -- Status
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(project_id, module_key, source_file_name)
);

CREATE INDEX IF NOT EXISTS idx_fire_schedules_project ON fire_engineer_schedules(project_id);
CREATE INDEX IF NOT EXISTS idx_fire_schedules_module ON fire_engineer_schedules(module_key);
CREATE INDEX IF NOT EXISTS idx_fire_schedules_active ON fire_engineer_schedules(is_active);
CREATE INDEX IF NOT EXISTS idx_fire_schedules_project_active ON fire_engineer_schedules(project_id, is_active);

ALTER TABLE fire_engineer_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view fire schedules for their organisation's projects"
  ON fire_engineer_schedules FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = fire_engineer_schedules.project_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

CREATE POLICY "Users can insert fire schedules for their organisation's projects"
  ON fire_engineer_schedules FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = fire_engineer_schedules.project_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

CREATE POLICY "Users can update fire schedules for their organisation's projects"
  ON fire_engineer_schedules FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = fire_engineer_schedules.project_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

CREATE POLICY "Users can delete fire schedules for their organisation's projects"
  ON fire_engineer_schedules FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = fire_engineer_schedules.project_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

-- =====================================================================
-- TABLE: fire_engineer_schedule_rows
-- =====================================================================
CREATE TABLE IF NOT EXISTS fire_engineer_schedule_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES fire_engineer_schedules(id) ON DELETE CASCADE,
  
  -- Position
  page_number integer,
  row_index integer NOT NULL,
  
  -- Identity
  solution_id text, -- Fire Stop Ref / PFP Ref / Solution ID
  system_classification text,
  
  -- Technical Attributes
  substrate text,
  orientation text, -- Horizontal / Vertical / Angled
  frr_rating text,
  service_type text, -- Electrical / Plumbing / HVAC / Cable / Pipe / Duct
  
  -- Dimensions (store both text and parsed numeric)
  service_size_text text, -- Raw: "Ø110" or "750x200" or "0-50mm"
  service_size_min_mm numeric, -- Parsed minimum size in mm
  service_size_max_mm numeric, -- Parsed maximum size in mm
  
  -- Installation Details
  insulation_type text,
  insulation_thickness_mm numeric,
  test_reference text, -- WARRES, BRE, etc.
  notes text,
  
  -- Quality Assurance (Required)
  raw_text text NOT NULL, -- Original text extracted from PDF
  parse_confidence numeric NOT NULL CHECK (parse_confidence >= 0 AND parse_confidence <= 1),
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schedule_rows_schedule ON fire_engineer_schedule_rows(schedule_id);
CREATE INDEX IF NOT EXISTS idx_schedule_rows_solution_id ON fire_engineer_schedule_rows(solution_id);
CREATE INDEX IF NOT EXISTS idx_schedule_rows_confidence ON fire_engineer_schedule_rows(parse_confidence);
CREATE INDEX IF NOT EXISTS idx_schedule_rows_schedule_index ON fire_engineer_schedule_rows(schedule_id, row_index);

ALTER TABLE fire_engineer_schedule_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view schedule rows for their organisation's projects"
  ON fire_engineer_schedule_rows FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM fire_engineer_schedules s
      JOIN projects p ON p.id = s.project_id
      JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE s.id = fire_engineer_schedule_rows.schedule_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

CREATE POLICY "Users can insert schedule rows for their organisation's projects"
  ON fire_engineer_schedule_rows FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM fire_engineer_schedules s
      JOIN projects p ON p.id = s.project_id
      JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE s.id = fire_engineer_schedule_rows.schedule_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

CREATE POLICY "Users can update schedule rows for their organisation's projects"
  ON fire_engineer_schedule_rows FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM fire_engineer_schedules s
      JOIN projects p ON p.id = s.project_id
      JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE s.id = fire_engineer_schedule_rows.schedule_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

CREATE POLICY "Users can delete schedule rows for their organisation's projects"
  ON fire_engineer_schedule_rows FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM fire_engineer_schedules s
      JOIN projects p ON p.id = s.project_id
      JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE s.id = fire_engineer_schedule_rows.schedule_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

-- =====================================================================
-- TABLE: schedule_boq_links
-- =====================================================================
CREATE TABLE IF NOT EXISTS schedule_boq_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  module_key text NOT NULL CHECK (module_key = 'passive_fire'),
  
  -- Link Entities
  schedule_row_id uuid NOT NULL REFERENCES fire_engineer_schedule_rows(id) ON DELETE CASCADE,
  boq_line_id uuid NOT NULL REFERENCES boq_lines(id) ON DELETE CASCADE,
  
  -- Link Type
  link_type text NOT NULL CHECK (link_type IN ('manual', 'auto')) DEFAULT 'auto',
  
  -- Match Quality
  match_type text CHECK (match_type IN ('exact', 'strong', 'weak', 'none')),
  match_confidence numeric CHECK (match_confidence >= 0 AND match_confidence <= 1),
  mismatch_reason text,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(schedule_row_id, boq_line_id)
);

CREATE INDEX IF NOT EXISTS idx_schedule_links_project ON schedule_boq_links(project_id);
CREATE INDEX IF NOT EXISTS idx_schedule_links_schedule_row ON schedule_boq_links(schedule_row_id);
CREATE INDEX IF NOT EXISTS idx_schedule_links_boq_line ON schedule_boq_links(boq_line_id);
CREATE INDEX IF NOT EXISTS idx_schedule_links_type ON schedule_boq_links(link_type);
CREATE INDEX IF NOT EXISTS idx_schedule_links_confidence ON schedule_boq_links(match_confidence);

ALTER TABLE schedule_boq_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view schedule links for their organisation's projects"
  ON schedule_boq_links FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = schedule_boq_links.project_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

CREATE POLICY "Users can insert schedule links for their organisation's projects"
  ON schedule_boq_links FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = schedule_boq_links.project_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

CREATE POLICY "Users can update schedule links for their organisation's projects"
  ON schedule_boq_links FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = schedule_boq_links.project_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

CREATE POLICY "Users can delete schedule links for their organisation's projects"
  ON schedule_boq_links FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = schedule_boq_links.project_id
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
    WHERE table_name = 'projects' AND column_name = 'fire_schedule_imported'
  ) THEN
    ALTER TABLE projects ADD COLUMN fire_schedule_imported boolean DEFAULT false;
    ALTER TABLE projects ADD COLUMN fire_schedule_imported_at timestamptz;
  END IF;
END $$;

-- =====================================================================
-- ADD SOURCE FIELD TO BOQ_LINES
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'boq_lines' AND column_name = 'source'
  ) THEN
    ALTER TABLE boq_lines ADD COLUMN source text CHECK (source IN ('quote', 'issued_boq', 'fire_schedule', 'mixed')) DEFAULT 'quote';
    CREATE INDEX IF NOT EXISTS idx_boq_lines_source ON boq_lines(source);
  END IF;
END $$;
