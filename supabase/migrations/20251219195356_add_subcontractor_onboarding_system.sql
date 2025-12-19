/*
  # Create Subcontractor Onboarding System

  1. New Tables
    - `letters_of_intent`
      - `id` (uuid, primary key)
      - `project_id` (uuid, foreign key to projects)
      - `supplier_name` (text) - Subcontractor name
      - `supplier_contact` (text) - Contact person
      - `supplier_email` (text) - Email address
      - `scope_summary` (text) - High-level scope description
      - `service_types` (jsonb) - Array of service types from scope matrix
      - `target_start_date` (date) - Proposed start date
      - `target_completion_date` (date) - Proposed completion date
      - `key_milestones` (jsonb) - Array of milestone objects
      - `next_steps_checklist` (jsonb) - Array of next steps
      - `custom_terms` (text) - Additional terms/notes
      - `status` (text) - draft, sent, acknowledged
      - `generated_at` (timestamp)
      - `sent_at` (timestamp)
      - `acknowledged_at` (timestamp)
      - `user_confirmed_nonbinding` (boolean) - User acknowledged disclaimer
      - `created_by` (uuid, foreign key to auth.users)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

    - `onboarding_compliance_documents`
      - `id` (uuid, primary key)
      - `project_id` (uuid, foreign key to projects)
      - `document_type` (text) - insurance, safety, license, etc.
      - `document_name` (text)
      - `file_path` (text) - Path in storage
      - `status` (text) - pending, submitted, verified, rejected
      - `notes` (text)
      - `uploaded_at` (timestamp)
      - `verified_at` (timestamp)
      - `verified_by` (uuid)
      - `created_at` (timestamp)

    - `onboarding_audit_log`
      - `id` (uuid, primary key)
      - `project_id` (uuid, foreign key to projects)
      - `event_type` (text) - loi_generated, loi_sent, compliance_uploaded, etc.
      - `event_data` (jsonb) - Additional event metadata
      - `user_id` (uuid, foreign key to auth.users)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users in the organisation
    
  3. Indexes
    - Index on project_id for all tables
    - Index on status fields
*/

-- Create letters_of_intent table
CREATE TABLE IF NOT EXISTS letters_of_intent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  supplier_name text NOT NULL,
  supplier_contact text,
  supplier_email text,
  scope_summary text NOT NULL,
  service_types jsonb DEFAULT '[]'::jsonb,
  target_start_date date,
  target_completion_date date,
  key_milestones jsonb DEFAULT '[]'::jsonb,
  next_steps_checklist jsonb DEFAULT '[]'::jsonb,
  custom_terms text,
  status text DEFAULT 'draft',
  generated_at timestamptz DEFAULT now(),
  sent_at timestamptz,
  acknowledged_at timestamptz,
  user_confirmed_nonbinding boolean DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create onboarding_compliance_documents table
CREATE TABLE IF NOT EXISTS onboarding_compliance_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  document_name text NOT NULL,
  file_path text NOT NULL,
  status text DEFAULT 'pending',
  notes text,
  uploaded_at timestamptz DEFAULT now(),
  verified_at timestamptz,
  verified_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Create onboarding_audit_log table
CREATE TABLE IF NOT EXISTS onboarding_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_data jsonb DEFAULT '{}'::jsonb,
  user_id uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_letters_of_intent_project_id ON letters_of_intent(project_id);
CREATE INDEX IF NOT EXISTS idx_letters_of_intent_status ON letters_of_intent(status);
CREATE INDEX IF NOT EXISTS idx_compliance_documents_project_id ON onboarding_compliance_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_compliance_documents_status ON onboarding_compliance_documents(status);
CREATE INDEX IF NOT EXISTS idx_onboarding_audit_log_project_id ON onboarding_audit_log(project_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_audit_log_created_at ON onboarding_audit_log(created_at DESC);

-- Enable RLS
ALTER TABLE letters_of_intent ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_compliance_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_audit_log ENABLE ROW LEVEL SECURITY;

-- Create policies for letters_of_intent
CREATE POLICY "Users can view LOIs in their organisation's projects"
  ON letters_of_intent FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = letters_of_intent.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

CREATE POLICY "Users can insert LOIs in their organisation's projects"
  ON letters_of_intent FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = letters_of_intent.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

CREATE POLICY "Users can update LOIs in their organisation's projects"
  ON letters_of_intent FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = letters_of_intent.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = letters_of_intent.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

CREATE POLICY "Users can delete LOIs in their organisation's projects"
  ON letters_of_intent FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = letters_of_intent.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

-- Create policies for onboarding_compliance_documents
CREATE POLICY "Users can view compliance docs in their organisation's projects"
  ON onboarding_compliance_documents FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = onboarding_compliance_documents.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

CREATE POLICY "Users can insert compliance docs in their organisation's projects"
  ON onboarding_compliance_documents FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = onboarding_compliance_documents.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

CREATE POLICY "Users can update compliance docs in their organisation's projects"
  ON onboarding_compliance_documents FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = onboarding_compliance_documents.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = onboarding_compliance_documents.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

-- Create policies for onboarding_audit_log
CREATE POLICY "Users can view audit logs in their organisation's projects"
  ON onboarding_audit_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = onboarding_audit_log.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

CREATE POLICY "Users can insert audit logs in their organisation's projects"
  ON onboarding_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = onboarding_audit_log.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

-- Create storage bucket for compliance documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('compliance-documents', 'compliance-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for compliance documents
CREATE POLICY "Users can upload compliance docs to their organisation's projects"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'compliance-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT p.id::text FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

CREATE POLICY "Users can view compliance docs from their organisation's projects"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'compliance-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT p.id::text FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

-- Create function to log onboarding events
CREATE OR REPLACE FUNCTION log_onboarding_event(
  p_project_id uuid,
  p_event_type text,
  p_event_data jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id uuid;
BEGIN
  INSERT INTO onboarding_audit_log (project_id, event_type, event_data, user_id)
  VALUES (p_project_id, p_event_type, p_event_data, auth.uid())
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

-- Create trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_letters_of_intent_updated_at()
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

CREATE TRIGGER update_letters_of_intent_updated_at
  BEFORE UPDATE ON letters_of_intent
  FOR EACH ROW
  EXECUTE FUNCTION update_letters_of_intent_updated_at();
