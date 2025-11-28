/*
  # Add Platform Admin Member Management Policies

  1. Changes
    - Add INSERT policy for platform admins to add members
    - Add UPDATE policy for platform admins to update member roles
    - Add DELETE policy for platform admins to remove members

  2. Security
    - Only platform admins can manage organisation memberships
    - Regular users cannot modify memberships via these policies
*/

-- Platform admins can insert new members
CREATE POLICY "Platform admins can insert members"
  ON organisation_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE platform_admins.user_id = auth.uid()
        AND platform_admins.is_active = true
    )
  );

-- Platform admins can update member roles and status
CREATE POLICY "Platform admins can update members"
  ON organisation_members
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE platform_admins.user_id = auth.uid()
        AND platform_admins.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE platform_admins.user_id = auth.uid()
        AND platform_admins.is_active = true
    )
  );

-- Platform admins can delete members
CREATE POLICY "Platform admins can delete members"
  ON organisation_members
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE platform_admins.user_id = auth.uid()
        AND platform_admins.is_active = true
    )
  );