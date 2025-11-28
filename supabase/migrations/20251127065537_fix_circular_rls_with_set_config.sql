/*
  # Fix circular RLS dependencies by disabling RLS in helper functions
  
  The issue: Helper functions are SECURITY DEFINER but still trigger RLS
  policy evaluation on tables they query. When organisation_members policies
  call is_org_owner(), which queries organisation_members, we get infinite recursion.
  
  ## Solution
  Use PL/pgSQL functions that temporarily disable RLS using:
  - SET row_security = off at function level
  - OR use direct queries that bypass policy checks
  
  ## Changes
  - Recreate all helper functions with row_security disabled
  - This allows functions to query tables without RLS evaluation
*/

-- Recreate is_org_owner with row_security disabled
CREATE OR REPLACE FUNCTION public.is_org_owner(check_org_id uuid, check_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
SET row_security = off
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM organisation_members
    WHERE organisation_id = check_org_id
    AND user_id = check_user_id
    AND role = 'owner'
    AND status = 'active'
  );
END;
$$;

-- Recreate is_platform_admin with row_security disabled
CREATE OR REPLACE FUNCTION public.is_platform_admin(check_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
SET row_security = off
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM platform_admins
    WHERE user_id = check_user_id
    AND is_active = true
  );
END;
$$;

-- Recreate is_active_platform_admin with row_security disabled
CREATE OR REPLACE FUNCTION public.is_active_platform_admin(check_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
SET row_security = off
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM platform_admins
    WHERE user_id = check_user_id
    AND is_active = true
  );
END;
$$;

-- Recreate our new helper functions with row_security disabled
CREATE OR REPLACE FUNCTION public.is_god_mode_user(uid_to_check uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
SET row_security = off
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = uid_to_check
    AND email IN ('chris@optimalfire.co.nz', 'pieter@optimalfire.co.nz')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.check_project_access(proj_id uuid, uid_to_check uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
SET row_security = off
AS $$
BEGIN
  IF is_god_mode_user(uid_to_check) THEN
    RETURN TRUE;
  END IF;
  
  RETURN EXISTS (
    SELECT 1 
    FROM projects p
    INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = proj_id
    AND om.user_id = uid_to_check
    AND om.status = 'active'
    LIMIT 1
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.check_quote_access(q_id uuid, uid_to_check uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
SET row_security = off
AS $$
BEGIN
  IF is_god_mode_user(uid_to_check) THEN
    RETURN TRUE;
  END IF;
  
  RETURN EXISTS (
    SELECT 1 
    FROM quotes q
    INNER JOIN projects p ON p.id = q.project_id
    INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
    WHERE q.id = q_id
    AND om.user_id = uid_to_check
    AND om.status = 'active'
    LIMIT 1
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.check_parsing_job_access(job_id_to_check uuid, uid_to_check uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
SET row_security = off
AS $$
BEGIN
  IF is_god_mode_user(uid_to_check) THEN
    RETURN TRUE;
  END IF;
  
  RETURN EXISTS (
    SELECT 1 
    FROM parsing_jobs pj
    INNER JOIN projects p ON p.id = pj.project_id
    INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
    WHERE pj.id = job_id_to_check
    AND om.user_id = uid_to_check
    AND om.status = 'active'
    LIMIT 1
  );
END;
$$;

-- Add comments documenting the row_security setting
COMMENT ON FUNCTION public.is_org_owner IS 
'Checks if user is owner of organisation. Uses row_security=off to prevent circular RLS evaluation.';

COMMENT ON FUNCTION public.is_platform_admin IS 
'Checks if user is platform admin. Uses row_security=off to prevent circular RLS evaluation.';

COMMENT ON FUNCTION public.check_project_access IS 
'Checks project access. Uses row_security=off to prevent RLS recursion when querying organisation_members.';

COMMENT ON FUNCTION public.check_quote_access IS 
'Checks quote access. Uses row_security=off to prevent RLS recursion when querying organisation_members.';

COMMENT ON FUNCTION public.check_parsing_job_access IS 
'Checks parsing job access. Uses row_security=off to prevent RLS recursion when querying organisation_members.';
