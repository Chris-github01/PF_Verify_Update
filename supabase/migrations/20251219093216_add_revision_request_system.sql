/*
  # Add Revision Request System

  Creates tables and functions to support requesting quote revisions from suppliers
  in compliance with NZ Government Procurement Rules.

  1. New Tables
    - `revision_requests` - Tracks revision requests sent to suppliers
      - `id` (uuid, primary key)
      - `project_id` (uuid, foreign key to projects)
      - `award_report_id` (uuid, foreign key to award_reports, nullable)
      - `requested_by_user_id` (uuid, references auth.users)
      - `deadline` (timestamptz)
      - `status` (text) - pending, completed, cancelled
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
      - `notes` (text, nullable)

    - `revision_request_suppliers` - Individual supplier revision requests
      - `id` (uuid, primary key)
      - `revision_request_id` (uuid, foreign key to revision_requests)
      - `quote_id` (uuid, foreign key to quotes)
      - `supplier_name` (text)
      - `coverage_percent` (numeric)
      - `gaps_count` (integer)
      - `scope_gaps` (jsonb) - Array of gap details
      - `email_subject` (text)
      - `email_body` (text)
      - `email_sent_at` (timestamptz, nullable)
      - `pdf_generated` (boolean, default false)
      - `pdf_url` (text, nullable)
      - `response_received_at` (timestamptz, nullable)
      - `status` (text) - pending, sent, responded, expired
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Users can view/manage revision requests for their organisation's projects
    - Platform admins can view all revision requests

  3. Indexes
    - Foreign key indexes for performance
    - Status indexes for filtering
*/

-- Create revision_requests table
CREATE TABLE IF NOT EXISTS revision_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  award_report_id uuid REFERENCES award_reports(id) ON DELETE SET NULL,
  requested_by_user_id uuid NOT NULL,
  deadline timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  notes text
);

-- Create revision_request_suppliers table
CREATE TABLE IF NOT EXISTS revision_request_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_request_id uuid NOT NULL REFERENCES revision_requests(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  supplier_name text NOT NULL,
  coverage_percent numeric(5,2) DEFAULT 0,
  gaps_count integer DEFAULT 0,
  scope_gaps jsonb DEFAULT '[]'::jsonb,
  email_subject text NOT NULL,
  email_body text NOT NULL,
  email_sent_at timestamptz,
  pdf_generated boolean DEFAULT false,
  pdf_url text,
  response_received_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'responded', 'expired')),
  created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_revision_requests_project_id ON revision_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_revision_requests_award_report_id ON revision_requests(award_report_id);
CREATE INDEX IF NOT EXISTS idx_revision_requests_status ON revision_requests(status);
CREATE INDEX IF NOT EXISTS idx_revision_requests_deadline ON revision_requests(deadline);

CREATE INDEX IF NOT EXISTS idx_revision_request_suppliers_revision_request_id ON revision_request_suppliers(revision_request_id);
CREATE INDEX IF NOT EXISTS idx_revision_request_suppliers_quote_id ON revision_request_suppliers(quote_id);
CREATE INDEX IF NOT EXISTS idx_revision_request_suppliers_status ON revision_request_suppliers(status);

-- Enable RLS
ALTER TABLE revision_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE revision_request_suppliers ENABLE ROW LEVEL SECURITY;

-- RLS Policies for revision_requests
CREATE POLICY "Users can view revision requests for their organisation projects"
  ON revision_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = revision_requests.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

CREATE POLICY "Platform admins can view all revision requests"
  ON revision_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE platform_admins.user_id = auth.uid()
      AND platform_admins.is_active = true
    )
  );

CREATE POLICY "Users can create revision requests for their organisation projects"
  ON revision_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = revision_requests.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

CREATE POLICY "Users can update revision requests for their organisation projects"
  ON revision_requests FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = revision_requests.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

-- RLS Policies for revision_request_suppliers
CREATE POLICY "Users can view revision request suppliers for their organisation"
  ON revision_request_suppliers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM revision_requests rr
      INNER JOIN projects p ON p.id = rr.project_id
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE rr.id = revision_request_suppliers.revision_request_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

CREATE POLICY "Platform admins can view all revision request suppliers"
  ON revision_request_suppliers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE platform_admins.user_id = auth.uid()
      AND platform_admins.is_active = true
    )
  );

CREATE POLICY "Users can create revision request suppliers for their organisation"
  ON revision_request_suppliers FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM revision_requests rr
      INNER JOIN projects p ON p.id = rr.project_id
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE rr.id = revision_request_suppliers.revision_request_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

CREATE POLICY "Users can update revision request suppliers for their organisation"
  ON revision_request_suppliers FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM revision_requests rr
      INNER JOIN projects p ON p.id = rr.project_id
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE rr.id = revision_request_suppliers.revision_request_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
    )
  );

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_revision_request_updated_at()
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

-- Trigger to update updated_at
DROP TRIGGER IF EXISTS revision_requests_updated_at ON revision_requests;
CREATE TRIGGER revision_requests_updated_at
  BEFORE UPDATE ON revision_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_revision_request_updated_at();
