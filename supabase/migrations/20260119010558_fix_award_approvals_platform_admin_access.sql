/*
  # Fix Award Approvals - Add Platform Admin Access

  1. Problem
    - Platform admins (like Pieter) can VIEW all organisations via god-mode
    - But they can't INSERT/UPDATE approvals because they lack organisation_members records
    - RLS policies require actual membership, blocking platform admins

  2. Solution
    - Update INSERT and UPDATE policies to allow platform admins
    - Check if user is a platform admin OR an organisation member
    - Maintain security while enabling platform admin capabilities

  3. Security
    - Regular users still require organisation membership
    - Platform admins can manage approvals across all organisations
    - Audit trail maintained via approved_by_user_id
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Users can insert approvals in their organisation" ON award_approvals;
DROP POLICY IF EXISTS "Organisation members can update approvals" ON award_approvals;

-- Recreate INSERT policy with platform admin support
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
    -- OR user must be an active member of the organisation
    (
      EXISTS (
        SELECT 1 FROM organisation_members
        WHERE organisation_members.organisation_id = award_approvals.organisation_id
        AND organisation_members.user_id = auth.uid()
        AND organisation_members.status = 'active'
      )
      AND approved_by_user_id = auth.uid()
    )
  );

-- Recreate UPDATE policy with platform admin support
CREATE POLICY "Organisation members can update approvals"
  ON award_approvals
  FOR UPDATE
  TO authenticated
  USING (
    -- Platform admins can update any approval
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE platform_admins.user_id = auth.uid()
      AND platform_admins.is_active = true
    )
    OR
    -- OR user must be an active member of the organisation
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = award_approvals.organisation_id
      AND organisation_members.user_id = auth.uid()
      AND organisation_members.status = 'active'
    )
  )
  WITH CHECK (
    -- Platform admins can update to any state
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE platform_admins.user_id = auth.uid()
      AND platform_admins.is_active = true
    )
    OR
    -- OR user must be an active member of the organisation
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = award_approvals.organisation_id
      AND organisation_members.user_id = auth.uid()
      AND organisation_members.status = 'active'
    )
  );
