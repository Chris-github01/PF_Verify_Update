/*
  # Fix platform_admins RLS policies
  
  1. Changes
    - Add INSERT policy for platform admins to add other admins
    - Add UPDATE policy for platform admins to update admin status
    - Add DELETE policy for platform admins to remove admins
    - Add SELECT policy for platform admins to view all admins
  
  2. Security
    - Only active platform admins can manage other platform admins
    - Uses helper function to check if user is an active platform admin
*/

-- First, create a helper function to check if a user is an active platform admin
CREATE OR REPLACE FUNCTION is_active_platform_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM platform_admins
    WHERE user_id = auth.uid()
    AND is_active = true
  );
$$;

-- Drop existing policies
DROP POLICY IF EXISTS "Platform admins can view themselves" ON platform_admins;

-- Add new comprehensive policies
CREATE POLICY "Platform admins can view all admins"
  ON platform_admins
  FOR SELECT
  TO authenticated
  USING (is_active_platform_admin());

CREATE POLICY "Platform admins can add new admins"
  ON platform_admins
  FOR INSERT
  TO authenticated
  WITH CHECK (is_active_platform_admin());

CREATE POLICY "Platform admins can update admin status"
  ON platform_admins
  FOR UPDATE
  TO authenticated
  USING (is_active_platform_admin())
  WITH CHECK (is_active_platform_admin());

CREATE POLICY "Platform admins can remove admins"
  ON platform_admins
  FOR DELETE
  TO authenticated
  USING (is_active_platform_admin());