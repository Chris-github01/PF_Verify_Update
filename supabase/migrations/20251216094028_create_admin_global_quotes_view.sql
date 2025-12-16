/*
  # Create Admin Global Quotes View for PDF Vault

  1. New View
    - `admin_global_quotes` - View that aggregates all quotes with organisation and project info
    - Platform admins can query this to see all quotes across all organisations

  2. Security
    - View is accessible by platform admins via RLS
    - Uses SECURITY DEFINER function to bypass RLS for aggregation
*/

-- Create a function that returns all quotes for admin dashboard
CREATE OR REPLACE FUNCTION get_admin_global_quotes()
RETURNS TABLE (
  quote_id uuid,
  supplier_name text,
  quote_reference text,
  total_amount numeric,
  items_count bigint,
  status text,
  extraction_confidence numeric,
  organisation_id uuid,
  organisation_name text,
  trade_type text,
  created_at timestamptz,
  import_date timestamptz,
  uploaded_by_email text,
  project_name text,
  avg_confidence numeric
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

  -- Return all quotes with aggregated data
  RETURN QUERY
  SELECT 
    q.id as quote_id,
    q.supplier_name,
    q.quote_reference,
    COALESCE(q.total_amount, 0) as total_amount,
    (SELECT COUNT(*) FROM quote_items WHERE quote_id = q.id) as items_count,
    COALESCE(q.status, 'unknown') as status,
    q.extraction_confidence,
    q.organisation_id,
    o.name as organisation_name,
    COALESCE(o.trade_type, 'unknown') as trade_type,
    q.created_at,
    q.import_date,
    (SELECT u.email::text FROM auth.users u WHERE u.id = q.uploaded_by LIMIT 1) as uploaded_by_email,
    p.name as project_name,
    (SELECT AVG((metadata->>'confidence')::numeric) 
     FROM quote_items 
     WHERE quote_id = q.id 
     AND metadata->>'confidence' IS NOT NULL) as avg_confidence
  FROM quotes q
  LEFT JOIN organisations o ON o.id = q.organisation_id
  LEFT JOIN projects p ON p.id = q.project_id
  WHERE q.is_latest = true
  ORDER BY q.created_at DESC;
END;
$$;

-- Create the view
CREATE OR REPLACE VIEW admin_global_quotes AS
SELECT * FROM get_admin_global_quotes();

COMMENT ON FUNCTION get_admin_global_quotes() IS 'Returns all quotes across all organisations for platform admin PDF vault';
COMMENT ON VIEW admin_global_quotes IS 'Admin view of all quotes across all organisations';
