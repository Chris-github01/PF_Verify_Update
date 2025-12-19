/*
  # Fix Security Definer Views and Auth Data Exposure

  This migration addresses security concerns with views that expose auth.users data
  and views using SECURITY DEFINER inappropriately.

  ## Issues Fixed

  1. **platform_admins_with_user_data view**
     - Currently exposes auth.users data without proper access control
     - Solution: Replace with SECURITY DEFINER function with proper admin check
  
  2. **admin_organisations_dashboard view**
     - Flagged as using SECURITY DEFINER
     - Solution: Ensure it's created with SECURITY INVOKER (default)

  ## Security Considerations

  - Only platform admins can access platform_admins data
  - All functions have explicit permission checks
  - Views are SECURITY INVOKER (run with caller's privileges)
*/

-- Drop the existing platform_admins_with_user_data view
DROP VIEW IF EXISTS public.platform_admins_with_user_data CASCADE;

-- Create a secure function to get platform admin data with user info
-- This is SECURITY DEFINER because it needs to access auth.users
CREATE OR REPLACE FUNCTION get_platform_admins_with_user_data()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  email text,
  full_name text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
BEGIN
  -- Check if the caller is an active platform admin
  IF NOT EXISTS (
    SELECT 1 FROM public.platform_admins
    WHERE user_id = auth.uid() AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Access denied: Only active platform admins can access this data';
  END IF;

  -- Return platform admins with user data
  RETURN QUERY
  SELECT 
    pa.id,
    pa.user_id,
    COALESCE(pa.email, u.email) as email,
    COALESCE(pa.full_name, u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)) as full_name,
    pa.is_active,
    pa.created_at,
    pa.updated_at
  FROM public.platform_admins pa
  LEFT JOIN auth.users u ON u.id = pa.user_id;
END;
$$;

COMMENT ON FUNCTION get_platform_admins_with_user_data() IS 
  'Secure function for platform admins to view platform admin data with user info from auth.users. Uses SECURITY DEFINER with explicit permission checks.';

-- Recreate admin_organisations_dashboard view with explicit SECURITY INVOKER
-- This ensures it runs with the caller's privileges and relies on the function's security
DROP VIEW IF EXISTS public.admin_organisations_dashboard CASCADE;

CREATE VIEW public.admin_organisations_dashboard
WITH (security_invoker = true) AS
SELECT * FROM get_admin_organisations_dashboard();

COMMENT ON VIEW public.admin_organisations_dashboard IS 
  'Super admin view of all organisations. Uses SECURITY INVOKER - permissions are checked by the underlying function.';

-- Grant execute permission on the new function to authenticated users
-- (The function itself checks for platform admin status)
GRANT EXECUTE ON FUNCTION get_platform_admins_with_user_data() TO authenticated;
GRANT EXECUTE ON FUNCTION get_admin_organisations_dashboard() TO authenticated;
