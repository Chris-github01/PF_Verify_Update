/*
  # Create Contract Inclusions and Exclusions System

  1. New Tables
    - `contract_inclusions`
      - `id` (uuid, primary key)
      - `project_id` (uuid, foreign key to projects)
      - `description` (text) - Inclusion description
      - `sort_order` (integer) - Display order
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

    - `contract_exclusions`
      - `id` (uuid, primary key)
      - `project_id` (uuid, foreign key to projects)
      - `description` (text) - Exclusion description
      - `sort_order` (integer) - Display order
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on both tables
    - Add policies for authenticated users in the organisation
    
  3. Indexes
    - Index on project_id for both tables
    - Index on sort_order for ordering

  4. Default Data
    - Insert standard inclusions/exclusions for existing projects
*/

-- Create contract_inclusions table
CREATE TABLE IF NOT EXISTS contract_inclusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  description text NOT NULL,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create contract_exclusions table
CREATE TABLE IF NOT EXISTS contract_exclusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  description text NOT NULL,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_contract_inclusions_project_id ON contract_inclusions(project_id);
CREATE INDEX IF NOT EXISTS idx_contract_inclusions_sort_order ON contract_inclusions(project_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_contract_exclusions_project_id ON contract_exclusions(project_id);
CREATE INDEX IF NOT EXISTS idx_contract_exclusions_sort_order ON contract_exclusions(project_id, sort_order);

-- Enable RLS
ALTER TABLE contract_inclusions ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_exclusions ENABLE ROW LEVEL SECURITY;

-- Create policies for contract_inclusions
CREATE POLICY "Users can view inclusions in their organisation's projects"
  ON contract_inclusions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = contract_inclusions.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

CREATE POLICY "Users can insert inclusions in their organisation's projects"
  ON contract_inclusions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = contract_inclusions.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

CREATE POLICY "Users can update inclusions in their organisation's projects"
  ON contract_inclusions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = contract_inclusions.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = contract_inclusions.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

CREATE POLICY "Users can delete inclusions in their organisation's projects"
  ON contract_inclusions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = contract_inclusions.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

-- Create policies for contract_exclusions
CREATE POLICY "Users can view exclusions in their organisation's projects"
  ON contract_exclusions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = contract_exclusions.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

CREATE POLICY "Users can insert exclusions in their organisation's projects"
  ON contract_exclusions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = contract_exclusions.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

CREATE POLICY "Users can update exclusions in their organisation's projects"
  ON contract_exclusions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = contract_exclusions.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = contract_exclusions.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

CREATE POLICY "Users can delete exclusions in their organisation's projects"
  ON contract_exclusions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = contract_exclusions.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

-- Create triggers to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_contract_inclusions_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION update_contract_exclusions_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_contract_inclusions_updated_at
  BEFORE UPDATE ON contract_inclusions
  FOR EACH ROW
  EXECUTE FUNCTION update_contract_inclusions_updated_at();

CREATE TRIGGER update_contract_exclusions_updated_at
  BEFORE UPDATE ON contract_exclusions
  FOR EACH ROW
  EXECUTE FUNCTION update_contract_exclusions_updated_at();

-- Insert default inclusions for existing projects with approved quotes
INSERT INTO contract_inclusions (project_id, description, sort_order)
SELECT 
  p.id,
  'All passive fire stopping to service penetrations as per fire engineering report and drawings.',
  1
FROM projects p
WHERE p.approved_quote_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO contract_inclusions (project_id, description, sort_order)
SELECT 
  p.id,
  'Intumescent coatings to structural steel members identified as requiring FRR.',
  2
FROM projects p
WHERE p.approved_quote_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO contract_inclusions (project_id, description, sort_order)
SELECT 
  p.id,
  'Supply of QA documentation including labels, photos, and PS3.',
  3
FROM projects p
WHERE p.approved_quote_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO contract_inclusions (project_id, description, sort_order)
SELECT 
  p.id,
  'All materials, labour, and equipment necessary to complete the works.',
  4
FROM projects p
WHERE p.approved_quote_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO contract_inclusions (project_id, description, sort_order)
SELECT 
  p.id,
  'Site-specific SWMS and induction for all personnel.',
  5
FROM projects p
WHERE p.approved_quote_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Insert default exclusions for existing projects with approved quotes
INSERT INTO contract_exclusions (project_id, description, sort_order)
SELECT 
  p.id,
  'Remediation of pre-existing, non-compliant fire stopping.',
  1
FROM projects p
WHERE p.approved_quote_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO contract_exclusions (project_id, description, sort_order)
SELECT 
  p.id,
  'Temporary services penetrations.',
  2
FROM projects p
WHERE p.approved_quote_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO contract_exclusions (project_id, description, sort_order)
SELECT 
  p.id,
  'Access equipment and out-of-hours work unless specifically agreed.',
  3
FROM projects p
WHERE p.approved_quote_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO contract_exclusions (project_id, description, sort_order)
SELECT 
  p.id,
  'Works to penetrations not shown on drawings or schedules.',
  4
FROM projects p
WHERE p.approved_quote_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO contract_exclusions (project_id, description, sort_order)
SELECT 
  p.id,
  'Delays caused by incomplete services installations or lack of access.',
  5
FROM projects p
WHERE p.approved_quote_id IS NOT NULL
ON CONFLICT DO NOTHING;
