/*
  # Fix Remaining Policies Using Project-Based Checks

  1. Solution
    - Create helper function for project membership check
    - Update all project-based policies
*/

-- Create helper function to check if user has access to a project
DROP FUNCTION IF EXISTS public.user_can_access_project(uuid, uuid);
CREATE OR REPLACE FUNCTION public.user_can_access_project(proj_id uuid, user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = proj_id
      AND public.user_is_org_member(p.organisation_id, user_id)
  );
$$;

-- Update award_reports policies
DROP POLICY IF EXISTS "Users can view award reports for their projects" ON public.award_reports;
CREATE POLICY "Users can view award reports for their projects"
  ON public.award_reports FOR SELECT
  TO authenticated
  USING (
    public.user_can_access_project(project_id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Users can create award reports for their projects" ON public.award_reports;
CREATE POLICY "Users can create award reports for their projects"
  ON public.award_reports FOR INSERT
  TO authenticated
  WITH CHECK (
    public.user_can_access_project(project_id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Users can update award reports for their projects" ON public.award_reports;
CREATE POLICY "Users can update award reports for their projects"
  ON public.award_reports FOR UPDATE
  TO authenticated
  USING (
    public.user_can_access_project(project_id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Users can delete award reports for their projects" ON public.award_reports;
CREATE POLICY "Users can delete award reports for their projects"
  ON public.award_reports FOR DELETE
  TO authenticated
  USING (
    public.user_can_access_project(project_id, (SELECT auth.uid()))
  );

-- Update quotes policies
DROP POLICY IF EXISTS "Users can view quotes in their organisation projects" ON public.quotes;
CREATE POLICY "Users can view quotes in their organisation projects"
  ON public.quotes FOR SELECT
  TO authenticated
  USING (
    public.user_can_access_project(project_id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Users can create quotes in their organisation projects" ON public.quotes;
CREATE POLICY "Users can create quotes in their organisation projects"
  ON public.quotes FOR INSERT
  TO authenticated
  WITH CHECK (
    public.user_can_access_project(project_id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Users can update quotes in their organisation projects" ON public.quotes;
CREATE POLICY "Users can update quotes in their organisation projects"
  ON public.quotes FOR UPDATE
  TO authenticated
  USING (
    public.user_can_access_project(project_id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Users can delete quotes in their organisation projects" ON public.quotes;
CREATE POLICY "Users can delete quotes in their organisation projects"
  ON public.quotes FOR DELETE
  TO authenticated
  USING (
    public.user_can_access_project(project_id, (SELECT auth.uid()))
  );

-- Create helper for quote access (for quote_items)
DROP FUNCTION IF EXISTS public.user_can_access_quote(uuid, uuid);
CREATE OR REPLACE FUNCTION public.user_can_access_quote(quote_id_param uuid, user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.quotes q
    WHERE q.id = quote_id_param
      AND public.user_can_access_project(q.project_id, user_id)
  );
$$;

-- Update quote_items policies
DROP POLICY IF EXISTS "Users can view quote_items in their organisation" ON public.quote_items;
CREATE POLICY "Users can view quote_items in their organisation"
  ON public.quote_items FOR SELECT
  TO authenticated
  USING (
    public.user_can_access_quote(quote_id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Users can create quote_items in their organisation" ON public.quote_items;
CREATE POLICY "Users can create quote_items in their organisation"
  ON public.quote_items FOR INSERT
  TO authenticated
  WITH CHECK (
    public.user_can_access_quote(quote_id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Users can update quote_items in their organisation" ON public.quote_items;
CREATE POLICY "Users can update quote_items in their organisation"
  ON public.quote_items FOR UPDATE
  TO authenticated
  USING (
    public.user_can_access_quote(quote_id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Users can delete quote_items in their organisation" ON public.quote_items;
CREATE POLICY "Users can delete quote_items in their organisation"
  ON public.quote_items FOR DELETE
  TO authenticated
  USING (
    public.user_can_access_quote(quote_id, (SELECT auth.uid()))
  );

-- Update project_settings policies
DROP POLICY IF EXISTS "Users can view project_settings in their organisation" ON public.project_settings;
CREATE POLICY "Users can view project_settings in their organisation"
  ON public.project_settings FOR SELECT
  TO authenticated
  USING (
    public.user_can_access_project(project_id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Users can create project_settings in their organisation" ON public.project_settings;
CREATE POLICY "Users can create project_settings in their organisation"
  ON public.project_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    public.user_can_access_project(project_id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Users can update project_settings in their organisation" ON public.project_settings;
CREATE POLICY "Users can update project_settings in their organisation"
  ON public.project_settings FOR UPDATE
  TO authenticated
  USING (
    public.user_can_access_project(project_id, (SELECT auth.uid()))
  );

-- Update review_queue policies
DROP POLICY IF EXISTS "Users can view review queue for their organisation" ON public.review_queue;
CREATE POLICY "Users can view review queue for their organisation"
  ON public.review_queue FOR SELECT
  TO authenticated
  USING (
    public.user_can_access_project(project_id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Users can update review queue for their organisation" ON public.review_queue;
CREATE POLICY "Users can update review queue for their organisation"
  ON public.review_queue FOR UPDATE
  TO authenticated
  USING (
    public.user_can_access_project(project_id, (SELECT auth.uid()))
  );