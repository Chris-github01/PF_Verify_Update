/*
  # Final comprehensive fix for RLS stack depth issues
  
  Drop everything and rebuild from scratch to eliminate all recursion.
  
  ## Strategy
  - Use SECURITY DEFINER functions with direct joins
  - No nested queries or EXISTS with subqueries
  - Fast-path God-Mode check
  - Add proper indexes
*/

-- Step 1: Drop all dependent policies
DROP POLICY IF EXISTS "Users can view parsing jobs in their organisation" ON parsing_jobs;
DROP POLICY IF EXISTS "Users can create parsing jobs in their organisation" ON parsing_jobs;
DROP POLICY IF EXISTS "Users can update parsing jobs in their organisation" ON parsing_jobs;
DROP POLICY IF EXISTS "Users can delete parsing jobs in their organisation" ON parsing_jobs;

DROP POLICY IF EXISTS "Users can view quotes in their organisation projects" ON quotes;
DROP POLICY IF EXISTS "Users can create quotes in their organisation projects" ON quotes;
DROP POLICY IF EXISTS "Users can update quotes in their organisation projects" ON quotes;
DROP POLICY IF EXISTS "Users can delete quotes in their organisation projects" ON quotes;

DROP POLICY IF EXISTS "Users can view quote items in their organisation" ON quote_items;
DROP POLICY IF EXISTS "Users can insert quote items in their organisation" ON quote_items;
DROP POLICY IF EXISTS "Users can update quote items in their organisation" ON quote_items;
DROP POLICY IF EXISTS "Users can delete quote items in their organisation" ON quote_items;

DROP POLICY IF EXISTS "Users can view chunks for jobs in their organisation" ON parsing_chunks;
DROP POLICY IF EXISTS "Users can create chunks for jobs in their organisation" ON parsing_chunks;
DROP POLICY IF EXISTS "Users can update chunks for jobs in their organisation" ON parsing_chunks;
DROP POLICY IF EXISTS "Users can delete chunks for jobs in their organisation" ON parsing_chunks;

-- Step 2: Drop ALL helper functions completely
DROP FUNCTION IF EXISTS public.is_god_mode_user(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.check_project_access(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.check_quote_access(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.check_parsing_job_access(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.can_user_access_project(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.can_user_access_quote(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.can_user_access_parsing_job(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.user_can_access_project_simple(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.user_can_access_quote_simple(uuid, uuid) CASCADE;

-- Step 3: Create NEW helper functions with different parameter names

CREATE FUNCTION public.is_god_mode_user(uid_to_check uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = uid_to_check
    AND email IN ('chris@optimalfire.co.nz', 'pieter@optimalfire.co.nz')
  );
$$;

CREATE FUNCTION public.check_project_access(proj_id uuid, uid_to_check uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
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

CREATE FUNCTION public.check_quote_access(q_id uuid, uid_to_check uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
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

CREATE FUNCTION public.check_parsing_job_access(job_id_to_check uuid, uid_to_check uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
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

-- Step 4: Recreate all policies

CREATE POLICY "Users can view quotes"
  ON quotes FOR SELECT
  TO authenticated
  USING (check_project_access(project_id, auth.uid()));

CREATE POLICY "Users can create quotes"
  ON quotes FOR INSERT
  TO authenticated
  WITH CHECK (check_project_access(project_id, auth.uid()));

CREATE POLICY "Users can update quotes"
  ON quotes FOR UPDATE
  TO authenticated
  USING (check_project_access(project_id, auth.uid()));

CREATE POLICY "Users can delete quotes"
  ON quotes FOR DELETE
  TO authenticated
  USING (check_project_access(project_id, auth.uid()));

CREATE POLICY "Users can view quote items"
  ON quote_items FOR SELECT
  TO authenticated
  USING (check_quote_access(quote_id, auth.uid()));

CREATE POLICY "Users can insert quote items"
  ON quote_items FOR INSERT
  TO authenticated
  WITH CHECK (check_quote_access(quote_id, auth.uid()));

CREATE POLICY "Users can update quote items"
  ON quote_items FOR UPDATE
  TO authenticated
  USING (check_quote_access(quote_id, auth.uid()));

CREATE POLICY "Users can delete quote items"
  ON quote_items FOR DELETE
  TO authenticated
  USING (check_quote_access(quote_id, auth.uid()));

CREATE POLICY "Users can view parsing jobs"
  ON parsing_jobs FOR SELECT
  TO authenticated
  USING (check_project_access(project_id, auth.uid()));

CREATE POLICY "Users can create parsing jobs"
  ON parsing_jobs FOR INSERT
  TO authenticated
  WITH CHECK (check_project_access(project_id, auth.uid()));

CREATE POLICY "Users can update parsing jobs"
  ON parsing_jobs FOR UPDATE
  TO authenticated
  USING (check_project_access(project_id, auth.uid()));

CREATE POLICY "Users can delete parsing jobs"
  ON parsing_jobs FOR DELETE
  TO authenticated
  USING (check_project_access(project_id, auth.uid()));

CREATE POLICY "Users can view parsing chunks"
  ON parsing_chunks FOR SELECT
  TO authenticated
  USING (check_parsing_job_access(job_id, auth.uid()));

CREATE POLICY "Users can create parsing chunks"
  ON parsing_chunks FOR INSERT
  TO authenticated
  WITH CHECK (check_parsing_job_access(job_id, auth.uid()));

CREATE POLICY "Users can update parsing chunks"
  ON parsing_chunks FOR UPDATE
  TO authenticated
  USING (check_parsing_job_access(job_id, auth.uid()));

CREATE POLICY "Users can delete parsing chunks"
  ON parsing_chunks FOR DELETE
  TO authenticated
  USING (check_parsing_job_access(job_id, auth.uid()));

-- Step 5: Add performance indexes
CREATE INDEX IF NOT EXISTS idx_organisation_members_org_user_status 
  ON organisation_members(organisation_id, user_id, status) 
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_projects_org 
  ON projects(organisation_id);

CREATE INDEX IF NOT EXISTS idx_quotes_project 
  ON quotes(project_id);

CREATE INDEX IF NOT EXISTS idx_parsing_jobs_project 
  ON parsing_jobs(project_id);

CREATE INDEX IF NOT EXISTS idx_parsing_chunks_job 
  ON parsing_chunks(job_id);
