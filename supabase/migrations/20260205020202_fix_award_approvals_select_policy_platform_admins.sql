/*
  # Fix award_approvals SELECT policy to include platform admins

  1. Changes
    - Drop the existing SELECT policy that only allows organisation members
    - Create new SELECT policy that allows BOTH platform admins AND organisation members
    - This matches the pattern used in UPDATE and INSERT policies

  2. Security
    - Platform admins can view all award approvals (needed for admin dashboard and global management)
    - Organisation members can view approvals in their organisation only
    - Both checks enforced via RLS
*/

-- Drop existing restrictive SELECT policy
DROP POLICY IF EXISTS "Users can view approvals in their organisation" ON award_approvals;

-- Create new SELECT policy that includes platform admins
CREATE POLICY "Users can view approvals in their organisation"
  ON award_approvals
  FOR SELECT
  TO authenticated
  USING (
    -- Platform admins can see all
    (EXISTS (
      SELECT 1
      FROM platform_admins
      WHERE platform_admins.user_id = auth.uid()
        AND platform_admins.is_active = true
    ))
    OR
    -- Organisation members can see their org's approvals
    (EXISTS (
      SELECT 1
      FROM organisation_members
      WHERE organisation_members.organisation_id = award_approvals.organisation_id
        AND organisation_members.user_id = auth.uid()
        AND organisation_members.status = 'active'
    ))
  );
