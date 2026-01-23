/*
  # Add Trade to Admin Quotes Function

  1. Changes
    - Drop and recreate get_admin_quotes function to include trade column from projects
    - This enables trade filtering in the admin center's Global PDF Vault
  
  2. Security
    - Function remains SECURITY DEFINER for admin access
    - No changes to RLS or permissions
*/

DROP FUNCTION IF EXISTS get_admin_quotes(uuid, uuid, integer, integer);

CREATE OR REPLACE FUNCTION get_admin_quotes(
  p_organisation_id uuid DEFAULT NULL,
  p_project_id uuid DEFAULT NULL,
  p_limit int DEFAULT 100,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  supplier_name text,
  organisation_id uuid,
  organisation_name text,
  project_id uuid,
  project_name text,
  trade text,
  status text,
  parse_status text,
  line_item_count int,
  total_amount numeric,
  avg_confidence numeric,
  filename text,
  file_url text,
  created_at timestamptz,
  total_count bigint
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH filtered_quotes AS (
    SELECT 
      q.id,
      q.supplier_name,
      q.organisation_id,
      o.name as organisation_name,
      q.project_id,
      p.name as project_name,
      COALESCE(p.trade, 'passive_fire') as trade,
      q.status,
      q.parse_status,
      q.line_item_count,
      COALESCE((
        SELECT SUM(qi.total_price)
        FROM quote_items qi
        WHERE qi.quote_id = q.id
      ), 0) as total_amount,
      (
        SELECT AVG(qi.confidence)
        FROM quote_items qi
        WHERE qi.quote_id = q.id AND qi.confidence IS NOT NULL
      ) as avg_confidence,
      pj.filename as filename,
      pj.file_url as file_url,
      q.created_at
    FROM quotes q
    LEFT JOIN projects p ON q.project_id = p.id
    LEFT JOIN organisations o ON q.organisation_id = o.id
    LEFT JOIN parsing_jobs pj ON pj.quote_id = q.id
    WHERE 
      (p_organisation_id IS NULL OR q.organisation_id = p_organisation_id)
      AND (p_project_id IS NULL OR q.project_id = p_project_id)
    ORDER BY q.created_at DESC
  )
  SELECT 
    fq.*,
    (SELECT COUNT(*) FROM filtered_quotes) as total_count
  FROM filtered_quotes fq
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;
