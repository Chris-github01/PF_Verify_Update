/*
  # Add Award Approvals System

  1. New Tables
    - `award_approvals`
      - `id` (uuid, primary key)
      - `award_report_id` (uuid, foreign key to award_reports)
      - `project_id` (uuid, foreign key to projects)
      - `organisation_id` (uuid, foreign key to organisations)
      - `ai_recommended_supplier` (text) - The AI's top recommendation
      - `final_approved_supplier` (text) - The supplier actually approved
      - `final_approved_quote_id` (uuid, nullable) - Link to approved quote
      - `is_override` (boolean) - True if final differs from AI recommendation
      - `override_reason_category` (text) - Category: "Past Relationship", "Not Variation Hungry", etc.
      - `override_reason_detail` (text) - Detailed explanation
      - `approved_by_user_id` (uuid, foreign key to auth.users)
      - `approved_at` (timestamptz)
      - `weighted_score_difference` (numeric) - Score gap between top 2 suppliers
      - `metadata_json` (jsonb) - Additional context (top 3 suppliers, scores, etc.)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `award_approvals` table
    - Add policies for authenticated users in same organisation
*/

-- Create award_approvals table
CREATE TABLE IF NOT EXISTS award_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  award_report_id uuid NOT NULL REFERENCES award_reports(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,

  ai_recommended_supplier text NOT NULL,
  final_approved_supplier text NOT NULL,
  final_approved_quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL,

  is_override boolean NOT NULL DEFAULT false,
  override_reason_category text,
  override_reason_detail text,

  approved_by_user_id uuid NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT now(),

  weighted_score_difference numeric,
  metadata_json jsonb DEFAULT '{}'::jsonb,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_award_approvals_report_id ON award_approvals(award_report_id);
CREATE INDEX IF NOT EXISTS idx_award_approvals_project_id ON award_approvals(project_id);
CREATE INDEX IF NOT EXISTS idx_award_approvals_organisation_id ON award_approvals(organisation_id);
CREATE INDEX IF NOT EXISTS idx_award_approvals_approved_by ON award_approvals(approved_by_user_id);
CREATE INDEX IF NOT EXISTS idx_award_approvals_is_override ON award_approvals(is_override);
CREATE INDEX IF NOT EXISTS idx_award_approvals_approved_at ON award_approvals(approved_at DESC);

-- Enable RLS
ALTER TABLE award_approvals ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view approvals in their organisation
CREATE POLICY "Users can view approvals in their organisation"
  ON award_approvals
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = award_approvals.organisation_id
      AND organisation_members.user_id = auth.uid()
      AND organisation_members.status = 'active'
    )
  );

-- Policy: Users can create approvals in their organisation
CREATE POLICY "Users can create approvals in their organisation"
  ON award_approvals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = award_approvals.organisation_id
      AND organisation_members.user_id = auth.uid()
      AND organisation_members.status = 'active'
    )
    AND approved_by_user_id = auth.uid()
  );

-- Policy: Users can update their own approvals within 24 hours
CREATE POLICY "Users can update recent approvals"
  ON award_approvals
  FOR UPDATE
  TO authenticated
  USING (
    approved_by_user_id = auth.uid()
    AND approved_at > now() - interval '24 hours'
  )
  WITH CHECK (
    approved_by_user_id = auth.uid()
  );

-- Policy: Service role bypass
CREATE POLICY "Service role has full access to award_approvals"
  ON award_approvals
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add approved_supplier_id to award_reports table for quick reference
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'award_reports' AND column_name = 'approved_supplier_id'
  ) THEN
    ALTER TABLE award_reports ADD COLUMN approved_supplier_id text;
  END IF;
END $$;

-- Add approved_at to award_reports
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'award_reports' AND column_name = 'approved_at'
  ) THEN
    ALTER TABLE award_reports ADD COLUMN approved_at timestamptz;
  END IF;
END $$;

-- Add approval_id reference to award_reports
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'award_reports' AND column_name = 'approval_id'
  ) THEN
    ALTER TABLE award_reports ADD COLUMN approval_id uuid REFERENCES award_approvals(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create function to get approval audit trail for a project
CREATE OR REPLACE FUNCTION get_project_approval_audit_trail(p_project_id uuid)
RETURNS TABLE (
  approval_id uuid,
  report_id uuid,
  ai_recommended text,
  final_approved text,
  is_override boolean,
  override_reason text,
  override_detail text,
  approved_by_email text,
  approved_at timestamptz,
  score_difference numeric,
  report_created_at timestamptz
) SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    aa.id,
    aa.award_report_id,
    aa.ai_recommended_supplier,
    aa.final_approved_supplier,
    aa.is_override,
    aa.override_reason_category,
    aa.override_reason_detail,
    u.email,
    aa.approved_at,
    aa.weighted_score_difference,
    ar.created_at
  FROM award_approvals aa
  LEFT JOIN award_reports ar ON ar.id = aa.award_report_id
  LEFT JOIN auth.users u ON u.id = aa.approved_by_user_id
  WHERE aa.project_id = p_project_id
  ORDER BY aa.approved_at DESC;
END;
$$;

-- Create function to check if close scores warrant review
CREATE OR REPLACE FUNCTION check_close_scores(
  p_top_score numeric,
  p_second_score numeric,
  p_threshold numeric DEFAULT 10
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN (p_top_score - p_second_score) <= p_threshold;
END;
$$;

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_award_approvals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER award_approvals_updated_at
  BEFORE UPDATE ON award_approvals
  FOR EACH ROW
  EXECUTE FUNCTION update_award_approvals_updated_at();
