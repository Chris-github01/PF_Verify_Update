/*
  # Security Fixes - Part 2c: RLS Policy Optimization (Quotes & Quote Items)

  1. Changes
    - Wrap all auth.uid() calls with (select ...)
  
  2. Tables Affected
    - quotes (all CRUD policies)
    - quote_items (all CRUD policies)
*/

-- Quote items policies
DROP POLICY IF EXISTS "Users can view quote_items in their organisation" ON public.quote_items;
CREATE POLICY "Users can view quote_items in their organisation"
  ON public.quote_items FOR SELECT
  TO authenticated
  USING (
    quote_id IN (
      SELECT q.id
      FROM public.quotes q
      JOIN public.projects p ON q.project_id = p.id
      JOIN public.organisation_members om ON p.organisation_id = om.organisation_id
      WHERE om.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can create quote_items in their organisation" ON public.quote_items;
CREATE POLICY "Users can create quote_items in their organisation"
  ON public.quote_items FOR INSERT
  TO authenticated
  WITH CHECK (
    quote_id IN (
      SELECT q.id
      FROM public.quotes q
      JOIN public.projects p ON q.project_id = p.id
      JOIN public.organisation_members om ON p.organisation_id = om.organisation_id
      WHERE om.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can update quote_items in their organisation" ON public.quote_items;
CREATE POLICY "Users can update quote_items in their organisation"
  ON public.quote_items FOR UPDATE
  TO authenticated
  USING (
    quote_id IN (
      SELECT q.id
      FROM public.quotes q
      JOIN public.projects p ON q.project_id = p.id
      JOIN public.organisation_members om ON p.organisation_id = om.organisation_id
      WHERE om.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can delete quote_items in their organisation" ON public.quote_items;
CREATE POLICY "Users can delete quote_items in their organisation"
  ON public.quote_items FOR DELETE
  TO authenticated
  USING (
    quote_id IN (
      SELECT q.id
      FROM public.quotes q
      JOIN public.projects p ON q.project_id = p.id
      JOIN public.organisation_members om ON p.organisation_id = om.organisation_id
      WHERE om.user_id = (SELECT auth.uid())
    )
  );

-- Quotes policies
DROP POLICY IF EXISTS "Users can view quotes in their organisation projects" ON public.quotes;
CREATE POLICY "Users can view quotes in their organisation projects"
  ON public.quotes FOR SELECT
  TO authenticated
  USING (
    project_id IN (
      SELECT p.id
      FROM public.projects p
      JOIN public.organisation_members om ON p.organisation_id = om.organisation_id
      WHERE om.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can create quotes in their organisation projects" ON public.quotes;
CREATE POLICY "Users can create quotes in their organisation projects"
  ON public.quotes FOR INSERT
  TO authenticated
  WITH CHECK (
    project_id IN (
      SELECT p.id
      FROM public.projects p
      JOIN public.organisation_members om ON p.organisation_id = om.organisation_id
      WHERE om.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can update quotes in their organisation projects" ON public.quotes;
CREATE POLICY "Users can update quotes in their organisation projects"
  ON public.quotes FOR UPDATE
  TO authenticated
  USING (
    project_id IN (
      SELECT p.id
      FROM public.projects p
      JOIN public.organisation_members om ON p.organisation_id = om.organisation_id
      WHERE om.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can delete quotes in their organisation projects" ON public.quotes;
CREATE POLICY "Users can delete quotes in their organisation projects"
  ON public.quotes FOR DELETE
  TO authenticated
  USING (
    project_id IN (
      SELECT p.id
      FROM public.projects p
      JOIN public.organisation_members om ON p.organisation_id = om.organisation_id
      WHERE om.user_id = (SELECT auth.uid())
    )
  );