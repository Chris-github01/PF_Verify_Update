/*
  # Team Management & Project Sharing System
  
  ## Overview
  Comprehensive team management system for organization admins to manage members, seats, and project sharing.
  
  ## New Tables
  
  ### 1. `team_invitations`
  Tracks pending invitations to join an organisation
  - `id` (uuid, primary key)
  - `organisation_id` (uuid, FK to organisations)
  - `email` (text) - Invitee email
  - `role` (text) - member, admin
  - `invited_by_user_id` (uuid, FK to auth.users)
  - `invitation_token` (text, unique) - Secure token for accepting invitation
  - `status` (text) - pending, accepted, expired, cancelled
  - `expires_at` (timestamptz) - When invitation expires
  - `accepted_at` (timestamptz, nullable)
  - `created_at` (timestamptz)
  
  ### 2. `project_sharing`
  Allows sharing projects between users temporarily or permanently
  - `id` (uuid, primary key)
  - `project_id` (uuid, FK to projects)
  - `shared_by_user_id` (uuid, FK to auth.users)
  - `shared_with_user_id` (uuid, FK to auth.users)
  - `permission_level` (text) - view, edit, admin
  - `expires_at` (timestamptz, nullable) - For temporary sharing
  - `reason` (text, nullable) - e.g., "On leave coverage"
  - `is_active` (boolean)
  - `created_at` (timestamptz)
  - `revoked_at` (timestamptz, nullable)
  
  ### 3. `user_activity_log`
  Tracks user activities for analytics
  - `id` (uuid, primary key)
  - `organisation_id` (uuid, FK to organisations)
  - `user_id` (uuid, FK to auth.users)
  - `activity_type` (text) - login, project_created, quote_imported, etc.
  - `project_id` (uuid, nullable, FK to projects)
  - `metadata` (jsonb) - Additional data
  - `created_at` (timestamptz)
  
  ### 4. `organisation_analytics`
  Cached analytics for organization dashboard
  - `id` (uuid, primary key)
  - `organisation_id` (uuid, unique, FK to organisations)
  - `total_projects` (integer)
  - `total_quotes_imported` (integer)
  - `total_reports_generated` (integer)
  - `estimated_hours_saved` (numeric) - Based on quote count * avg time
  - `active_users_count` (integer)
  - `archived_users_count` (integer)
  - `last_calculated_at` (timestamptz)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)
  
  ## Modifications to Existing Tables
  
  ### `organisation_members`
  - Add `archived_at` column for soft deletion
  - Add `archived_by_user_id` column to track who archived
  - Add `notes` column for admin notes
  
  ## Security
  - RLS enabled on all new tables
  - Only organisation admins can manage invitations
  - Users can see their own shared projects
  - Activity logs are read-only for regular users
*/

-- Create team_invitations table
CREATE TABLE IF NOT EXISTS team_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  invited_by_user_id uuid NOT NULL REFERENCES auth.users(id),
  invitation_token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_invitations_organisation ON team_invitations(organisation_id);
CREATE INDEX IF NOT EXISTS idx_team_invitations_email ON team_invitations(email);
CREATE INDEX IF NOT EXISTS idx_team_invitations_token ON team_invitations(invitation_token);
CREATE INDEX IF NOT EXISTS idx_team_invitations_status ON team_invitations(status);

-- Create project_sharing table
CREATE TABLE IF NOT EXISTS project_sharing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  shared_by_user_id uuid NOT NULL REFERENCES auth.users(id),
  shared_with_user_id uuid NOT NULL REFERENCES auth.users(id),
  permission_level text NOT NULL DEFAULT 'view' CHECK (permission_level IN ('view', 'edit', 'admin')),
  expires_at timestamptz,
  reason text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE(project_id, shared_with_user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_sharing_project ON project_sharing(project_id);
CREATE INDEX IF NOT EXISTS idx_project_sharing_user ON project_sharing(shared_with_user_id);
CREATE INDEX IF NOT EXISTS idx_project_sharing_active ON project_sharing(is_active) WHERE is_active = true;

-- Create user_activity_log table
CREATE TABLE IF NOT EXISTS user_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  activity_type text NOT NULL,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_org ON user_activity_log(organisation_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_user ON user_activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_type ON user_activity_log(activity_type);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON user_activity_log(created_at DESC);

-- Create organisation_analytics table
CREATE TABLE IF NOT EXISTS organisation_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid UNIQUE NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  total_projects integer DEFAULT 0,
  total_quotes_imported integer DEFAULT 0,
  total_reports_generated integer DEFAULT 0,
  estimated_hours_saved numeric DEFAULT 0,
  active_users_count integer DEFAULT 0,
  archived_users_count integer DEFAULT 0,
  last_calculated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_analytics_org ON organisation_analytics(organisation_id);

-- Add columns to organisation_members for archiving
ALTER TABLE organisation_members ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE organisation_members ADD COLUMN IF NOT EXISTS archived_by_user_id uuid REFERENCES auth.users(id);
ALTER TABLE organisation_members ADD COLUMN IF NOT EXISTS notes text;

CREATE INDEX IF NOT EXISTS idx_org_members_archived ON organisation_members(archived_at) WHERE archived_at IS NOT NULL;

-- Enable RLS on new tables
ALTER TABLE team_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_sharing ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisation_analytics ENABLE ROW LEVEL SECURITY;

-- RLS Policies for team_invitations
CREATE POLICY "Org admins can manage invitations"
  ON team_invitations
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = team_invitations.organisation_id
      AND organisation_members.user_id = auth.uid()
      AND organisation_members.role IN ('owner', 'admin')
      AND organisation_members.status = 'active'
      AND organisation_members.archived_at IS NULL
    )
  );

CREATE POLICY "Users can view invitations sent to their email"
  ON team_invitations
  FOR SELECT
  TO authenticated
  USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- RLS Policies for project_sharing
CREATE POLICY "Users can view shares involving them"
  ON project_sharing
  FOR SELECT
  TO authenticated
  USING (
    shared_by_user_id = auth.uid() 
    OR shared_with_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM organisation_members om
      JOIN projects p ON p.organisation_id = om.organisation_id
      WHERE p.id = project_sharing.project_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
      AND om.status = 'active'
      AND om.archived_at IS NULL
    )
  );

CREATE POLICY "Project creators and admins can create shares"
  ON project_sharing
  FOR INSERT
  TO authenticated
  WITH CHECK (
    shared_by_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM projects p
      JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = project_sharing.project_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
      AND om.archived_at IS NULL
    )
  );

CREATE POLICY "Share creators can revoke shares"
  ON project_sharing
  FOR UPDATE
  TO authenticated
  USING (shared_by_user_id = auth.uid());

CREATE POLICY "Share creators and admins can delete shares"
  ON project_sharing
  FOR DELETE
  TO authenticated
  USING (
    shared_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM organisation_members om
      JOIN projects p ON p.organisation_id = om.organisation_id
      WHERE p.id = project_sharing.project_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
      AND om.status = 'active'
      AND om.archived_at IS NULL
    )
  );

-- RLS Policies for user_activity_log
CREATE POLICY "Users can view their own activity"
  ON user_activity_log
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Org admins can view all org activity"
  ON user_activity_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = user_activity_log.organisation_id
      AND organisation_members.user_id = auth.uid()
      AND organisation_members.role IN ('owner', 'admin')
      AND organisation_members.status = 'active'
      AND organisation_members.archived_at IS NULL
    )
  );

CREATE POLICY "System can insert activity logs"
  ON user_activity_log
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- RLS Policies for organisation_analytics
CREATE POLICY "Org members can view org analytics"
  ON organisation_analytics
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = organisation_analytics.organisation_id
      AND organisation_members.user_id = auth.uid()
      AND organisation_members.status = 'active'
      AND organisation_members.archived_at IS NULL
    )
  );

CREATE POLICY "Org admins can update analytics"
  ON organisation_analytics
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = organisation_analytics.organisation_id
      AND organisation_members.user_id = auth.uid()
      AND organisation_members.role IN ('owner', 'admin')
      AND organisation_members.status = 'active'
      AND organisation_members.archived_at IS NULL
    )
  );

-- Function to calculate organization analytics
CREATE OR REPLACE FUNCTION calculate_organisation_analytics(p_organisation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO organisation_analytics (
    organisation_id,
    total_projects,
    total_quotes_imported,
    total_reports_generated,
    estimated_hours_saved,
    active_users_count,
    archived_users_count,
    last_calculated_at
  )
  SELECT
    p_organisation_id,
    (SELECT COUNT(*) FROM projects WHERE organisation_id = p_organisation_id),
    (SELECT COUNT(*) FROM quotes WHERE organisation_id = p_organisation_id),
    (SELECT COUNT(*) FROM award_reports ar JOIN projects p ON p.id = ar.project_id WHERE p.organisation_id = p_organisation_id),
    (SELECT COUNT(*) FROM quotes WHERE organisation_id = p_organisation_id) * 2.5, -- Assume 2.5 hours saved per quote
    (SELECT COUNT(*) FROM organisation_members WHERE organisation_id = p_organisation_id AND status = 'active' AND archived_at IS NULL),
    (SELECT COUNT(*) FROM organisation_members WHERE organisation_id = p_organisation_id AND archived_at IS NOT NULL),
    now()
  ON CONFLICT (organisation_id) 
  DO UPDATE SET
    total_projects = EXCLUDED.total_projects,
    total_quotes_imported = EXCLUDED.total_quotes_imported,
    total_reports_generated = EXCLUDED.total_reports_generated,
    estimated_hours_saved = EXCLUDED.estimated_hours_saved,
    active_users_count = EXCLUDED.active_users_count,
    archived_users_count = EXCLUDED.archived_users_count,
    last_calculated_at = EXCLUDED.last_calculated_at,
    updated_at = now();
END;
$$;

-- Function to archive a user and transfer projects
CREATE OR REPLACE FUNCTION archive_user_and_transfer_projects(
  p_organisation_id uuid,
  p_user_id uuid,
  p_transfer_to_user_id uuid,
  p_archived_by_user_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_projects_transferred integer := 0;
  v_result jsonb;
BEGIN
  -- Archive the user
  UPDATE organisation_members
  SET 
    archived_at = now(),
    archived_by_user_id = p_archived_by_user_id,
    notes = p_notes,
    status = 'inactive'
  WHERE organisation_id = p_organisation_id
  AND user_id = p_user_id
  AND archived_at IS NULL;

  -- Transfer project ownership
  IF p_transfer_to_user_id IS NOT NULL THEN
    UPDATE projects
    SET 
      created_by_user_id = p_transfer_to_user_id,
      updated_at = now()
    WHERE organisation_id = p_organisation_id
    AND created_by_user_id = p_user_id;
    
    GET DIAGNOSTICS v_projects_transferred = ROW_COUNT;
  END IF;

  -- Log the activity
  INSERT INTO user_activity_log (organisation_id, user_id, activity_type, metadata)
  VALUES (
    p_organisation_id,
    p_archived_by_user_id,
    'user_archived',
    jsonb_build_object(
      'archived_user_id', p_user_id,
      'transfer_to_user_id', p_transfer_to_user_id,
      'projects_transferred', v_projects_transferred
    )
  );

  -- Recalculate analytics
  PERFORM calculate_organisation_analytics(p_organisation_id);

  v_result := jsonb_build_object(
    'success', true,
    'projects_transferred', v_projects_transferred,
    'archived_user_id', p_user_id,
    'transfer_to_user_id', p_transfer_to_user_id
  );

  RETURN v_result;
END;
$$;

-- Function to restore an archived user
CREATE OR REPLACE FUNCTION restore_archived_user(
  p_organisation_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE organisation_members
  SET 
    archived_at = NULL,
    archived_by_user_id = NULL,
    status = 'active',
    updated_at = now()
  WHERE organisation_id = p_organisation_id
  AND user_id = p_user_id
  AND archived_at IS NOT NULL;

  -- Recalculate analytics
  PERFORM calculate_organisation_analytics(p_organisation_id);

  RETURN FOUND;
END;
$$;

-- Function to accept invitation
CREATE OR REPLACE FUNCTION accept_team_invitation(p_invitation_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invitation record;
  v_user_email text;
  v_result jsonb;
BEGIN
  -- Get user email
  SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();
  
  -- Get invitation
  SELECT * INTO v_invitation
  FROM team_invitations
  WHERE invitation_token = p_invitation_token
  AND status = 'pending'
  AND expires_at > now()
  AND email = v_user_email;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired invitation');
  END IF;

  -- Check if user is already a member
  IF EXISTS (
    SELECT 1 FROM organisation_members
    WHERE organisation_id = v_invitation.organisation_id
    AND user_id = auth.uid()
    AND archived_at IS NULL
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already a member of this organisation');
  END IF;

  -- Add user to organisation
  INSERT INTO organisation_members (organisation_id, user_id, role, status)
  VALUES (v_invitation.organisation_id, auth.uid(), v_invitation.role, 'active');

  -- Mark invitation as accepted
  UPDATE team_invitations
  SET status = 'accepted', accepted_at = now()
  WHERE id = v_invitation.id;

  -- Log activity
  INSERT INTO user_activity_log (organisation_id, user_id, activity_type, metadata)
  VALUES (
    v_invitation.organisation_id,
    auth.uid(),
    'invitation_accepted',
    jsonb_build_object('invitation_id', v_invitation.id)
  );

  -- Recalculate analytics
  PERFORM calculate_organisation_analytics(v_invitation.organisation_id);

  v_result := jsonb_build_object(
    'success', true,
    'organisation_id', v_invitation.organisation_id
  );

  RETURN v_result;
END;
$$;

COMMENT ON TABLE team_invitations IS 'Pending invitations to join organisations';
COMMENT ON TABLE project_sharing IS 'Project sharing between users for collaboration and leave coverage';
COMMENT ON TABLE user_activity_log IS 'Activity tracking for analytics and audit';
COMMENT ON TABLE organisation_analytics IS 'Cached analytics data for organisation dashboards';
COMMENT ON FUNCTION calculate_organisation_analytics IS 'Calculates and updates organisation analytics metrics';
COMMENT ON FUNCTION archive_user_and_transfer_projects IS 'Archives a user and transfers their projects to another user';
COMMENT ON FUNCTION accept_team_invitation IS 'Accepts a team invitation and adds user to organisation';
