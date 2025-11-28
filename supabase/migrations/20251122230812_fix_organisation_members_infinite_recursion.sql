/*
  # Fix infinite recursion in organisation_members policies
  
  1. Problem
    - The SELECT policy with EXISTS subquery causes infinite recursion
    - When checking if user is org admin, it queries organisation_members again
    - This triggers the same policy, creating infinite loop
  
  2. Solution
    - Use SECURITY DEFINER helper function that bypasses RLS
    - Function queries organisation_members without triggering policies
    - Break the circular dependency completely
  
  3. Security
    - Platform admins can manage all members
    - Organisation admins can manage their org's members
    - Users can view their own memberships
*/

-- Create a helper function that bypasses RLS to check org admin status
CREATE OR REPLACE FUNCTION is_org_admin_or_owner(org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM organisation_members
    WHERE organisation_id = org_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
      AND status = 'active'
  );
$$;

-- Drop all existing policies on organisation_members
DROP POLICY IF EXISTS "Users can view own memberships" ON organisation_members;
DROP POLICY IF EXISTS "Org admins can view their org members" ON organisation_members;
DROP POLICY IF EXISTS "Platform admins and org admins can add members" ON organisation_members;
DROP POLICY IF EXISTS "Platform admins and org admins can update members" ON organisation_members;
DROP POLICY IF EXISTS "Platform admins and org admins can delete members" ON organisation_members;

-- SELECT policies - simplified to avoid recursion
CREATE POLICY "Users and admins can view memberships"
  ON organisation_members
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR is_active_platform_admin()
    OR is_org_admin_or_owner(organisation_id)
  );

-- INSERT policy - using helper function
CREATE POLICY "Admins can add members"
  ON organisation_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_active_platform_admin()
    OR is_org_admin_or_owner(organisation_id)
  );

-- UPDATE policy - using helper function
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

-- DELETE policy - using helper function
CREATE POLICY "Admins can delete members"
  ON organisation_members
  FOR DELETE
  TO authenticated
  USING (
    is_active_platform_admin()
    OR is_org_admin_or_owner(organisation_id)
  );