/*
  # Fix Admin Global Quotes to Include File URL
  
  1. Problem
    - quotes table doesn't have file_url column
    - parsing_jobs table has the file_url
    - Admin dashboard needs file_url to download PDFs
  
  2. Solution
    - Drop and recreate get_admin_global_quotes function
    - Include file_url and filename in the result
    - JOIN with parsing_jobs to get the storage path
  
  3. Changes
    - Add file_url and filename to function return type
    - JOIN with parsing_jobs to get the storage path
*/

-- Drop the existing function
DROP FUNCTION IF EXISTS get_admin_global_quotes();

-- Recreate with file_url and filename
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
  avg_confidence numeric,
  file_url text,
  filename text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
BEGIN
  -- Check if the caller is an active platform admin
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied: Only active platform admins can access global quotes';
  END IF;

  -- Return all quotes with aggregated data and file info from parsing_jobs
  RETURN QUERY
  SELECT 
    q.id as quote_id,
    q.supplier_name,
    q.quote_reference,
    COALESCE(q.total_amount, 0) as total_amount,
    (SELECT COUNT(*) FROM quote_items WHERE quote_id = q.id) as items_count,
    COALESCE(q.status, 'unknown') as status,
    NULL::numeric as extraction_confidence,
    q.organisation_id,
    o.name as organisation_name,
    COALESCE(o.trade_type, 'unknown') as trade_type,
    q.created_at,
    NULL::timestamptz as import_date,
    (SELECT u.email::text FROM auth.users u WHERE u.id = q.created_by LIMIT 1) as uploaded_by_email,
    p.name as project_name,
    (SELECT AVG((metadata->>'confidence')::numeric) 
     FROM quote_items 
     WHERE quote_id = q.id 
     AND metadata->>'confidence' IS NOT NULL) as avg_confidence,
    pj.file_url,
    pj.filename
  FROM quotes q
  LEFT JOIN organisations o ON o.id = q.organisation_id
  LEFT JOIN projects p ON p.id = q.project_id
  LEFT JOIN parsing_jobs pj ON pj.quote_id = q.id
  WHERE q.is_latest = true
  ORDER BY q.created_at DESC;
END;
$$;

COMMENT ON FUNCTION get_admin_global_quotes() IS 'Returns all quotes with file URLs for platform admin PDF vault';
