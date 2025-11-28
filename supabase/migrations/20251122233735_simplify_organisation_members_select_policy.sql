/*
  # Simplify organisation_members SELECT policy to fix circular dependency
  
  1. Problem
    - SECURITY DEFINER functions still respect RLS in PostgreSQL
    - The is_org_admin_or_owner check causes infinite recursion
    - Users cannot see their own memberships
  
  2. Solution
    - Simplify SELECT policy to prioritize direct user_id check
    - Make platform admin check separate and simple
    - Remove the recursive org admin check from SELECT (not needed for viewing own membership)
    - Org admins only need the special check for INSERT/UPDATE/DELETE of OTHER users
  
  3. Security
    - Users can always see their own memberships (user_id = auth.uid())
    - Platform admins can see all memberships
    - This is sufficient for the organisation picker to work
*/

-- Drop and recreate SELECT policy without the circular dependency
DROP POLICY IF EXISTS "Users and admins can view memberships" ON organisation_members;

CREATE POLICY "Users can view memberships"
  ON organisation_members
  FOR SELECT
  TO authenticated
  USING (
    -- Users can see their own memberships
    user_id = auth.uid()
    -- Platform admins can see all memberships
    OR is_active_platform_admin()
  );
