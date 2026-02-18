/*
  # Add Import Audit Logs System

  1. New Tables
    - `import_audit_logs`
      - `id` (uuid, primary key)
      - `project_id` (uuid, foreign key to projects)
      - `award_approval_id` (uuid, foreign key to award_approvals, nullable)
      - `import_type` (text) - Type of import: 'base_tracker', 'quote', 'variation', etc.
      - `file_name` (text) - Original filename
      - `file_size` (integer) - File size in bytes
      - `imported_by` (uuid, foreign key to auth.users)
      - `import_config` (jsonb) - Configuration used for import
      - `result` (jsonb) - Import result including summary, errors, warnings
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on `import_audit_logs` table
    - Add policies for authenticated users to:
      - View their own organisation's import logs
      - Insert new import logs
    - Platform admins can view all import logs
*/

CREATE TABLE IF NOT EXISTS import_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  award_approval_id uuid REFERENCES award_approvals(id) ON DELETE SET NULL,
  import_type text NOT NULL,
  file_name text NOT NULL,
  file_size integer DEFAULT 0,
  imported_by uuid REFERENCES auth.users(id),
  import_config jsonb DEFAULT '{}'::jsonb,
  result jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_import_audit_logs_project_id
  ON import_audit_logs(project_id);

CREATE INDEX IF NOT EXISTS idx_import_audit_logs_award_approval_id
  ON import_audit_logs(award_approval_id);

CREATE INDEX IF NOT EXISTS idx_import_audit_logs_imported_by
  ON import_audit_logs(imported_by);

CREATE INDEX IF NOT EXISTS idx_import_audit_logs_created_at
  ON import_audit_logs(created_at DESC);

ALTER TABLE import_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view import logs for their organisation projects"
  ON import_audit_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = import_audit_logs.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

CREATE POLICY "Users can create import logs for their organisation projects"
  ON import_audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = import_audit_logs.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

CREATE POLICY "Platform admins can view all import logs"
  ON import_audit_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE user_id = auth.uid()
      AND is_active = true
    )
  );
