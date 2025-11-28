/*
  # Fix organisation_members RLS policies for platform admins
  
  1. Changes
    - Simplify INSERT policy to avoid circular dependency
    - Use direct EXISTS checks instead of helper function for platform admins
    - Keep the helper function only for regular org members
  
  2. Security
    - Platform admins can manage all organisation members
    - Organisation admins/owners can manage their own organisation's members
*/

-- Drop all existing policies on organisation_members
DROP POLICY IF EXISTS "Users see own memberships" ON organisation_members;
DROP POLICY IF EXISTS "Platform admins see all memberships" ON organisation_members;
DROP POLICY IF EXISTS "Admins can add members" ON organisation_members;
DROP POLICY IF EXISTS "Platform admins can insert members" ON organisation_members;
DROP POLICY IF EXISTS "Admins can update members" ON organisation_members;
DROP POLICY IF EXISTS "Platform admins can update members" ON organisation_members;
DROP POLICY IF EXISTS "Admins can delete members" ON organisation_members;
DROP POLICY IF EXISTS "Platform admins can delete members" ON organisation_members;

-- SELECT policies
CREATE POLICY "Users can view own memberships"
  ON organisation_members
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR is_active_platform_admin()
  );

CREATE POLICY "Org admins can view their org members"
  ON organisation_members
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organisation_members om
      WHERE om.organisation_id = organisation_members.organisation_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
        AND om.status = 'active'
    )
  );

-- INSERT policy
CREATE POLICY "Platform admins and org admins can add members"
  ON organisation_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Platform admins can add anyone
    is_active_platform_admin()
    OR
    -- Org admins can add members to their org
    EXISTS (
      SELECT 1 FROM organisation_members om
      WHERE om.organisation_id = organisation_members.organisation_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
        AND om.status = 'active'
    )
  );

-- UPDATE policy
CREATE POLICY "Platform admins and org admins can update members"
  ON organisation_members
  FOR UPDATE
  TO authenticated
  USING (
    is_active_platform_admin()
    OR
    EXISTS (
      SELECT 1 FROM organisation_members om
      WHERE om.organisation_id = organisation_members.organisation_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
        AND om.status = 'active'
    )
  )
  WITH CHECK (
    is_active_platform_admin()
    OR
    EXISTS (
      SELECT 1 FROM organisation_members om
      WHERE om.organisation_id = organisation_members.organisation_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
        AND om.status = 'active'
    )
  );

-- DELETE policy
CREATE POLICY "Platform admins and org admins can delete members"
  ON organisation_members
  FOR DELETE
  TO authenticated
  USING (
    is_active_platform_admin()
    OR
    EXISTS (
      SELECT 1 FROM organisation_members om
      WHERE om.organisation_id = organisation_members.organisation_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
        AND om.status = 'active'
    )
  );