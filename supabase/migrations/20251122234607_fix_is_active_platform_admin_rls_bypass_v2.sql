/*
  # Fix is_active_platform_admin to truly bypass RLS - v2
  
  1. Problem
    - is_active_platform_admin() queries platform_admins table
    - platform_admins table has RLS that checks is_active_platform_admin()
    - Even with SECURITY DEFINER, RLS is still applied by default
    - Creates infinite recursion
  
  2. Solution
    - Use CREATE OR REPLACE to update function without dropping
    - Change from SQL to PLPGSQL for better RLS bypass
    - Grant execute permission to authenticated users
  
  3. Security
    - Function only returns boolean (is user an active admin)
    - Does not expose sensitive data
    - Only checks for current authenticated user (auth.uid())
*/

-- Recreate function with PLPGSQL to ensure RLS bypass
CREATE OR REPLACE FUNCTION is_active_platform_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  is_admin boolean;
BEGIN
  -- This query runs with function owner privileges (bypasses RLS)
  SELECT EXISTS (
    SELECT 1
    FROM platform_admins
    WHERE user_id = auth.uid()
      AND is_active = true
  ) INTO is_admin;
  
  RETURN COALESCE(is_admin, false);
END;
$$;

-- Ensure authenticated users can execute this function
GRANT EXECUTE ON FUNCTION is_active_platform_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION is_active_platform_admin() TO anon;
