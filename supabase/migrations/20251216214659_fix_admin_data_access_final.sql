/*
  # Fix Admin Data Access - Create Service Role Functions
  
  1. Changes
    - Create admin functions that use SECURITY DEFINER to bypass RLS
    - These functions check platform admin status then return data
    - Fix audit_events, quotes, and all admin queries
    
  2. Security
    - Functions verify is_platform_admin() before returning data
    - Use SECURITY DEFINER to bypass RLS
    - Only callable by authenticated users
*/

-- Function to get all audit events for platform admins
CREATE OR REPLACE FUNCTION get_admin_audit_events(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_entity_type text DEFAULT NULL,
  p_action text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  organisation_id uuid,
  entity_type text,
  entity_id uuid,
  action text,
  actor_user_id uuid,
  actor_email text,
  metadata_json jsonb,
  created_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Check if user is platform admin
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied: Platform admin required';
  END IF;
  
  -- Return audit events with actor email
  RETURN QUERY
  WITH filtered_events AS (
    SELECT 
      ae.id,
      ae.organisation_id,
      ae.entity_type,
      ae.entity_id,
      ae.action,
      ae.actor_user_id,
      ae.metadata_json,
      ae.created_at,
      u.email as actor_email
    FROM audit_events ae
    LEFT JOIN auth.users u ON ae.actor_user_id = u.id
    WHERE 
      (p_entity_type IS NULL OR ae.entity_type = p_entity_type)
      AND (p_action IS NULL OR ae.action = p_action)
    ORDER BY ae.created_at DESC
    LIMIT p_limit
    OFFSET p_offset
  ),
  total AS (
    SELECT COUNT(*)::bigint as count
    FROM audit_events ae
    WHERE 
      (p_entity_type IS NULL OR ae.entity_type = p_entity_type)
      AND (p_action IS NULL OR ae.action = p_action)
  )
  SELECT 
    fe.*,
    t.count as total_count
  FROM filtered_events fe
  CROSS JOIN total t;
END;
$$;

-- Function to get all quotes for platform admins
CREATE OR REPLACE FUNCTION get_admin_quotes(
  p_organisation_id uuid DEFAULT NULL,
  p_project_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  quote_id text,
  supplier_name text,
  organisation_id uuid,
  organisation_name text,
  project_id uuid,
  project_name text,
  status text,
  parse_status text,
  line_item_count integer,
  filename text,
  file_url text,
  created_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if user is platform admin
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied: Platform admin required';
  END IF;
  
  -- Return quotes with org and project names
  RETURN QUERY
  WITH filtered_quotes AS (
    SELECT 
      q.id,
      q.quote_id,
      q.supplier_name,
      q.organisation_id,
      o.name as organisation_name,
      q.project_id,
      p.name as project_name,
      q.status,
      q.parse_status,
      q.line_item_count,
      q.filename,
      q.file_url,
      q.created_at
    FROM quotes q
    LEFT JOIN organisations o ON q.organisation_id = o.id
    LEFT JOIN projects p ON q.project_id = p.id
    WHERE 
      (p_organisation_id IS NULL OR q.organisation_id = p_organisation_id)
      AND (p_project_id IS NULL OR q.project_id = p_project_id)
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
  )
  SELECT 
    fq.*,
    t.count as total_count
  FROM filtered_quotes fq
  CROSS JOIN total t;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_admin_audit_events TO authenticated;
GRANT EXECUTE ON FUNCTION get_admin_quotes TO authenticated;

COMMENT ON FUNCTION get_admin_audit_events IS 'Get audit events for platform admins, bypasses RLS';
COMMENT ON FUNCTION get_admin_quotes IS 'Get all quotes for platform admins, bypasses RLS';
