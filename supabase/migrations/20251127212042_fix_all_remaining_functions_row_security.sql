/*
  # Fix remaining functions to disable row_security
  
  ## Problem
  Several helper functions used in RLS policies don't have row_security=off,
  causing circular dependencies and stack depth errors.
  
  ## Solution
  Add row_security=off to all remaining functions that query tables with RLS.
  
  ## Functions Fixed
  - is_organisation_member
  - auto_grant_god_mode_access
  - create_god_mode_test_org
  - create_quote_timeline_event
  - ensure_god_mode_access
  - get_god_mode_owner_ids
  - is_god_mode_owner
  - update_quote_latest_flag
*/

-- Fix is_organisation_member (critical - used in many policies)
ALTER FUNCTION is_organisation_member(uuid, uuid) 
  SET search_path = public, pg_catalog
  SET row_security = off;

-- Fix auto_grant_god_mode_access
ALTER FUNCTION auto_grant_god_mode_access() 
  SET search_path = public, pg_catalog
  SET row_security = off;

-- Fix create_quote_timeline_event
ALTER FUNCTION create_quote_timeline_event() 
  SET search_path = public, pg_catalog
  SET row_security = off;

-- Fix ensure_god_mode_access
ALTER FUNCTION ensure_god_mode_access() 
  SET search_path = public, pg_catalog
  SET row_security = off;

-- Fix get_god_mode_owner_ids
ALTER FUNCTION get_god_mode_owner_ids() 
  SET search_path = public, pg_catalog
  SET row_security = off;

-- Fix update_quote_latest_flag
ALTER FUNCTION update_quote_latest_flag() 
  SET search_path = public, pg_catalog
  SET row_security = off;

-- Fix all create_god_mode_test_org overloads
DO $$
DECLARE
  func_record RECORD;
BEGIN
  FOR func_record IN 
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'create_god_mode_test_org'
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_catalog', func_record.oid::regprocedure);
    EXECUTE format('ALTER FUNCTION %s SET row_security = off', func_record.oid::regprocedure);
  END LOOP;
END $$;

-- Fix all is_god_mode_owner overloads
DO $$
DECLARE
  func_record RECORD;
BEGIN
  FOR func_record IN 
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'is_god_mode_owner'
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_catalog', func_record.oid::regprocedure);
    EXECUTE format('ALTER FUNCTION %s SET row_security = off', func_record.oid::regprocedure);
  END LOOP;
END $$;
