/*
  # Security Fixes - Part 2e: RLS Policy Optimization (Final Tables - Corrected)

  1. Changes
    - Wrap all auth.uid() calls with (select ...)
    - Only update policies that actually exist
  
  2. Tables Affected
    - library_items
    - supplier_template_fingerprints
    - review_queue
*/

-- Library items policies
DROP POLICY IF EXISTS "Users can view library items in their organisation" ON public.library_items;
CREATE POLICY "Users can view library items in their organisation"
  ON public.library_items FOR SELECT
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id
      FROM public.organisation_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Admins can insert library items" ON public.library_items;
CREATE POLICY "Admins can insert library items"
  ON public.library_items FOR INSERT
  TO authenticated
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id
      FROM public.organisation_members
      WHERE user_id = (SELECT auth.uid())
        AND role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Admins can update library items" ON public.library_items;
CREATE POLICY "Admins can update library items"
  ON public.library_items FOR UPDATE
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id
      FROM public.organisation_members
      WHERE user_id = (SELECT auth.uid())
        AND role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Admins can delete library items" ON public.library_items;
CREATE POLICY "Admins can delete library items"
  ON public.library_items FOR DELETE
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id
      FROM public.organisation_members
      WHERE user_id = (SELECT auth.uid())
        AND role IN ('owner', 'admin')
    )
  );

-- Supplier template fingerprints policies
DROP POLICY IF EXISTS "Users can read templates from their org" ON public.supplier_template_fingerprints;
CREATE POLICY "Users can read templates from their org"
  ON public.supplier_template_fingerprints FOR SELECT
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id
      FROM public.organisation_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can insert templates for their org" ON public.supplier_template_fingerprints;
CREATE POLICY "Users can insert templates for their org"
  ON public.supplier_template_fingerprints FOR INSERT
  TO authenticated
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id
      FROM public.organisation_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can update templates from their org" ON public.supplier_template_fingerprints;
CREATE POLICY "Users can update templates from their org"
  ON public.supplier_template_fingerprints FOR UPDATE
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id
      FROM public.organisation_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

-- Review queue policies
DROP POLICY IF EXISTS "Users can view review queue for their organisation" ON public.review_queue;
CREATE POLICY "Users can view review queue for their organisation"
  ON public.review_queue FOR SELECT
  TO authenticated
  USING (
    project_id IN (
      SELECT p.id
      FROM public.projects p
      JOIN public.organisation_members om ON p.organisation_id = om.organisation_id
      WHERE om.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can update review queue for their organisation" ON public.review_queue;
CREATE POLICY "Users can update review queue for their organisation"
  ON public.review_queue FOR UPDATE
  TO authenticated
  USING (
    project_id IN (
      SELECT p.id
      FROM public.projects p
      JOIN public.organisation_members om ON p.organisation_id = om.organisation_id
      WHERE om.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "System can insert into review queue" ON public.review_queue;
CREATE POLICY "System can insert into review queue"
  ON public.review_queue FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);