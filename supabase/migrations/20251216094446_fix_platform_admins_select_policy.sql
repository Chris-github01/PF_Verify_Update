/*
  # Fix Platform Admins SELECT Policy

  1. Changes
    - Add policy so platform admins can view all platform admins (not just themselves)
    - This allows the Platform Admins page to display all admins

  2. Security
    - Only active platform admins can view the full list
*/

-- Drop the restrictive policy that only allows viewing yourself
DROP POLICY IF EXISTS "Platform admins can view themselves" ON platform_admins;

-- Create new policy that allows platform admins to view all platform admins
CREATE POLICY "Platform admins can view all admins"
  ON platform_admins
  FOR SELECT
  TO authenticated
  USING (
    is_platform_admin()
  );

-- Allow platform admins to insert new admins
CREATE POLICY "Platform admins can insert new admins"
  ON platform_admins
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_platform_admin()
  );

-- Allow platform admins to update admin status
CREATE POLICY "Platform admins can update admins"
  ON platform_admins
  FOR UPDATE
  TO authenticated
  USING (
    is_platform_admin()
  )
  WITH CHECK (
    is_platform_admin()
  );

-- Allow platform admins to delete admins
CREATE POLICY "Platform admins can delete admins"
  ON platform_admins
  FOR DELETE
  TO authenticated
  USING (
    is_platform_admin()
  );
