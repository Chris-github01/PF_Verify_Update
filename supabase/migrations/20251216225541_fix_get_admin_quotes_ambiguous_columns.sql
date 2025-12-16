/*
  # Fix ambiguous column references in get_admin_quotes
  
  Fixes the column name ambiguity issue by properly aliasing
  the columns from the LATERAL join.
*/

DROP FUNCTION IF EXISTS get_admin_quotes(uuid, uuid, int, int);

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
      pj.pj_filename as filename,
      pj.pj_file_url as file_url,
      q.created_at
    FROM quotes q
    LEFT JOIN organisations o ON q.organisation_id = o.id
    LEFT JOIN projects p ON q.project_id = p.id
    LEFT JOIN LATERAL (
      SELECT 
        parsing_jobs.filename as pj_filename, 
        parsing_jobs.file_url as pj_file_url
      FROM parsing_jobs
      WHERE parsing_jobs.quote_id = q.id
      ORDER BY parsing_jobs.created_at DESC
      LIMIT 1
    ) pj ON true
    WHERE 
      (p_organisation_id IS NULL OR q.organisation_id = p_organisation_id)
      AND (p_project_id IS NULL OR q.project_id = p_project_id)
      AND q.is_latest = true
    ORDER BY q.created_at DESC
    LIMIT p_limit
    OFFSET p_offset
  ),
  total AS (
    SELECT COUNT(*)::bigint as count
    FROM quotes q
    WHERE 
      (p_organisation_id IS NULL OR q.organisation_id = p_organisation_id)
      AND (p_project_id IS NULL OR q.project_id = p_project_id)
      AND q.is_latest = true
  )
  SELECT 
    fq.id,
    fq.supplier_name,
    fq.organisation_id,
    fq.organisation_name,
    fq.project_id,
    fq.project_name,
    fq.status,
    fq.parse_status,
    fq.line_item_count,
    fq.total_amount,
    fq.avg_confidence,
    fq.filename,
    fq.file_url,
    fq.created_at,
    t.count as total_count
  FROM filtered_quotes fq
  CROSS JOIN total t;
END;
$$;
