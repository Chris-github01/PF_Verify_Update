/*
  # Add Tags & Clarifications System

  1. New Tables
    - `contract_tags_clarifications`
      - `id` (uuid, primary key)
      - `project_id` (uuid, foreign key to projects)
      - `tag_ref` (text, auto-generated TAG-001, TAG-002, etc.)
      - `tag_type` (text, enum: Assumption, Clarification, Risk, Hold Point)
      - `title` (text, short label)
      - `description` (text, full commercial statement)
      - `linked_scope_ref` (text, optional reference like INC-003, EXC-009)
      - `origin` (text, enum: MC, Subcontractor)
      - `created_by` (uuid, foreign key to auth.users)
      - `created_date` (timestamptz)
      - `resolution_required_at` (text, enum: Pre-let, Post-contract)
      - `subcontractor_response` (text, nullable)
      - `subcontractor_position` (text, enum: Agree, Disagree, Amend, Clarification Required)
      - `subcontractor_comment` (text, nullable)
      - `cost_impact` (text, enum: None, Potential, Confirmed, Variation Required)
      - `programme_impact` (text, enum: None, Potential, Confirmed)
      - `mc_response` (text, nullable)
      - `status` (text, enum: Open, Agreed, To Pre-let, Closed)
      - `final_agreed_position` (text, nullable)
      - `sort_order` (integer)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `contract_tags_clarifications` table
    - Add policies for authenticated users within the same organization
*/

-- Create contract_tags_clarifications table
CREATE TABLE IF NOT EXISTS contract_tags_clarifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tag_ref text NOT NULL,
  tag_type text NOT NULL CHECK (tag_type IN ('Assumption', 'Clarification', 'Risk', 'Hold Point')),
  title text NOT NULL,
  description text NOT NULL,
  linked_scope_ref text,
  origin text NOT NULL DEFAULT 'MC' CHECK (origin IN ('MC', 'Subcontractor')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_date timestamptz DEFAULT now(),
  resolution_required_at text CHECK (resolution_required_at IN ('Pre-let', 'Post-contract')),
  subcontractor_response text,
  subcontractor_position text CHECK (subcontractor_position IN ('Agree', 'Disagree', 'Amend', 'Clarification Required')),
  subcontractor_comment text,
  cost_impact text DEFAULT 'None' CHECK (cost_impact IN ('None', 'Potential', 'Confirmed', 'Variation Required')),
  programme_impact text DEFAULT 'None' CHECK (programme_impact IN ('None', 'Potential', 'Confirmed')),
  mc_response text,
  status text DEFAULT 'Open' CHECK (status IN ('Open', 'Agreed', 'To Pre-let', 'Closed')),
  final_agreed_position text,
  sort_order integer DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_contract_tags_clarifications_project_id ON contract_tags_clarifications(project_id);
CREATE INDEX IF NOT EXISTS idx_contract_tags_clarifications_tag_ref ON contract_tags_clarifications(tag_ref);
CREATE INDEX IF NOT EXISTS idx_contract_tags_clarifications_status ON contract_tags_clarifications(status);

-- Enable RLS
ALTER TABLE contract_tags_clarifications ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view tags for projects in their organization
CREATE POLICY "Users can view tags in their organisation"
  ON contract_tags_clarifications
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = contract_tags_clarifications.project_id
      AND p.organisation_id IN (
        SELECT organisation_id FROM organisation_members
        WHERE user_id = auth.uid()
        AND status = 'active'
      )
    )
  );

-- Policy: Users can insert tags for projects in their organization
CREATE POLICY "Users can create tags in their organisation"
  ON contract_tags_clarifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = contract_tags_clarifications.project_id
      AND p.organisation_id IN (
        SELECT organisation_id FROM organisation_members
        WHERE user_id = auth.uid()
        AND status = 'active'
      )
    )
  );

-- Policy: Users can update tags for projects in their organization
CREATE POLICY "Users can update tags in their organisation"
  ON contract_tags_clarifications
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = contract_tags_clarifications.project_id
      AND p.organisation_id IN (
        SELECT organisation_id FROM organisation_members
        WHERE user_id = auth.uid()
        AND status = 'active'
      )
    )
  );

-- Policy: Users can delete tags for projects in their organization
CREATE POLICY "Users can delete tags in their organisation"
  ON contract_tags_clarifications
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = contract_tags_clarifications.project_id
      AND p.organisation_id IN (
        SELECT organisation_id FROM organisation_members
        WHERE user_id = auth.uid()
        AND status = 'active'
      )
    )
  );

-- Function to auto-generate tag_ref
CREATE OR REPLACE FUNCTION generate_tag_ref()
RETURNS TRIGGER AS $$
DECLARE
  next_number integer;
BEGIN
  -- Get the highest tag number for this project
  SELECT COALESCE(MAX(CAST(SUBSTRING(tag_ref FROM 'TAG-([0-9]+)') AS integer)), 0) + 1
  INTO next_number
  FROM contract_tags_clarifications
  WHERE project_id = NEW.project_id;

  -- Set the tag_ref with zero-padded number
  NEW.tag_ref := 'TAG-' || LPAD(next_number::text, 3, '0');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-generate tag_ref on insert
CREATE TRIGGER trigger_generate_tag_ref
  BEFORE INSERT ON contract_tags_clarifications
  FOR EACH ROW
  WHEN (NEW.tag_ref IS NULL OR NEW.tag_ref = '')
  EXECUTE FUNCTION generate_tag_ref();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_contract_tags_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-update updated_at
CREATE TRIGGER trigger_update_contract_tags_updated_at
  BEFORE UPDATE ON contract_tags_clarifications
  FOR EACH ROW
  EXECUTE FUNCTION update_contract_tags_updated_at();
