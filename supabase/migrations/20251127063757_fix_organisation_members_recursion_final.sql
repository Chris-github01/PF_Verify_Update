/*
  # Fix organisation_members infinite recursion
  
  The "God-Mode owners can view all memberships" policy was querying
  organisation_members within itself, causing infinite recursion.
  
  ## Solution
  Replace the recursive policy with a direct email check using auth.jwt()
  which doesn't cause recursion since it doesn't query the table itself.
  
  ## Changes
  - Drop the problematic God-Mode policy
  - Create new policy using direct email check from JWT
  - Keep the simple "view own memberships" policy as-is
*/

-- Drop the problematic recursive policy
DROP POLICY IF EXISTS "God-Mode owners can view all memberships" ON organisation_members;

-- Create new non-recursive God-Mode policy using direct JWT email check
CREATE POLICY "God-Mode users can view all memberships"
  ON organisation_members FOR SELECT
  TO authenticated
  USING (
    COALESCE(
      (auth.jwt() -> 'email')::text IN (
        '"chris@optimalfire.co.nz"',
        '"pieter@optimalfire.co.nz"'
      ),
      false
    )
  );

-- The "Users can view their own memberships" policy is fine as-is
-- It doesn't cause recursion because it only checks user_id against auth.uid()
