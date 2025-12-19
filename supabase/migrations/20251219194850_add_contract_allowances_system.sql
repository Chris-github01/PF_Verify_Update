/*
  # Create Contract Allowances System

  1. New Tables
    - `contract_allowances`
      - `id` (uuid, primary key)
      - `project_id` (uuid, foreign key to projects)
      - `description` (text) - Allowance description
      - `quantity` (text) - Quantity or basis (e.g., "20 openings", "Lump sum")
      - `unit` (text) - Unit of measurement
      - `rate` (numeric) - Rate per unit (nullable for lump sums)
      - `total` (numeric) - Total amount
      - `notes` (text, nullable) - Additional notes
      - `category` (text) - Category (e.g., "remedial", "equipment", "provisional")
      - `is_provisional` (boolean) - Whether this is a provisional sum
      - `sort_order` (integer) - Display order
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
      - `created_by` (uuid, foreign key to auth.users)

  2. Security
    - Enable RLS on `contract_allowances` table
    - Add policies for authenticated users to manage allowances in their organisation's projects
    
  3. Indexes
    - Index on project_id for fast lookups
    - Index on sort_order for ordering
*/

-- Create contract_allowances table
CREATE TABLE IF NOT EXISTS contract_allowances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity text NOT NULL DEFAULT '1',
  unit text NOT NULL DEFAULT 'Lump sum',
  rate numeric,
  total numeric NOT NULL,
  notes text,
  category text DEFAULT 'general',
  is_provisional boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_contract_allowances_project_id ON contract_allowances(project_id);
CREATE INDEX IF NOT EXISTS idx_contract_allowances_sort_order ON contract_allowances(project_id, sort_order);

-- Enable RLS
ALTER TABLE contract_allowances ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view allowances in their organisation's projects"
  ON contract_allowances FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = contract_allowances.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

CREATE POLICY "Users can insert allowances in their organisation's projects"
  ON contract_allowances FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = contract_allowances.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

CREATE POLICY "Users can update allowances in their organisation's projects"
  ON contract_allowances FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = contract_allowances.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = contract_allowances.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

CREATE POLICY "Users can delete allowances in their organisation's projects"
  ON contract_allowances FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = contract_allowances.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_contract_allowances_updated_at()
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

-- Create trigger
CREATE TRIGGER update_contract_allowances_updated_at
  BEFORE UPDATE ON contract_allowances
  FOR EACH ROW
  EXECUTE FUNCTION update_contract_allowances_updated_at();

-- Insert default allowances for existing projects with awards
INSERT INTO contract_allowances (project_id, description, quantity, unit, rate, total, category, is_provisional, sort_order)
SELECT 
  p.id,
  'Remedial fire stopping allowance',
  '20',
  'openings',
  250.00,
  5000.00,
  'remedial',
  false,
  1
FROM projects p
WHERE p.approved_quote_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO contract_allowances (project_id, description, quantity, unit, total, category, is_provisional, sort_order)
SELECT 
  p.id,
  'Access equipment allowance',
  '1',
  'Lump sum',
  8500.00,
  'equipment',
  false,
  2
FROM projects p
WHERE p.approved_quote_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO contract_allowances (project_id, description, quantity, unit, total, category, is_provisional, sort_order)
SELECT 
  p.id,
  'Provisional sum - additional works',
  'As directed',
  'Lump sum',
  10000.00,
  'provisional',
  true,
  3
FROM projects p
WHERE p.approved_quote_id IS NOT NULL
ON CONFLICT DO NOTHING;
