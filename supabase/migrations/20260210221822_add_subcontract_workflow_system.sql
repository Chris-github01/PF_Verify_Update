/*
  # Subcontract Workflow System - SA-2017 Implementation

  ## Overview
  This migration creates a complete metadata-driven form system for managing subcontract agreements (starting with SA-2017).
  The system supports:
  - Dynamic form rendering from field definitions
  - Field-level comments and annotations
  - Conditional validation rules
  - Workflow states (draft → in_review → completed)
  - PDF master template storage
  - Completion pack generation
  - Audit trail and locking

  ## New Tables

  ### 1. contract_templates
  Stores metadata about subcontract templates (SA-2017, etc.)
  - `id` (uuid, primary key)
  - `template_code` (text, unique) - e.g., "SA-2017"
  - `template_name` (text) - e.g., "Subcontract Agreement 2017"
  - `version` (text) - e.g., "1.0"
  - `master_pdf_url` (text) - Supabase Storage URL to master PDF
  - `is_active` (boolean) - Whether template is available for use
  - `metadata` (jsonb) - Additional template configuration
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 2. subcontract_field_definitions
  Metadata-driven form schema for fields
  - `id` (uuid, primary key)
  - `template_id` (uuid, foreign key to contract_templates)
  - `section` (text) - Section name (e.g., "Contract Identity")
  - `field_key` (text) - Unique field identifier
  - `field_label` (text) - Display label
  - `field_type` (text) - Type: text, number, date, dropdown, yes_no, textarea
  - `field_order` (integer) - Display order within section
  - `is_required` (boolean) - Always required
  - `required_when_json` (jsonb) - Conditional requirements {field: value}
  - `options` (jsonb) - For dropdowns: ["Yes", "No", "N/A"]
  - `help_text` (text) - Field description/guidance
  - `default_value` (text) - Default value
  - `validation_regex` (text) - Optional regex validation
  - `created_at` (timestamptz)

  ### 3. subcontract_agreements
  Agreement instances with workflow states
  - `id` (uuid, primary key)
  - `template_id` (uuid, foreign key to contract_templates)
  - `project_id` (uuid, foreign key to projects)
  - `organisation_id` (uuid, foreign key to organisations)
  - `agreement_number` (text) - User-friendly reference number
  - `subcontractor_name` (text) - Name of subcontractor
  - `status` (text) - draft, in_review, completed
  - `is_locked` (boolean) - Prevents editing when completed
  - `completed_at` (timestamptz) - When agreement was completed
  - `completed_by` (uuid) - User who completed it
  - `created_by` (uuid, foreign key to auth.users)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 4. subcontract_field_values
  Stores actual field data with comments
  - `id` (uuid, primary key)
  - `agreement_id` (uuid, foreign key to subcontract_agreements)
  - `field_definition_id` (uuid, foreign key to subcontract_field_definitions)
  - `field_value` (text) - The actual value
  - `comment` (text) - User comment/note on this field
  - `updated_by` (uuid, foreign key to auth.users)
  - `updated_at` (timestamptz)

  ### 5. subcontract_attachments
  File attachments for agreements
  - `id` (uuid, primary key)
  - `agreement_id` (uuid, foreign key to subcontract_agreements)
  - `file_name` (text)
  - `file_url` (text) - Supabase Storage URL
  - `file_type` (text) - MIME type
  - `file_size` (integer) - Bytes
  - `uploaded_by` (uuid, foreign key to auth.users)
  - `uploaded_at` (timestamptz)

  ## Security
  - RLS enabled on all tables
  - Users can only access agreements in their organisation
  - Platform admins have full access
  - Completed agreements are read-only except for admins

  ## Storage
  - Creates `contract-templates` bucket for master PDFs
  - Creates `subcontract-attachments` bucket for agreement files
*/

-- Create contract_templates table
CREATE TABLE IF NOT EXISTS contract_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_code text UNIQUE NOT NULL,
  template_name text NOT NULL,
  version text NOT NULL DEFAULT '1.0',
  master_pdf_url text,
  is_active boolean DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE contract_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view active templates"
  ON contract_templates FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Platform admins can manage templates"
  ON contract_templates FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Create subcontract_field_definitions table
CREATE TABLE IF NOT EXISTS subcontract_field_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid REFERENCES contract_templates(id) ON DELETE CASCADE,
  section text NOT NULL,
  field_key text NOT NULL,
  field_label text NOT NULL,
  field_type text NOT NULL,
  field_order integer NOT NULL DEFAULT 0,
  is_required boolean DEFAULT false,
  required_when_json jsonb DEFAULT '{}'::jsonb,
  options jsonb DEFAULT '[]'::jsonb,
  help_text text,
  default_value text,
  validation_regex text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(template_id, field_key)
);

ALTER TABLE subcontract_field_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view field definitions"
  ON subcontract_field_definitions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Platform admins can manage field definitions"
  ON subcontract_field_definitions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Create subcontract_agreements table
CREATE TABLE IF NOT EXISTS subcontract_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid REFERENCES contract_templates(id) ON DELETE RESTRICT NOT NULL,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  organisation_id uuid REFERENCES organisations(id) ON DELETE CASCADE NOT NULL,
  agreement_number text,
  subcontractor_name text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_review', 'completed')),
  is_locked boolean DEFAULT false,
  completed_at timestamptz,
  completed_by uuid REFERENCES auth.users(id),
  created_by uuid REFERENCES auth.users(id) NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE subcontract_agreements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view agreements in their organisation"
  ON subcontract_agreements FOR SELECT
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
    OR
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Users can create agreements in their organisation"
  ON subcontract_agreements FOR INSERT
  TO authenticated
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
    AND created_by = auth.uid()
  );

CREATE POLICY "Users can update unlocked agreements in their organisation"
  ON subcontract_agreements FOR UPDATE
  TO authenticated
  USING (
    (
      organisation_id IN (
        SELECT organisation_id FROM organisation_members
        WHERE user_id = auth.uid() AND status = 'active'
      )
      AND is_locked = false
    )
    OR
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Platform admins can delete agreements"
  ON subcontract_agreements FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Create subcontract_field_values table
CREATE TABLE IF NOT EXISTS subcontract_field_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id uuid REFERENCES subcontract_agreements(id) ON DELETE CASCADE NOT NULL,
  field_definition_id uuid REFERENCES subcontract_field_definitions(id) ON DELETE CASCADE NOT NULL,
  field_value text,
  comment text,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(agreement_id, field_definition_id)
);

ALTER TABLE subcontract_field_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view field values for agreements in their organisation"
  ON subcontract_field_values FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM subcontract_agreements sa
      WHERE sa.id = agreement_id
      AND (
        sa.organisation_id IN (
          SELECT organisation_id FROM organisation_members
          WHERE user_id = auth.uid() AND status = 'active'
        )
        OR
        EXISTS (
          SELECT 1 FROM platform_admins
          WHERE user_id = auth.uid() AND is_active = true
        )
      )
    )
  );

CREATE POLICY "Users can manage field values for unlocked agreements"
  ON subcontract_field_values FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM subcontract_agreements sa
      WHERE sa.id = agreement_id
      AND sa.is_locked = false
      AND (
        sa.organisation_id IN (
          SELECT organisation_id FROM organisation_members
          WHERE user_id = auth.uid() AND status = 'active'
        )
        OR
        EXISTS (
          SELECT 1 FROM platform_admins
          WHERE user_id = auth.uid() AND is_active = true
        )
      )
    )
  );

-- Create subcontract_attachments table
CREATE TABLE IF NOT EXISTS subcontract_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id uuid REFERENCES subcontract_agreements(id) ON DELETE CASCADE NOT NULL,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  file_size integer,
  uploaded_by uuid REFERENCES auth.users(id) NOT NULL,
  uploaded_at timestamptz DEFAULT now()
);

ALTER TABLE subcontract_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view attachments for agreements in their organisation"
  ON subcontract_attachments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM subcontract_agreements sa
      WHERE sa.id = agreement_id
      AND (
        sa.organisation_id IN (
          SELECT organisation_id FROM organisation_members
          WHERE user_id = auth.uid() AND status = 'active'
        )
        OR
        EXISTS (
          SELECT 1 FROM platform_admins
          WHERE user_id = auth.uid() AND is_active = true
        )
      )
    )
  );

CREATE POLICY "Users can upload attachments to unlocked agreements"
  ON subcontract_attachments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM subcontract_agreements sa
      WHERE sa.id = agreement_id
      AND sa.is_locked = false
      AND sa.organisation_id IN (
        SELECT organisation_id FROM organisation_members
        WHERE user_id = auth.uid() AND status = 'active'
      )
    )
    AND uploaded_by = auth.uid()
  );

CREATE POLICY "Users can delete their own attachments from unlocked agreements"
  ON subcontract_attachments FOR DELETE
  TO authenticated
  USING (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM subcontract_agreements sa
      WHERE sa.id = agreement_id
      AND sa.is_locked = false
    )
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_subcontract_agreements_organisation 
  ON subcontract_agreements(organisation_id);

CREATE INDEX IF NOT EXISTS idx_subcontract_agreements_project 
  ON subcontract_agreements(project_id);

CREATE INDEX IF NOT EXISTS idx_subcontract_agreements_status 
  ON subcontract_agreements(status);

CREATE INDEX IF NOT EXISTS idx_subcontract_field_values_agreement 
  ON subcontract_field_values(agreement_id);

CREATE INDEX IF NOT EXISTS idx_subcontract_field_values_field_def 
  ON subcontract_field_values(field_definition_id);

CREATE INDEX IF NOT EXISTS idx_subcontract_attachments_agreement 
  ON subcontract_attachments(agreement_id);

CREATE INDEX IF NOT EXISTS idx_field_definitions_template 
  ON subcontract_field_definitions(template_id);

-- Create storage buckets (if they don't exist)
INSERT INTO storage.buckets (id, name, public)
VALUES ('contract-templates', 'contract-templates', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('subcontract-attachments', 'subcontract-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for contract-templates bucket
CREATE POLICY "Authenticated users can view contract templates"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'contract-templates');

CREATE POLICY "Platform admins can upload contract templates"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'contract-templates'
    AND EXISTS (
      SELECT 1 FROM platform_admins
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Storage policies for subcontract-attachments bucket
CREATE POLICY "Users can view attachments from their organisation agreements"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'subcontract-attachments'
    AND EXISTS (
      SELECT 1 FROM subcontract_attachments sa
      JOIN subcontract_agreements ag ON ag.id = sa.agreement_id
      WHERE sa.file_url LIKE '%' || storage.objects.name
      AND ag.organisation_id IN (
        SELECT organisation_id FROM organisation_members
        WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  );

CREATE POLICY "Users can upload attachments to their organisation agreements"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'subcontract-attachments'
  );