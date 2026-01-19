/*
  # Fix Award Approvals - Platform Admin INSERT Policy

  1. Problem
    - Current INSERT policy requires approved_by_user_id = auth.uid() for org members
    - But this check is incorrectly applied to platform admins too
    - Platform admins should be able to insert with any approved_by_user_id

  2. Solution
    - Simplify INSERT policy for platform admins
    - Remove the approved_by_user_id requirement for platform admins
    - Keep the requirement for regular users

  3. Security
    - Platform admins can insert approvals for any organisation
    - Regular users must be org members AND set approved_by_user_id to themselves
*/

-- Drop existing INSERT policy
DROP POLICY IF EXISTS "Users can insert approvals in their organisation" ON award_approvals;

-- Recreate INSERT policy with corrected logic
CREATE POLICY "Users can insert approvals in their organisation"
  ON award_approvals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Platform admins can insert into any organisation
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE platform_admins.user_id = auth.uid()
      AND platform_admins.is_active = true
    )
    OR
    -- OR regular users must be members of the organisation
    (
      EXISTS (
        SELECT 1 FROM organisation_members
        WHERE organisation_members.organisation_id = award_approvals.organisation_id
        AND organisation_members.user_id = auth.uid()
        AND organisation_members.status = 'active'
      )
      -- Regular users must set themselves as the approver
      AND approved_by_user_id = auth.uid()
    )
  );
