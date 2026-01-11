/*
  # Fix Award Approvals RLS for Updates

  1. Changes
    - Remove 24-hour restriction on updating approvals
    - Allow users to update their approvals at any time
    - Simplifies UPSERT operations

  2. Security
    - Users can still only update their own approvals
    - All other security checks remain in place
*/

-- Drop the restrictive update policy
DROP POLICY IF EXISTS "Users can update recent approvals" ON award_approvals;

-- Create a more permissive update policy
-- Users can update approvals they created in their organisation
CREATE POLICY "Users can update their approvals"
  ON award_approvals
  FOR UPDATE
  TO authenticated
  USING (
    approved_by_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = award_approvals.organisation_id
      AND organisation_members.user_id = auth.uid()
      AND organisation_members.status = 'active'
    )
  )
  WITH CHECK (
    approved_by_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = award_approvals.organisation_id
      AND organisation_members.user_id = auth.uid()
      AND organisation_members.status = 'active'
    )
  );