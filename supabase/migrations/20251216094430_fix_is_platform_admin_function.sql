/*
  # Fix is_platform_admin Function to Bypass RLS

  1. Changes
    - Update is_platform_admin() function to use SECURITY DEFINER
    - Set row_security to 'off' so it can check platform_admins table without RLS interference
    - This allows the function to work correctly when called from other SECURITY DEFINER functions

  2. Security
    - Function only returns boolean, no data leakage
    - Only checks if current user is an active platform admin
*/

-- Drop and recreate the no-parameter version with SECURITY DEFINER
DROP FUNCTION IF EXISTS is_platform_admin();

CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
SET row_security = off
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM platform_admins
    WHERE user_id = auth.uid()
    AND is_active = true
  );
END;
$$;

COMMENT ON FUNCTION is_platform_admin() IS 'Check if current user is an active platform admin, bypasses RLS';
