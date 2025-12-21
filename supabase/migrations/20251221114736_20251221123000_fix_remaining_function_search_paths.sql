/*
  # Fix Remaining Function Search Paths

  Fixes the overloaded function versions that don't have search_path set.
  These are additional versions of functions that have different signatures.
*/

-- Fix check_close_scores(numeric, numeric, numeric) - boolean version
CREATE OR REPLACE FUNCTION check_close_scores(
  p_top_score numeric, 
  p_second_score numeric, 
  p_threshold numeric DEFAULT 10
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (p_top_score - p_second_score) <= p_threshold;
END;
$$;

-- Fix archive_user_and_transfer_projects with 5 params
CREATE OR REPLACE FUNCTION archive_user_and_transfer_projects(
  p_organisation_id uuid,
  p_user_id uuid,
  p_transfer_to_user_id uuid,
  p_archived_by_user_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_projects_transferred integer := 0;
  v_result jsonb;
BEGIN
  -- Archive the user
  UPDATE organisation_members
  SET 
    archived_at = now(),
    archived_by_user_id = p_archived_by_user_id,
    notes = p_notes,
    status = 'inactive'
  WHERE organisation_id = p_organisation_id
  AND user_id = p_user_id
  AND archived_at IS NULL;

  -- Transfer project ownership
  IF p_transfer_to_user_id IS NOT NULL THEN
    UPDATE projects
    SET 
      created_by_user_id = p_transfer_to_user_id,
      updated_at = now()
    WHERE organisation_id = p_organisation_id
    AND created_by_user_id = p_user_id;

    GET DIAGNOSTICS v_projects_transferred = ROW_COUNT;
  END IF;

  -- Log the activity
  INSERT INTO user_activity_log (organisation_id, user_id, activity_type, metadata)
  VALUES (
    p_organisation_id,
    p_archived_by_user_id,
    'user_archived',
    jsonb_build_object(
      'archived_user_id', p_user_id,
      'transfer_to_user_id', p_transfer_to_user_id,
      'projects_transferred', v_projects_transferred
    )
  );

  -- Recalculate analytics
  PERFORM calculate_organisation_analytics(p_organisation_id);

  v_result := jsonb_build_object(
    'success', true,
    'projects_transferred', v_projects_transferred,
    'archived_user_id', p_user_id,
    'transfer_to_user_id', p_transfer_to_user_id
  );

  RETURN v_result;
END;
$$;

-- Fix restore_archived_user with 2 params
CREATE OR REPLACE FUNCTION restore_archived_user(
  p_organisation_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE organisation_members
  SET 
    archived_at = NULL,
    archived_by_user_id = NULL,
    status = 'active',
    updated_at = now()
  WHERE organisation_id = p_organisation_id
  AND user_id = p_user_id
  AND archived_at IS NOT NULL;

  -- Recalculate analytics
  PERFORM calculate_organisation_analytics(p_organisation_id);

  RETURN FOUND;
END;
$$;
