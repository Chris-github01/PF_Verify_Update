/*
  # Fix Organisation Members RLS Circular Dependency

  ## Problem
  The SELECT policy on `organisation_members` has a circular dependency:
  - It queries `organisation_members` to check if user has access
  - But it needs access to query `organisation_members` in the first place
  - This causes the policy to fail, preventing users from seeing their organizations

  ## Solution
  1. Create a helper function that bypasses RLS to check membership
  2. Replace the circular SELECT policy with one that uses the helper function
  3. This allows users to see their own memberships without circular dependencies

  ## Changes
  - Drop existing SELECT policy on organisation_members
  - Create helper function to check if user is member of org (with SECURITY DEFINER)
  - Create new SELECT policy using the helper function
*/

-- Drop the problematic SELECT policy
DROP POLICY IF EXISTS "Users can view members of their organisations" ON organisation_members;

-- Create helper function to check if user is a member of an org (bypasses RLS)
CREATE OR REPLACE FUNCTION public.user_is_member_of_org(org_id uuid, check_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM organisation_members 
    WHERE organisation_id = org_id 
      AND user_id = check_user_id 
      AND status = 'active'
  );
END;
$$;

-- Create helper function to check if user is platform admin (bypasses RLS)
CREATE OR REPLACE FUNCTION public.user_is_platform_admin(check_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM platform_admins 
    WHERE user_id = check_user_id 
      AND is_active = true
  );
END;
$$;

-- Create new SELECT policy without circular dependency
CREATE POLICY "Users can view their own memberships"
  ON organisation_members
  FOR SELECT
  TO authenticated
  USING (
    -- User can see their own membership record
    user_id = auth.uid()
    OR
    -- User can see memberships in orgs where they are a member
    user_is_member_of_org(organisation_id, auth.uid())
    OR
    -- Platform admins can see all memberships
    user_is_platform_admin(auth.uid())
  );

-- Grant execute permissions on helper functions
GRANT EXECUTE ON FUNCTION public.user_is_member_of_org(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_is_platform_admin(uuid) TO authenticated;
