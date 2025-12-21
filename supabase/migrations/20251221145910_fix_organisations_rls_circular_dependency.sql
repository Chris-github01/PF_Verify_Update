/*
  # Fix Organisations RLS Circular Dependency

  ## Problem
  The SELECT policy on `organisations` queries `organisation_members`, which in turn
  had its own circular dependency. Even though we fixed `organisation_members`, we should
  use the helper function for consistency and avoid any potential issues.

  ## Solution
  1. Drop the existing SELECT policy on organisations
  2. Create new SELECT policy using the helper function we created
  3. This ensures clean, non-circular policy checks

  ## Changes
  - Drop existing SELECT policy on organisations
  - Create new SELECT policy using user_is_member_of_org helper
*/

-- Drop the existing SELECT policy
DROP POLICY IF EXISTS "Users can view their member organisations" ON organisations;

-- Create new SELECT policy without circular dependency
CREATE POLICY "Users can view their member organisations"
  ON organisations
  FOR SELECT
  TO authenticated
  USING (
    -- User is a member of this organisation
    user_is_member_of_org(id, auth.uid())
    OR
    -- Platform admins can see all organisations
    user_is_platform_admin(auth.uid())
  );
