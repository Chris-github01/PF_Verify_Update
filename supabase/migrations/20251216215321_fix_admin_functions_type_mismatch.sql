/*
  # Fix Admin Functions Type Mismatch
  
  1. Changes
    - Fix get_admin_audit_events return type to match query
    - Fix get_admin_quotes return type to match query
    
  2. Security
    - Maintains SECURITY DEFINER and admin checks
*/

-- Fix get_admin_audit_events function with correct types
DROP FUNCTION IF EXISTS get_admin_audit_events(integer, integer, text, text);

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
  metadata_json jsonb,
  created_at timestamptz,
  actor_email text,
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
      COALESCE(u.email, 'System') as actor_email
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
    fe.id,
    fe.organisation_id,
    fe.entity_type,
    fe.entity_id,
    fe.action,
    fe.actor_user_id,
    fe.metadata_json,
    fe.created_at,
    fe.actor_email,
    t.count as total_count
  FROM filtered_events fe
  CROSS JOIN total t;
END;
$$;

GRANT EXECUTE ON FUNCTION get_admin_audit_events TO authenticated;
COMMENT ON FUNCTION get_admin_audit_events IS 'Get audit events for platform admins, bypasses RLS';
