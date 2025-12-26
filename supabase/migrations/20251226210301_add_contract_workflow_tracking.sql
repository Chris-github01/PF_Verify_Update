/*
  # Add Contract Workflow Tracking System

  1. New Tables
    - `contract_workflow_progress`
      - `id` (uuid, primary key)
      - `project_id` (uuid, foreign key to projects)
      - `step_id` (text) - Workflow step identifier (summary, scope, inclusions, allowances, onboarding, handover)
      - `completed` (boolean) - Whether the step is completed
      - `completed_at` (timestamptz) - When the step was completed
      - `completion_percentage` (integer) - Progress percentage for the step (0-100)
      - `metadata` (jsonb) - Additional metadata about completion (e.g., number of items, validation status)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `contract_workflow_progress` table
    - Add policies for authenticated users to manage workflow progress for their organization's projects

  3. Indexes
    - Index on project_id for fast lookups
    - Composite index on (project_id, step_id) for unique constraint

  4. Functions
    - `update_workflow_step` - Function to update or create workflow step progress
    - `get_workflow_progress` - Function to retrieve workflow progress for a project
*/

-- Create contract_workflow_progress table
CREATE TABLE IF NOT EXISTS contract_workflow_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  step_id text NOT NULL CHECK (step_id IN ('summary', 'scope', 'inclusions', 'allowances', 'onboarding', 'handover')),
  completed boolean DEFAULT false,
  completed_at timestamptz,
  completion_percentage integer DEFAULT 0 CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(project_id, step_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_contract_workflow_project_id 
  ON contract_workflow_progress(project_id);

CREATE INDEX IF NOT EXISTS idx_contract_workflow_completed 
  ON contract_workflow_progress(completed) WHERE completed = true;

-- Enable RLS
ALTER TABLE contract_workflow_progress ENABLE ROW LEVEL SECURITY;

-- RLS Policies for contract_workflow_progress
CREATE POLICY "Users can view workflow progress for their organization's projects"
  ON contract_workflow_progress
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = contract_workflow_progress.project_id
      AND EXISTS (
        SELECT 1 FROM organisation_members om
        WHERE om.organisation_id = p.organisation_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
      )
    )
  );

CREATE POLICY "Users can insert workflow progress for their organization's projects"
  ON contract_workflow_progress
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = contract_workflow_progress.project_id
      AND EXISTS (
        SELECT 1 FROM organisation_members om
        WHERE om.organisation_id = p.organisation_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
      )
    )
  );

CREATE POLICY "Users can update workflow progress for their organization's projects"
  ON contract_workflow_progress
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = contract_workflow_progress.project_id
      AND EXISTS (
        SELECT 1 FROM organisation_members om
        WHERE om.organisation_id = p.organisation_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
      )
    )
  );

-- Function to update or create workflow step progress
CREATE OR REPLACE FUNCTION update_workflow_step(
  p_project_id uuid,
  p_step_id text,
  p_completed boolean DEFAULT false,
  p_completion_percentage integer DEFAULT 0,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS contract_workflow_progress
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_progress contract_workflow_progress;
BEGIN
  INSERT INTO contract_workflow_progress (
    project_id,
    step_id,
    completed,
    completion_percentage,
    metadata,
    completed_at,
    updated_at
  )
  VALUES (
    p_project_id,
    p_step_id,
    p_completed,
    p_completion_percentage,
    p_metadata,
    CASE WHEN p_completed THEN now() ELSE NULL END,
    now()
  )
  ON CONFLICT (project_id, step_id)
  DO UPDATE SET
    completed = EXCLUDED.completed,
    completion_percentage = EXCLUDED.completion_percentage,
    metadata = EXCLUDED.metadata,
    completed_at = CASE 
      WHEN EXCLUDED.completed AND NOT contract_workflow_progress.completed THEN now()
      WHEN NOT EXCLUDED.completed THEN NULL
      ELSE contract_workflow_progress.completed_at
    END,
    updated_at = now()
  RETURNING * INTO v_progress;

  RETURN v_progress;
END;
$$;

-- Function to get workflow progress for a project
CREATE OR REPLACE FUNCTION get_workflow_progress(p_project_id uuid)
RETURNS TABLE (
  step_id text,
  completed boolean,
  completed_at timestamptz,
  completion_percentage integer,
  metadata jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cwp.step_id,
    cwp.completed,
    cwp.completed_at,
    cwp.completion_percentage,
    cwp.metadata
  FROM contract_workflow_progress cwp
  WHERE cwp.project_id = p_project_id
  ORDER BY 
    CASE cwp.step_id
      WHEN 'summary' THEN 1
      WHEN 'scope' THEN 2
      WHEN 'inclusions' THEN 3
      WHEN 'allowances' THEN 4
      WHEN 'onboarding' THEN 5
      WHEN 'handover' THEN 6
    END;
END;
$$;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_contract_workflow_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_contract_workflow_progress_updated_at
  BEFORE UPDATE ON contract_workflow_progress
  FOR EACH ROW
  EXECUTE FUNCTION update_contract_workflow_updated_at();
