/*
  # Fix Organisation Members RLS Infinite Recursion

  1. Problem
    - The SELECT policy on organisation_members references itself, causing infinite recursion
    - Users cannot view their own memberships due to this circular dependency

  2. Solution
    - Create a security definer function that bypasses RLS to check membership
    - Replace the recursive policy with one that uses the helper function
    
  3. Security
    - Helper function is security definer and bypasses RLS safely
    - Only returns boolean, no data exposure
    - Policy still enforces proper access control
*/

-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can view members of their organisations" ON organisation_members;

-- Create a helper function that bypasses RLS to check if user is member of an org
CREATE OR REPLACE FUNCTION is_organisation_member(org_id uuid, user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM organisation_members
    WHERE organisation_id = org_id 
      AND organisation_members.user_id = is_organisation_member.user_id
      AND status = 'active'
  );
$$;

-- Create a new policy that uses the helper function (no recursion)
CREATE POLICY "Users can view members of their organisations"
  ON organisation_members
  FOR SELECT
  TO authenticated
  USING (
    is_organisation_member(organisation_id, auth.uid())
  );
