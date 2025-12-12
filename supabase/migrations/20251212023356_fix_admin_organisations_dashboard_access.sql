/*
  # Fix Admin Organisations Dashboard Access

  1. Changes
    - Create secure function for platform admins to access organisation dashboard data
    - Function uses SECURITY DEFINER to bypass RLS while ensuring only platform admins can call it
    - Returns all necessary organisation metrics for the super admin dashboard

  2. Security
    - Function checks if caller is an active platform admin before proceeding
    - Uses SECURITY DEFINER to read all organisations with elevated privileges
    - Validates user authentication before executing
*/

-- Drop the existing view if it exists with security_invoker
DROP VIEW IF EXISTS admin_organisations_dashboard;

-- Create a secure function that platform admins can call
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
BEGIN
  -- Check if the caller is an active platform admin
  IF NOT EXISTS (
    SELECT 1 FROM platform_admins
    WHERE user_id = auth.uid()
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
    (SELECT email FROM organisation_members om 
     JOIN auth.users u ON u.id = om.user_id 
     WHERE om.organisation_id = o.id AND om.role = 'owner' 
     LIMIT 1) as owner_email
  FROM organisations o
  ORDER BY o.created_at DESC;
END;
$$;

COMMENT ON FUNCTION get_admin_organisations_dashboard() IS 'Secure function for platform admins to access organisation dashboard data';

-- Recreate the view as a simple wrapper around the function for backward compatibility
-- But use SECURITY DEFINER to ensure proper access
CREATE OR REPLACE VIEW admin_organisations_dashboard
WITH (security_invoker = false) AS
SELECT * FROM get_admin_organisations_dashboard();

COMMENT ON VIEW admin_organisations_dashboard IS 'Super admin view of all organisations with key metrics';
