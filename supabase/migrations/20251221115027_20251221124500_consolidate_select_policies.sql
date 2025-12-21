/*
  # Consolidate Multiple Permissive SELECT Policies

  Combines multiple permissive SELECT policies into single policies with OR conditions.
  This resolves the "Multiple Permissive Policies" warning while maintaining the same access control.

  ## Tables Updated
  - team_invitations: Combines admin and invited user policies
  - user_activity_log: Combines admin and user policies
*/

-- ============================================================================
-- TEAM INVITATIONS: Consolidate SELECT policies
-- ============================================================================

-- Drop existing separate policies
DROP POLICY IF EXISTS "Org admins can manage invitations" ON team_invitations;
DROP POLICY IF EXISTS "Users can view invitations sent to their email" ON team_invitations;

-- Create consolidated SELECT policy
CREATE POLICY "Users can view relevant team invitations"
  ON team_invitations FOR SELECT
  TO authenticated
  USING (
    -- Users can see invitations sent to their email
    email = (SELECT email FROM auth.users WHERE id = (select auth.uid()))
    OR
    -- Org admins can see all invitations in their org
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_id = team_invitations.organisation_id
      AND user_id = (select auth.uid())
      AND role IN ('owner', 'admin')
      AND status = 'active'
    )
  );

-- Recreate the INSERT/UPDATE/DELETE policy for admins
CREATE POLICY "Org admins can manage team invitations"
  ON team_invitations FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_id = team_invitations.organisation_id
      AND user_id = (select auth.uid())
      AND role IN ('owner', 'admin')
      AND status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_id = team_invitations.organisation_id
      AND user_id = (select auth.uid())
      AND role IN ('owner', 'admin')
      AND status = 'active'
    )
  );

-- ============================================================================
-- USER ACTIVITY LOG: Consolidate SELECT policies
-- ============================================================================

-- Drop existing separate policies
DROP POLICY IF EXISTS "Org admins can view all org activity" ON user_activity_log;
DROP POLICY IF EXISTS "Users can view their own activity" ON user_activity_log;

-- Create consolidated SELECT policy
CREATE POLICY "Users can view relevant activity logs"
  ON user_activity_log FOR SELECT
  TO authenticated
  USING (
    -- Users can see their own activity
    user_id = (select auth.uid())
    OR
    -- Org admins can see all activity in projects they manage
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = user_activity_log.project_id
      AND om.user_id = (select auth.uid())
      AND om.role IN ('owner', 'admin')
      AND om.status = 'active'
    )
    OR
    -- Org admins can see all activity in their org (when no project_id)
    (
      user_activity_log.project_id IS NULL
      AND EXISTS (
        SELECT 1 FROM organisation_members
        WHERE organisation_id = user_activity_log.organisation_id
        AND user_id = (select auth.uid())
        AND role IN ('owner', 'admin')
        AND status = 'active'
      )
    )
  );
