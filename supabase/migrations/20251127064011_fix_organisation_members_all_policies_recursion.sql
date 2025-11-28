/*
  # Fix all organisation_members policies to prevent recursion
  
  The INSERT/UPDATE/DELETE policies were querying organisation_members
  to check if the user is an owner, causing infinite recursion.
  
  ## Solution
  1. Create a helper function that bypasses RLS using SECURITY DEFINER
  2. Use this function in all policies that need to check membership
  3. Keep SELECT policy simple with direct checks only
  
  ## Security
  - Helper function is SECURITY DEFINER so it bypasses RLS
  - Helper function has secure search_path to prevent injection
  - All policies still enforce proper access control
*/

-- Create helper function to check if user is owner (bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_org_owner(check_org_id uuid, check_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM organisation_members
    WHERE organisation_id = check_org_id
    AND user_id = check_user_id
    AND role = 'owner'
    AND status = 'active'
  );
$$;

-- Create helper function to check if user is platform admin (bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_platform_admin(check_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM platform_admins
    WHERE user_id = check_user_id
    AND is_active = true
  );
$$;

-- Drop and recreate all organisation_members policies without recursion

-- SELECT policy (no recursion - uses auth.uid() and JWT directly)
DROP POLICY IF EXISTS "Users can view memberships" ON organisation_members;
CREATE POLICY "Users can view memberships"
  ON organisation_members FOR SELECT
  TO authenticated
  USING (
    -- User can view their own memberships
    user_id = auth.uid()
    OR
    -- God-Mode users can view all memberships
    COALESCE(
      (auth.jwt() -> 'email')::text IN (
        '"chris@optimalfire.co.nz"',
        '"pieter@optimalfire.co.nz"'
      ),
      false
    )
  );

-- INSERT policy (uses helper function to avoid recursion)
DROP POLICY IF EXISTS "Users can insert memberships in their org" ON organisation_members;
CREATE POLICY "Users can insert memberships in their org"
  ON organisation_members FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Platform admins can add members
    is_platform_admin(auth.uid())
    OR
    -- Organisation owners can add members (uses helper to avoid recursion)
    is_org_owner(organisation_id, auth.uid())
    OR
    -- God-Mode users can add members
    COALESCE(
      (auth.jwt() -> 'email')::text IN (
        '"chris@optimalfire.co.nz"',
        '"pieter@optimalfire.co.nz"'
      ),
      false
    )
  );

-- UPDATE policy (uses helper function to avoid recursion)
DROP POLICY IF EXISTS "Users can update memberships in their org" ON organisation_members;
CREATE POLICY "Users can update memberships in their org"
  ON organisation_members FOR UPDATE
  TO authenticated
  USING (
    -- Platform admins can update members
    is_platform_admin(auth.uid())
    OR
    -- Organisation owners can update members (uses helper to avoid recursion)
    is_org_owner(organisation_id, auth.uid())
    OR
    -- God-Mode users can update members
    COALESCE(
      (auth.jwt() -> 'email')::text IN (
        '"chris@optimalfire.co.nz"',
        '"pieter@optimalfire.co.nz"'
      ),
      false
    )
  );

-- DELETE policy (uses helper function to avoid recursion)
DROP POLICY IF EXISTS "Users can delete memberships in their org" ON organisation_members;
CREATE POLICY "Users can delete memberships in their org"
  ON organisation_members FOR DELETE
  TO authenticated
  USING (
    -- Platform admins can delete members
    is_platform_admin(auth.uid())
    OR
    -- Organisation owners can delete members (uses helper to avoid recursion)
    is_org_owner(organisation_id, auth.uid())
    OR
    -- God-Mode users can delete members
    COALESCE(
      (auth.jwt() -> 'email')::text IN (
        '"chris@optimalfire.co.nz"',
        '"pieter@optimalfire.co.nz"'
      ),
      false
    )
  );
