/*
  # Fix Admin Dashboard - Use SECURITY INVOKER Function

  1. Changes
    - Drop the problematic SECURITY DEFINER function
    - Create a SECURITY INVOKER function that runs with caller's privileges
    - RLS policies on underlying tables will handle access control
    - Add explicit check for platform admin at the start

  2. Security
    - Function runs with caller's privileges (SECURITY INVOKER)
    - Checks if caller is a platform admin before proceeding
    - Relies on existing RLS policies for data access
*/

-- Drop the existing function and view
DROP VIEW IF EXISTS admin_organisations_dashboard CASCADE;
DROP FUNCTION IF EXISTS get_admin_organisations_dashboard() CASCADE;
DROP FUNCTION IF EXISTS is_current_user_platform_admin() CASCADE;

-- Create a simple helper to check platform admin status
CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM platform_admins
    WHERE user_id = auth.uid()
    AND is_active = true
  );
$$;

-- Create the main function using SECURITY INVOKER
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
SECURITY INVOKER
STABLE
AS $$
BEGIN
  -- Check if the caller is an active platform admin
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied: Only active platform admins can access this function';
  END IF;

  -- Return organisation dashboard data
  -- RLS policies on the tables will be evaluated with the caller's privileges
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

-- Create a view for backward compatibility
CREATE OR REPLACE VIEW admin_organisations_dashboard AS
SELECT * FROM get_admin_organisations_dashboard();

COMMENT ON FUNCTION is_platform_admin() IS 'Check if current user is an active platform admin';
COMMENT ON FUNCTION get_admin_organisations_dashboard() IS 'Function for platform admins to access organisation dashboard data';
COMMENT ON VIEW admin_organisations_dashboard IS 'Super admin view of all organisations with key metrics';
