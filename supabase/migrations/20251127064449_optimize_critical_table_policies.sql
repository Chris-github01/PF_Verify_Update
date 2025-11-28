/*
  # Optimize critical table policies to prevent stack depth issues
  
  Optimize policies for tables involved in quote import process:
  - quote_items (queries through quotes -> projects -> organisation_members)
  - parsing_jobs (queries through projects -> organisation_members)
  - parsing_chunks (queries through parsing_jobs -> projects -> organisation_members)
  
  ## Solution
  Use helper functions with SECURITY DEFINER to bypass intermediate RLS
  and reduce query depth.
  
  ## Changes
  - Create helper for quote access
  - Update quote_items policies
  - Update parsing_jobs policies  
  - Update parsing_chunks policies
*/

-- Helper function to check if user can access a quote
CREATE OR REPLACE FUNCTION public.can_user_access_quote(check_quote_id uuid, check_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM quotes q
    JOIN projects p ON p.id = q.project_id
    JOIN organisation_members om ON om.organisation_id = p.organisation_id
    WHERE q.id = check_quote_id
    AND om.user_id = check_user_id
    AND om.status = 'active'
  )
  OR
  -- God-Mode users can access all quotes
  EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = check_user_id
    AND email IN ('chris@optimalfire.co.nz', 'pieter@optimalfire.co.nz')
  );
$$;

-- Helper function to check if user can access a parsing job
CREATE OR REPLACE FUNCTION public.can_user_access_parsing_job(check_job_id uuid, check_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM parsing_jobs pj
    JOIN projects p ON p.id = pj.project_id
    JOIN organisation_members om ON om.organisation_id = p.organisation_id
    WHERE pj.id = check_job_id
    AND om.user_id = check_user_id
    AND om.status = 'active'
  )
  OR
  -- God-Mode users can access all jobs
  EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = check_user_id
    AND email IN ('chris@optimalfire.co.nz', 'pieter@optimalfire.co.nz')
  );
$$;

-- ============= QUOTE_ITEMS POLICIES =============

DROP POLICY IF EXISTS "Users can view quote items in their organisation" ON quote_items;
CREATE POLICY "Users can view quote items in their organisation"
  ON quote_items FOR SELECT
  TO authenticated
  USING (
    can_user_access_quote(quote_id, auth.uid())
  );

DROP POLICY IF EXISTS "Users can insert quote items in their organisation" ON quote_items;
CREATE POLICY "Users can insert quote items in their organisation"
  ON quote_items FOR INSERT
  TO authenticated
  WITH CHECK (
    can_user_access_quote(quote_id, auth.uid())
  );

DROP POLICY IF EXISTS "Users can update quote items in their organisation" ON quote_items;
CREATE POLICY "Users can update quote items in their organisation"
  ON quote_items FOR UPDATE
  TO authenticated
  USING (
    can_user_access_quote(quote_id, auth.uid())
  );

DROP POLICY IF EXISTS "Users can delete quote items in their organisation" ON quote_items;
CREATE POLICY "Users can delete quote items in their organisation"
  ON quote_items FOR DELETE
  TO authenticated
  USING (
    can_user_access_quote(quote_id, auth.uid())
  );

-- ============= PARSING_JOBS POLICIES =============

DROP POLICY IF EXISTS "Users can view parsing jobs in their organisation" ON parsing_jobs;
CREATE POLICY "Users can view parsing jobs in their organisation"
  ON parsing_jobs FOR SELECT
  TO authenticated
  USING (
    can_user_access_project(project_id, auth.uid())
  );

DROP POLICY IF EXISTS "Users can create parsing jobs in their organisation" ON parsing_jobs;
CREATE POLICY "Users can create parsing jobs in their organisation"
  ON parsing_jobs FOR INSERT
  TO authenticated
  WITH CHECK (
    can_user_access_project(project_id, auth.uid())
  );

DROP POLICY IF EXISTS "Users can update parsing jobs in their organisation" ON parsing_jobs;
CREATE POLICY "Users can update parsing jobs in their organisation"
  ON parsing_jobs FOR UPDATE
  TO authenticated
  USING (
    can_user_access_project(project_id, auth.uid())
  );

DROP POLICY IF EXISTS "Users can delete parsing jobs in their organisation" ON parsing_jobs;
CREATE POLICY "Users can delete parsing jobs in their organisation"
  ON parsing_jobs FOR DELETE
  TO authenticated
  USING (
    can_user_access_project(project_id, auth.uid())
  );

-- ============= PARSING_CHUNKS POLICIES =============

DROP POLICY IF EXISTS "Users can view chunks for jobs in their organisation" ON parsing_chunks;
CREATE POLICY "Users can view chunks for jobs in their organisation"
  ON parsing_chunks FOR SELECT
  TO authenticated
  USING (
    can_user_access_parsing_job(job_id, auth.uid())
  );

DROP POLICY IF EXISTS "Users can create chunks for jobs in their organisation" ON parsing_chunks;
CREATE POLICY "Users can create chunks for jobs in their organisation"
  ON parsing_chunks FOR INSERT
  TO authenticated
  WITH CHECK (
    can_user_access_parsing_job(job_id, auth.uid())
  );

DROP POLICY IF EXISTS "Users can update chunks for jobs in their organisation" ON parsing_chunks;
CREATE POLICY "Users can update chunks for jobs in their organisation"
  ON parsing_chunks FOR UPDATE
  TO authenticated
  USING (
    can_user_access_parsing_job(job_id, auth.uid())
  );

DROP POLICY IF EXISTS "Users can delete chunks for jobs in their organisation" ON parsing_chunks;
CREATE POLICY "Users can delete chunks for jobs in their organisation"
  ON parsing_chunks FOR DELETE
  TO authenticated
  USING (
    can_user_access_parsing_job(job_id, auth.uid())
  );
