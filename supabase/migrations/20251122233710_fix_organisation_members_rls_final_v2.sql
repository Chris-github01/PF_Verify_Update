/*
  # Fix organisation_members RLS circular dependency - Final Fix v2
  
  1. Problem
    - The is_org_admin_or_owner function has SECURITY DEFINER but still triggers RLS
    - This causes infinite recursion when checking SELECT permissions
    - Users cannot see their own memberships
  
  2. Solution
    - Drop all dependent policies first
    - Recreate the helper function to properly bypass RLS using plpgsql
    - Recreate all policies with the fixed function
  
  3. Security
    - Function uses SECURITY DEFINER to bypass RLS safely
    - Only checks if user is admin/owner of specific org
    - Does not expose sensitive data beyond what's needed
*/

-- Drop all policies that depend on the function
DROP POLICY IF EXISTS "Users and admins can view memberships" ON organisation_members;
DROP POLICY IF EXISTS "Admins can add members" ON organisation_members;
DROP POLICY IF EXISTS "Admins can update members" ON organisation_members;
DROP POLICY IF EXISTS "Admins can delete members" ON organisation_members;

-- Drop and recreate the helper function with proper RLS bypass
DROP FUNCTION IF EXISTS is_org_admin_or_owner(uuid);

CREATE OR REPLACE FUNCTION is_org_admin_or_owner(org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result boolean;
BEGIN
  -- This function runs with DEFINER privileges and bypasses RLS
  SELECT EXISTS (
    SELECT 1
    FROM organisation_members
    WHERE organisation_id = org_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
      AND status = 'active'
  ) INTO result;
  
  RETURN result;
END;
$$;

-- Recreate all policies

-- SELECT policy - users can see their own memberships
CREATE POLICY "Users and admins can view memberships"
  ON organisation_members
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR is_active_platform_admin()
    OR is_org_admin_or_owner(organisation_id)
  );

-- INSERT policy
CREATE POLICY "Admins can add members"
  ON organisation_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_active_platform_admin()
    OR is_org_admin_or_owner(organisation_id)
  );

-- UPDATE policy
CREATE POLICY "Admins can update members"
  ON organisation_members
  FOR UPDATE
  TO authenticated
  USING (
    is_active_platform_admin()
    OR is_org_admin_or_owner(organisation_id)
  )
  WITH CHECK (
    is_active_platform_admin()
    OR is_org_admin_or_owner(organisation_id)
  );

-- DELETE policy
CREATE POLICY "Admins can delete members"
  ON organisation_members
  FOR DELETE
  TO authenticated
  USING (
    is_active_platform_admin()
    OR is_org_admin_or_owner(organisation_id)
  );
