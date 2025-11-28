/*
  # Security Fixes - Part 2d: RLS Policy Optimization (Remaining Tables - Corrected)

  1. Changes
    - Wrap all auth.uid() calls with (select ...)
    - Fixed column names based on actual schema
  
  2. Tables Affected
    - scope_categories (uses project_id)
    - parsing_jobs
    - parsing_chunks (uses job_id, not parsing_job_id)
    - organisation_members
    - project_settings
*/

-- Scope categories policies (project-based)
DROP POLICY IF EXISTS "Users can view scope_categories in their organisation" ON public.scope_categories;
CREATE POLICY "Users can view scope_categories in their organisation"
  ON public.scope_categories FOR SELECT
  TO authenticated
  USING (
    project_id IN (
      SELECT p.id
      FROM public.projects p
      JOIN public.organisation_members om ON p.organisation_id = om.organisation_id
      WHERE om.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can create scope_categories in their organisation" ON public.scope_categories;
CREATE POLICY "Users can create scope_categories in their organisation"
  ON public.scope_categories FOR INSERT
  TO authenticated
  WITH CHECK (
    project_id IN (
      SELECT p.id
      FROM public.projects p
      JOIN public.organisation_members om ON p.organisation_id = om.organisation_id
      WHERE om.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can update scope_categories in their organisation" ON public.scope_categories;
CREATE POLICY "Users can update scope_categories in their organisation"
  ON public.scope_categories FOR UPDATE
  TO authenticated
  USING (
    project_id IN (
      SELECT p.id
      FROM public.projects p
      JOIN public.organisation_members om ON p.organisation_id = om.organisation_id
      WHERE om.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can delete scope_categories in their organisation" ON public.scope_categories;
CREATE POLICY "Users can delete scope_categories in their organisation"
  ON public.scope_categories FOR DELETE
  TO authenticated
  USING (
    project_id IN (
      SELECT p.id
      FROM public.projects p
      JOIN public.organisation_members om ON p.organisation_id = om.organisation_id
      WHERE om.user_id = (SELECT auth.uid())
    )
  );

-- Parsing jobs policies
DROP POLICY IF EXISTS "Users can view their own parsing jobs" ON public.parsing_jobs;
CREATE POLICY "Users can view their own parsing jobs"
  ON public.parsing_jobs FOR SELECT
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id
      FROM public.organisation_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can create parsing jobs" ON public.parsing_jobs;
CREATE POLICY "Users can create parsing jobs"
  ON public.parsing_jobs FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update their own parsing jobs" ON public.parsing_jobs;
CREATE POLICY "Users can update their own parsing jobs"
  ON public.parsing_jobs FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Parsing chunks policies (uses job_id)
DROP POLICY IF EXISTS "Users can view chunks for their parsing jobs" ON public.parsing_chunks;
CREATE POLICY "Users can view chunks for their parsing jobs"
  ON public.parsing_chunks FOR SELECT
  TO authenticated
  USING (
    job_id IN (
      SELECT id
      FROM public.parsing_jobs
      WHERE user_id = (SELECT auth.uid())
    )
  );

-- Organisation members policies
DROP POLICY IF EXISTS "Users can view org members" ON public.organisation_members;
CREATE POLICY "Users can view org members"
  ON public.organisation_members FOR SELECT
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id
      FROM public.organisation_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Admins can add members" ON public.organisation_members;
CREATE POLICY "Admins can add members"
  ON public.organisation_members FOR INSERT
  TO authenticated
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id
      FROM public.organisation_members
      WHERE user_id = (SELECT auth.uid())
        AND role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Admins can update members" ON public.organisation_members;
CREATE POLICY "Admins can update members"
  ON public.organisation_members FOR UPDATE
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id
      FROM public.organisation_members
      WHERE user_id = (SELECT auth.uid())
        AND role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Admins can delete members" ON public.organisation_members;
CREATE POLICY "Admins can delete members"
  ON public.organisation_members FOR DELETE
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id
      FROM public.organisation_members
      WHERE user_id = (SELECT auth.uid())
        AND role IN ('owner', 'admin')
    )
  );

-- Project settings policies
DROP POLICY IF EXISTS "Users can view project_settings in their organisation" ON public.project_settings;
CREATE POLICY "Users can view project_settings in their organisation"
  ON public.project_settings FOR SELECT
  TO authenticated
  USING (
    project_id IN (
      SELECT p.id
      FROM public.projects p
      JOIN public.organisation_members om ON p.organisation_id = om.organisation_id
      WHERE om.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can create project_settings in their organisation" ON public.project_settings;
CREATE POLICY "Users can create project_settings in their organisation"
  ON public.project_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    project_id IN (
      SELECT p.id
      FROM public.projects p
      JOIN public.organisation_members om ON p.organisation_id = om.organisation_id
      WHERE om.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can update project_settings in their organisation" ON public.project_settings;
CREATE POLICY "Users can update project_settings in their organisation"
  ON public.project_settings FOR UPDATE
  TO authenticated
  USING (
    project_id IN (
      SELECT p.id
      FROM public.projects p
      JOIN public.organisation_members om ON p.organisation_id = om.organisation_id
      WHERE om.user_id = (SELECT auth.uid())
    )
  );