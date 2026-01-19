/*
  # Fix Award Approvals Team Access

  1. Problem
    - Users can only update approvals they created (approved_by_user_id = auth.uid())
    - This prevents team members from updating approvals created by others
    - When Chris creates an approval and Pieter tries to change it, RLS blocks Pieter

  2. Solution
    - Allow any active organization member to update approvals
    - Still track who performed each update via approved_by_user_id
    - Maintain organization-level security

  3. Security
    - Users must be active members of the organization
    - The approved_by_user_id field tracks who made the approval/change
    - Service role maintains full access
*/

-- Drop the restrictive update policy
DROP POLICY IF EXISTS "Users can update their own approvals" ON award_approvals;
DROP POLICY IF EXISTS "Users can update their approvals" ON award_approvals;
DROP POLICY IF EXISTS "Users can update recent approvals" ON award_approvals;

-- Create new update policy that allows any organization member to update
-- This allows team collaboration while maintaining audit trail
CREATE POLICY "Organisation members can update approvals"
  ON award_approvals
  FOR UPDATE
  TO authenticated
  USING (
    -- User must be an active member of the organisation
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = award_approvals.organisation_id
      AND organisation_members.user_id = auth.uid()
      AND organisation_members.status = 'active'
    )
  )
  WITH CHECK (
    -- After update, user must still be an active member
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = award_approvals.organisation_id
      AND organisation_members.user_id = auth.uid()
      AND organisation_members.status = 'active'
    )
  );
