/*
  # Fix remaining function search_path security issues
  
  Some functions have duplicate versions with different signatures.
  This migration fixes the versions that don't have secure search_path settings.
  
  ## Functions Fixed
  1. is_god_mode_owner(text) - email-based version
  2. create_god_mode_test_org(uuid) - user-specific version
  3. is_god_mode_user() - no-parameter version
  
  ## Security Impact
  - Prevents schema injection attacks on all function variants
  - Ensures consistent security across all function overloads
*/

-- Fix is_god_mode_owner(text) version
DROP FUNCTION IF EXISTS public.is_god_mode_owner(text) CASCADE;
CREATE FUNCTION public.is_god_mode_owner(check_email text)
RETURNS boolean
LANGUAGE sql
STABLE 
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT check_email IN ('chris@optimalfire.co.nz', 'pieter@optimalfire.co.nz');
$$;

-- Fix create_god_mode_test_org(uuid) version
DROP FUNCTION IF EXISTS public.create_god_mode_test_org(uuid) CASCADE;
CREATE FUNCTION public.create_god_mode_test_org(for_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  test_org_id uuid;
  test_project_id uuid;
  user_email text;
BEGIN
  SELECT email INTO user_email FROM auth.users WHERE id = for_user_id;

  IF user_email NOT IN ('chris@optimalfire.co.nz', 'pieter@optimalfire.co.nz') THEN
    RAISE EXCEPTION 'User is not authorized for auto-create';
  END IF;

  SELECT id INTO test_org_id FROM organisations WHERE name = 'Optimal Fire God-Mode Test Org';

  IF test_org_id IS NULL THEN
    INSERT INTO organisations (name)
    VALUES ('Optimal Fire God-Mode Test Org')
    RETURNING id INTO test_org_id;
  END IF;

  INSERT INTO organisation_members (user_id, organisation_id, role, status)
  VALUES (for_user_id, test_org_id, 'owner', 'active')
  ON CONFLICT (user_id, organisation_id) 
  DO UPDATE SET role = 'owner', status = 'active', updated_at = now();

  SELECT id INTO test_project_id 
  FROM projects 
  WHERE organisation_id = test_org_id 
  LIMIT 1;

  IF test_project_id IS NULL THEN
    INSERT INTO projects (organisation_id, name, description, status, created_by)
    VALUES (test_org_id, 'Test Project - Instant Access', 'Auto-created demo project for God-Mode access', 'active', for_user_id)
    RETURNING id INTO test_project_id;
  END IF;

  RETURN test_org_id;
END;
$$;

-- Fix is_god_mode_user() no-parameter version
DROP FUNCTION IF EXISTS public.is_god_mode_user() CASCADE;
CREATE FUNCTION public.is_god_mode_user()
RETURNS boolean
LANGUAGE sql
STABLE 
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'email')::text IN (
      '"chris@optimalfire.co.nz"',
      '"pieter@optimalfire.co.nz"'
    ),
    false
  );
$$;
