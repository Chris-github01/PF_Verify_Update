/*
  # Fix Team Invitations Multiple Permissive Policies

  The previous migration still had 2 SELECT policies because the ALL policy includes SELECT.
  This migration separates INSERT/UPDATE/DELETE from SELECT to eliminate the conflict.

  ## Changes
  - Keep consolidated SELECT policy for users and admins
  - Create separate INSERT policy for admins
  - Create separate UPDATE policy for admins
  - Create separate DELETE policy for admins
*/

-- Drop the conflicting ALL policy
DROP POLICY IF EXISTS "Org admins can manage team invitations" ON team_invitations;

-- Keep the consolidated SELECT policy (already exists)
-- "Users can view relevant team invitations" - covers both users and admins

-- Create separate INSERT policy for admins only
CREATE POLICY "Org admins can create team invitations"
  ON team_invitations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_id = team_invitations.organisation_id
      AND user_id = (select auth.uid())
      AND role IN ('owner', 'admin')
      AND status = 'active'
    )
  );

-- Create separate UPDATE policy for admins only
CREATE POLICY "Org admins can update team invitations"
  ON team_invitations FOR UPDATE
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

-- Create separate DELETE policy for admins only
CREATE POLICY "Org admins can delete team invitations"
  ON team_invitations FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_id = team_invitations.organisation_id
      AND user_id = (select auth.uid())
      AND role IN ('owner', 'admin')
      AND status = 'active'
    )
  );
