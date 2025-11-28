/*
  # Fix function search_path security vulnerability
  
  Functions with role-mutable search_path can be exploited by users creating
  malicious schemas. Setting SECURITY DEFINER with a fixed search_path prevents
  schema injection attacks.
  
  ## Functions Fixed
  All god-mode and helper functions - Drop and recreate with fixed search_path
  
  ## Security Impact
  - Prevents schema injection attacks
  - Ensures functions use correct pg_catalog schema
  - Maintains SECURITY DEFINER benefits safely
*/

-- Drop existing functions
DROP FUNCTION IF EXISTS public.auto_grant_god_mode_access() CASCADE;
DROP FUNCTION IF EXISTS public.is_organisation_member(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_god_mode_owner_ids() CASCADE;
DROP FUNCTION IF EXISTS public.is_god_mode_owner(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.ensure_god_mode_access() CASCADE;
DROP FUNCTION IF EXISTS public.create_god_mode_test_org() CASCADE;
DROP FUNCTION IF EXISTS public.is_god_mode_user(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.create_quote_timeline_event() CASCADE;
DROP FUNCTION IF EXISTS public.update_quote_latest_flag() CASCADE;

-- Recreate with secure search_path

CREATE FUNCTION public.auto_grant_god_mode_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  INSERT INTO public.organisation_members (organisation_id, user_id, role, status)
  SELECT 
    o.id,
    NEW.user_id,
    'owner',
    'active'
  FROM public.organisations o
  WHERE o.name = 'God Mode Test Org'
  ON CONFLICT (organisation_id, user_id) 
  DO UPDATE SET status = 'active', role = 'owner';
  
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.is_organisation_member(p_org_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organisation_members
    WHERE organisation_id = p_org_id
    AND user_id = p_user_id
    AND status = 'active'
  );
END;
$$;

CREATE FUNCTION public.get_god_mode_owner_ids()
RETURNS TABLE (user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT om.user_id
  FROM public.organisation_members om
  JOIN public.organisations o ON o.id = om.organisation_id
  WHERE o.name = 'God Mode Test Org'
  AND om.role = 'owner'
  AND om.status = 'active';
END;
$$;

CREATE FUNCTION public.is_god_mode_owner(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.organisation_members om
    JOIN public.organisations o ON o.id = om.organisation_id
    WHERE o.name = 'God Mode Test Org'
    AND om.user_id = p_user_id
    AND om.role = 'owner'
    AND om.status = 'active'
  );
END;
$$;

CREATE FUNCTION public.ensure_god_mode_access()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  god_mode_org_id uuid;
  admin_user_id uuid;
BEGIN
  SELECT id INTO god_mode_org_id
  FROM public.organisations
  WHERE name = 'God Mode Test Org';

  IF god_mode_org_id IS NULL THEN
    RETURN;
  END IF;

  FOR admin_user_id IN 
    SELECT pa.user_id
    FROM public.platform_admins pa
    WHERE pa.is_active = true
  LOOP
    INSERT INTO public.organisation_members (organisation_id, user_id, role, status)
    VALUES (god_mode_org_id, admin_user_id, 'owner', 'active')
    ON CONFLICT (organisation_id, user_id)
    DO UPDATE SET status = 'active', role = 'owner';
  END LOOP;
END;
$$;

CREATE FUNCTION public.create_god_mode_test_org()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  org_id uuid;
BEGIN
  INSERT INTO public.organisations (id, name, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    'God Mode Test Org',
    now(),
    now()
  )
  ON CONFLICT (name) DO NOTHING
  RETURNING id INTO org_id;

  IF org_id IS NOT NULL THEN
    PERFORM public.ensure_god_mode_access();
  END IF;
END;
$$;

CREATE FUNCTION public.is_god_mode_user(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.organisation_members om
    JOIN public.organisations o ON o.id = om.organisation_id
    WHERE o.name = 'God Mode Test Org'
    AND om.user_id = p_user_id
    AND om.status = 'active'
  );
END;
$$;

CREATE FUNCTION public.create_quote_timeline_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.revision_number > 1 THEN
    INSERT INTO public.quote_revision_timeline (
      project_id,
      supplier_name,
      revision_number,
      event_type,
      created_by
    ) VALUES (
      NEW.project_id,
      NEW.supplier_name,
      NEW.revision_number,
      'revision_uploaded',
      NEW.created_by
    );
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.update_quote_latest_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  UPDATE public.quotes
  SET is_latest = false
  WHERE project_id = NEW.project_id
  AND supplier_name = NEW.supplier_name
  AND id != NEW.id;
  
  UPDATE public.quotes
  SET is_latest = true
  WHERE id = NEW.id;
  
  RETURN NEW;
END;
$$;

-- Recreate triggers if they existed
DROP TRIGGER IF EXISTS on_platform_admin_created ON platform_admins;
CREATE TRIGGER on_platform_admin_created
  AFTER INSERT ON platform_admins
  FOR EACH ROW
  EXECUTE FUNCTION auto_grant_god_mode_access();

DROP TRIGGER IF EXISTS on_quote_insert_create_timeline ON quotes;
CREATE TRIGGER on_quote_insert_create_timeline
  AFTER INSERT ON quotes
  FOR EACH ROW
  EXECUTE FUNCTION create_quote_timeline_event();

DROP TRIGGER IF EXISTS on_quote_update_latest_flag ON quotes;
CREATE TRIGGER on_quote_update_latest_flag
  AFTER INSERT OR UPDATE ON quotes
  FOR EACH ROW
  EXECUTE FUNCTION update_quote_latest_flag();
