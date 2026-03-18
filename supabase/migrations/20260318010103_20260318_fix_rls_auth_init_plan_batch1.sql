/*
  # Fix Auth RLS Initialization Plan - Batch 1
  
  Replaces auth.uid() with (select auth.uid()) in RLS policies to avoid
  per-row re-evaluation and improve query performance at scale.
  
  Covers: organisation_members, platform_admins, project_settings, parsing_jobs,
  scope_categories, award_approvals, award_reports, contract_allowances,
  boq_tenderer_map, scope_gaps, parsing_chunks, quote_items
*/

-- organisation_members
DROP POLICY IF EXISTS "Users can view their own memberships" ON public.organisation_members;
CREATE POLICY "Users can view their own memberships"
  ON public.organisation_members FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- platform_admins
DROP POLICY IF EXISTS "Admins can view all platform admins" ON public.platform_admins;
CREATE POLICY "Admins can view all platform admins"
  ON public.platform_admins FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.platform_admins pa
    WHERE pa.user_id = (SELECT auth.uid()) AND pa.is_active = true
  ));

DROP POLICY IF EXISTS "Users can view their own admin status" ON public.platform_admins;
CREATE POLICY "Users can view their own admin status"
  ON public.platform_admins FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- project_settings
DROP POLICY IF EXISTS "Users can delete project settings in their org" ON public.project_settings;
CREATE POLICY "Users can delete project settings in their org"
  ON public.project_settings FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = project_settings.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can insert project settings in their org" ON public.project_settings;
CREATE POLICY "Users can insert project settings in their org"
  ON public.project_settings FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = project_settings.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can update project settings in their org" ON public.project_settings;
CREATE POLICY "Users can update project settings in their org"
  ON public.project_settings FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = project_settings.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = project_settings.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can view project settings in their org" ON public.project_settings;
CREATE POLICY "Users can view project settings in their org"
  ON public.project_settings FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = project_settings.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- parsing_jobs
DROP POLICY IF EXISTS "Users can delete their parsing jobs" ON public.parsing_jobs;
CREATE POLICY "Users can delete their parsing jobs"
  ON public.parsing_jobs FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can insert their parsing jobs" ON public.parsing_jobs;
CREATE POLICY "Users can insert their parsing jobs"
  ON public.parsing_jobs FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update their parsing jobs" ON public.parsing_jobs;
CREATE POLICY "Users can update their parsing jobs"
  ON public.parsing_jobs FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can view their parsing jobs" ON public.parsing_jobs;
CREATE POLICY "Users can view their parsing jobs"
  ON public.parsing_jobs FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- scope_categories
DROP POLICY IF EXISTS "Users can delete scope categories in their org projects" ON public.scope_categories;
CREATE POLICY "Users can delete scope categories in their org projects"
  ON public.scope_categories FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = scope_categories.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can insert scope categories in their org projects" ON public.scope_categories;
CREATE POLICY "Users can insert scope categories in their org projects"
  ON public.scope_categories FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = scope_categories.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can update scope categories in their org projects" ON public.scope_categories;
CREATE POLICY "Users can update scope categories in their org projects"
  ON public.scope_categories FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = scope_categories.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = scope_categories.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can view scope categories in their org projects" ON public.scope_categories;
CREATE POLICY "Users can view scope categories in their org projects"
  ON public.scope_categories FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = scope_categories.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- award_approvals
DROP POLICY IF EXISTS "Organisation members can update approvals" ON public.award_approvals;
CREATE POLICY "Organisation members can update approvals"
  ON public.award_approvals FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = award_approvals.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = award_approvals.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can insert approvals in their organisation" ON public.award_approvals;
CREATE POLICY "Users can insert approvals in their organisation"
  ON public.award_approvals FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = award_approvals.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can view approvals in their organisation" ON public.award_approvals;
CREATE POLICY "Users can view approvals in their organisation"
  ON public.award_approvals FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = award_approvals.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- award_reports
DROP POLICY IF EXISTS "Users can delete award reports in their org" ON public.award_reports;
CREATE POLICY "Users can delete award reports in their org"
  ON public.award_reports FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = award_reports.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can update award reports in their org" ON public.award_reports;
CREATE POLICY "Users can update award reports in their org"
  ON public.award_reports FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = award_reports.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = award_reports.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can view award reports in their org" ON public.award_reports;
CREATE POLICY "Users can view award reports in their org"
  ON public.award_reports FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = award_reports.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));
