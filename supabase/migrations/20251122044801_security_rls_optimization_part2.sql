/*
  # Security Fixes - Part 2b: RLS Policy Optimization (Projects & Award Reports)

  1. Changes
    - Wrap all auth.uid() calls with (select ...)
  
  2. Tables Affected
    - projects (all CRUD policies)
    - award_reports (all CRUD policies)
*/

-- Projects policies
DROP POLICY IF EXISTS "Users can view projects in their organisation" ON public.projects;
CREATE POLICY "Users can view projects in their organisation"
  ON public.projects FOR SELECT
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id
      FROM public.organisation_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can create projects in their organisation" ON public.projects;
CREATE POLICY "Users can create projects in their organisation"
  ON public.projects FOR INSERT
  TO authenticated
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id
      FROM public.organisation_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can update projects in their organisation" ON public.projects;
CREATE POLICY "Users can update projects in their organisation"
  ON public.projects FOR UPDATE
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id
      FROM public.organisation_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can delete projects in their organisation" ON public.projects;
CREATE POLICY "Users can delete projects in their organisation"
  ON public.projects FOR DELETE
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id
      FROM public.organisation_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

-- Award reports policies
DROP POLICY IF EXISTS "Users can view award reports for their projects" ON public.award_reports;
CREATE POLICY "Users can view award reports for their projects"
  ON public.award_reports FOR SELECT
  TO authenticated
  USING (
    project_id IN (
      SELECT p.id
      FROM public.projects p
      JOIN public.organisation_members om ON p.organisation_id = om.organisation_id
      WHERE om.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can create award reports for their projects" ON public.award_reports;
CREATE POLICY "Users can create award reports for their projects"
  ON public.award_reports FOR INSERT
  TO authenticated
  WITH CHECK (
    project_id IN (
      SELECT p.id
      FROM public.projects p
      JOIN public.organisation_members om ON p.organisation_id = om.organisation_id
      WHERE om.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can update award reports for their projects" ON public.award_reports;
CREATE POLICY "Users can update award reports for their projects"
  ON public.award_reports FOR UPDATE
  TO authenticated
  USING (
    project_id IN (
      SELECT p.id
      FROM public.projects p
      JOIN public.organisation_members om ON p.organisation_id = om.organisation_id
      WHERE om.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can delete award reports for their projects" ON public.award_reports;
CREATE POLICY "Users can delete award reports for their projects"
  ON public.award_reports FOR DELETE
  TO authenticated
  USING (
    project_id IN (
      SELECT p.id
      FROM public.projects p
      JOIN public.organisation_members om ON p.organisation_id = om.organisation_id
      WHERE om.user_id = (SELECT auth.uid())
    )
  );