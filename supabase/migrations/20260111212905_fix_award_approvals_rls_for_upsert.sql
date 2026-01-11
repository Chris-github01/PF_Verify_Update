/*
  # Fix Award Approvals RLS for UPSERT Operations

  1. Problem
    - UPSERT operations are failing with RLS policy violations
    - Conflicting or overly restrictive policies

  2. Solution
    - Drop all existing user policies
    - Create simplified policies that work with UPSERT
    - Ensure INSERT and UPDATE checks are compatible

  3. Security
    - Users can only create/update approvals in their organisation
    - Users can only approve with their own user_id
    - Service role maintains full access
*/

-- Drop all existing policies for award_approvals (except service role)
DROP POLICY IF EXISTS "Users can view approvals in their organisation" ON award_approvals;
DROP POLICY IF EXISTS "Users can create approvals in their organisation" ON award_approvals;
DROP POLICY IF EXISTS "Users can update recent approvals" ON award_approvals;
DROP POLICY IF EXISTS "Users can update their approvals" ON award_approvals;

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

-- Policy: Users can insert approvals in their organisation
-- This is used when UPSERT creates a new record
CREATE POLICY "Users can insert approvals in their organisation"
  ON award_approvals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- User must be an active member of the organisation
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = award_approvals.organisation_id
      AND organisation_members.user_id = auth.uid()
      AND organisation_members.status = 'active'
    )
    -- The approval must be recorded under the current user's ID
    AND approved_by_user_id = auth.uid()
  );

-- Policy: Users can update approvals they created
-- This is used when UPSERT updates an existing record
CREATE POLICY "Users can update their own approvals"
  ON award_approvals
  FOR UPDATE
  TO authenticated
  USING (
    -- Can only update records they created
    approved_by_user_id = auth.uid()
    -- Must still be an active member of the organisation
    AND EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = award_approvals.organisation_id
      AND organisation_members.user_id = auth.uid()
      AND organisation_members.status = 'active'
    )
  )
  WITH CHECK (
    -- After update, still must be their record
    approved_by_user_id = auth.uid()
    -- And still in the organisation
    AND EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = award_approvals.organisation_id
      AND organisation_members.user_id = auth.uid()
      AND organisation_members.status = 'active'
    )
  );