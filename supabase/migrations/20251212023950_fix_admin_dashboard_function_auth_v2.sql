/*
  # Fix Admin Dashboard Function Authentication (v2)

  1. Changes
    - Drop dependent view first
    - Replace the SECURITY DEFINER function with one that properly handles authentication
    - Recreate the view
    - Use proper authentication context handling

  2. Security
    - Validates caller is a platform admin before returning data
    - Captures auth.uid() before security context changes
*/

-- Drop the view that depends on the function
DROP VIEW IF EXISTS admin_organisations_dashboard;

-- Drop the existing function
DROP FUNCTION IF EXISTS get_admin_organisations_dashboard();

-- Create a helper function that checks if current user is platform admin
CREATE OR REPLACE FUNCTION is_current_user_platform_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM platform_admins
    WHERE user_id = auth.uid()
    AND is_active = true
  );
$$;

-- Create the main function that bypasses RLS after checking permissions
CREATE OR REPLACE FUNCTION get_admin_organisations_dashboard()
RETURNS TABLE (
  id uuid,
  name text,
  trade_type text,
  licensed_trades text[],
  subscription_status text,
  pricing_tier text,
  trial_end_date timestamptz,
  monthly_quote_limit integer,
  quotes_used_this_month integer,
  last_active_at timestamptz,
  created_at timestamptz,
  member_count bigint,
  project_count bigint,
  quote_count bigint,
  owner_email text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  calling_user_id uuid;
BEGIN
  -- Get the calling user's ID before the security context changes
  calling_user_id := auth.uid();
  
  -- Check if the caller is an active platform admin using the captured user_id
  IF NOT EXISTS (
    SELECT 1 FROM platform_admins
    WHERE user_id = calling_user_id
    AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Access denied: Only active platform admins can access this function';
  END IF;

  -- Return organisation dashboard data
  RETURN QUERY
  SELECT 
    o.id,
    o.name,
    o.trade_type,
    o.licensed_trades,
    o.subscription_status,
    o.pricing_tier,
    o.trial_end_date,
    o.monthly_quote_limit,
    o.quotes_used_this_month,
    o.last_active_at,
    o.created_at,
    (SELECT COUNT(*) FROM organisation_members WHERE organisation_id = o.id)::bigint as member_count,
    (SELECT COUNT(*) FROM projects WHERE organisation_id = o.id)::bigint as project_count,
    (SELECT COUNT(*) FROM quotes WHERE organisation_id = o.id)::bigint as quote_count,
    (SELECT u.email FROM organisation_members om 
     JOIN auth.users u ON u.id = om.user_id 
     WHERE om.organisation_id = o.id AND om.role = 'owner' 
     LIMIT 1) as owner_email
  FROM organisations o
  ORDER BY o.created_at DESC;
END;
$$;

-- Recreate the view for backward compatibility
CREATE OR REPLACE VIEW admin_organisations_dashboard AS
SELECT * FROM get_admin_organisations_dashboard();

COMMENT ON FUNCTION get_admin_organisations_dashboard() IS 'Secure function for platform admins to access organisation dashboard data';
COMMENT ON FUNCTION is_current_user_platform_admin() IS 'Helper to check if current user is an active platform admin';
COMMENT ON VIEW admin_organisations_dashboard IS 'Super admin view of all organisations with key metrics';
