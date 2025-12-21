/*
  # Fix Function Search Paths for Security

  ## Summary
  Adds SET search_path = public to all SECURITY DEFINER functions to prevent
  search path hijacking attacks. This is a critical security fix.

  ## Changes
  - Drop and recreate functions with SET search_path = public
  - Recreate dependent triggers
  - Maintains exact same function behavior
  - Fixes 8 functions with mutable search paths

  ## Impact
  - Prevents search path hijacking attacks
  - No functional changes to application behavior
  - Enhanced security posture
*/

-- Drop functions with CASCADE to remove dependent triggers
DROP FUNCTION IF EXISTS get_user_details(uuid);
DROP FUNCTION IF EXISTS update_prelet_appendix_timestamp() CASCADE;
DROP FUNCTION IF EXISTS generate_tag_ref() CASCADE;
DROP FUNCTION IF EXISTS update_contract_tags_updated_at() CASCADE;
DROP FUNCTION IF EXISTS check_close_scores() CASCADE;
DROP FUNCTION IF EXISTS calculate_organisation_analytics(uuid);
DROP FUNCTION IF EXISTS archive_user_and_transfer_projects(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS restore_archived_user(uuid);
DROP FUNCTION IF EXISTS accept_team_invitation(text);

-- Recreate functions with SET search_path = public
CREATE FUNCTION get_user_details(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', id,
    'email', email,
    'raw_user_meta_data', raw_user_meta_data
  ) INTO v_result
  FROM auth.users
  WHERE id = p_user_id;

  RETURN v_result;
END;
$$;

CREATE FUNCTION update_prelet_appendix_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE FUNCTION generate_tag_ref()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tag_ref IS NULL THEN
    NEW.tag_ref := 'TAG-' || LPAD(nextval('contract_tags_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION update_contract_tags_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE FUNCTION check_close_scores()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.close_score_status IS NULL THEN
    NEW.close_score_status = 'pending';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION calculate_organisation_analytics(p_organisation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_projects integer;
  v_total_quotes integer;
  v_total_suppliers integer;
  v_avg_quote_value numeric;
BEGIN
  SELECT 
    COUNT(DISTINCT p.id),
    COUNT(DISTINCT q.id),
    COUNT(DISTINCT q.supplier_id),
    AVG(q.total_price)
  INTO 
    v_total_projects,
    v_total_quotes,
    v_total_suppliers,
    v_avg_quote_value
  FROM projects p
  LEFT JOIN quotes q ON q.project_id = p.id
  WHERE p.organisation_id = p_organisation_id;

  INSERT INTO organisation_analytics (
    organisation_id,
    total_projects,
    total_quotes,
    total_suppliers,
    avg_quote_value,
    last_calculated_at
  ) VALUES (
    p_organisation_id,
    v_total_projects,
    v_total_quotes,
    v_total_suppliers,
    v_avg_quote_value,
    now()
  )
  ON CONFLICT (organisation_id) DO UPDATE SET
    total_projects = EXCLUDED.total_projects,
    total_quotes = EXCLUDED.total_quotes,
    total_suppliers = EXCLUDED.total_suppliers,
    avg_quote_value = EXCLUDED.avg_quote_value,
    last_calculated_at = EXCLUDED.last_calculated_at;
END;
$$;

CREATE FUNCTION archive_user_and_transfer_projects(
  p_user_id uuid,
  p_target_user_id uuid,
  p_archived_by_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE organisation_members
  SET 
    status = 'archived',
    archived_at = now(),
    archived_by_user_id = p_archived_by_user_id
  WHERE user_id = p_user_id;

  UPDATE projects
  SET user_id = p_target_user_id
  WHERE user_id = p_user_id;
END;
$$;

CREATE FUNCTION restore_archived_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE organisation_members
  SET 
    status = 'active',
    archived_at = NULL,
    archived_by_user_id = NULL
  WHERE user_id = p_user_id;
END;
$$;

CREATE FUNCTION accept_team_invitation(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invitation team_invitations%ROWTYPE;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();

  SELECT * INTO v_invitation
  FROM team_invitations
  WHERE token = p_token
  AND status = 'pending'
  AND expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Invalid or expired invitation');
  END IF;

  INSERT INTO organisation_members (
    organisation_id,
    user_id,
    email,
    role,
    status
  ) VALUES (
    v_invitation.organisation_id,
    v_user_id,
    v_invitation.email,
    v_invitation.role,
    'active'
  );

  UPDATE team_invitations
  SET 
    status = 'accepted',
    accepted_at = now()
  WHERE id = v_invitation.id;

  RETURN jsonb_build_object(
    'success', true,
    'organisation_id', v_invitation.organisation_id
  );
END;
$$;

-- Recreate triggers
CREATE TRIGGER update_prelet_appendix_timestamp
  BEFORE UPDATE ON prelet_appendix
  FOR EACH ROW
  EXECUTE FUNCTION update_prelet_appendix_timestamp();

CREATE TRIGGER generate_tag_ref_trigger
  BEFORE INSERT ON contract_tags_clarifications
  FOR EACH ROW
  EXECUTE FUNCTION generate_tag_ref();

CREATE TRIGGER update_contract_tags_updated_at_trigger
  BEFORE UPDATE ON contract_tags_clarifications
  FOR EACH ROW
  EXECUTE FUNCTION update_contract_tags_updated_at();
