/*
  # Fix Admin Dashboard - Use SECURITY DEFINER to Access Auth Tables

  1. Changes
    - Change get_admin_organisations_dashboard to SECURITY DEFINER
    - This allows the function to access auth.users table
    - Function still checks for platform admin permissions first
    - Sets search_path for security

  2. Security
    - Function runs with owner's privileges (SECURITY DEFINER)
    - Checks if caller is a platform admin before proceeding
    - Uses explicit search_path to prevent injection
*/

-- Recreate the function with SECURITY DEFINER
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
SET search_path = public, auth
STABLE
AS $$
BEGIN
  -- Check if the caller is an active platform admin
  IF NOT is_platform_admin() THEN
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

COMMENT ON FUNCTION get_admin_organisations_dashboard() IS 'Function for platform admins to access organisation dashboard data with SECURITY DEFINER to access auth.users';
