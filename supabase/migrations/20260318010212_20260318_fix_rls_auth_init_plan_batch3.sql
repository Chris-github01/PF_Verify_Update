/*
  # Fix Auth RLS Initialization Plan - Batch 3
  
  Covers: contract_variations, progress_claims, tag_library, project_tags,
  boq_exports, projects, suppliers, quotes, fire_engineer_schedules,
  schedule_boq_links, fire_engineer_schedule_rows
*/

-- contract_variations
DROP POLICY IF EXISTS "Users can delete variations in their organisation projects" ON public.contract_variations;
CREATE POLICY "Users can delete variations in their organisation projects"
  ON public.contract_variations FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = contract_variations.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can insert variations in their organisation projects" ON public.contract_variations;
CREATE POLICY "Users can insert variations in their organisation projects"
  ON public.contract_variations FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = contract_variations.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can update variations in their organisation projects" ON public.contract_variations;
CREATE POLICY "Users can update variations in their organisation projects"
  ON public.contract_variations FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = contract_variations.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = contract_variations.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can view variations in their organisation projects" ON public.contract_variations;
CREATE POLICY "Users can view variations in their organisation projects"
  ON public.contract_variations FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = contract_variations.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- progress_claims
DROP POLICY IF EXISTS "Users can delete progress claims in their organisation projects" ON public.progress_claims;
CREATE POLICY "Users can delete progress claims in their organisation projects"
  ON public.progress_claims FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = progress_claims.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can insert progress claims in their organisation projects" ON public.progress_claims;
CREATE POLICY "Users can insert progress claims in their organisation projects"
  ON public.progress_claims FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = progress_claims.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can update progress claims in their organisation projects" ON public.progress_claims;
CREATE POLICY "Users can update progress claims in their organisation projects"
  ON public.progress_claims FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = progress_claims.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = progress_claims.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can view progress claims in their organisation projects" ON public.progress_claims;
CREATE POLICY "Users can view progress claims in their organisation projects"
  ON public.progress_claims FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = progress_claims.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- tag_library
DROP POLICY IF EXISTS "Platform admins can manage tag library" ON public.tag_library;
CREATE POLICY "Platform admins can manage tag library"
  ON public.tag_library FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.platform_admins pa
    WHERE pa.user_id = (SELECT auth.uid()) AND pa.is_active = true
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.platform_admins pa
    WHERE pa.user_id = (SELECT auth.uid()) AND pa.is_active = true
  ));

-- project_tags
DROP POLICY IF EXISTS "Users can delete project tags for their organisation's projects" ON public.project_tags;
CREATE POLICY "Users can delete project tags for their organisation's projects"
  ON public.project_tags FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = project_tags.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can insert project tags for their organisation's projects" ON public.project_tags;
CREATE POLICY "Users can insert project tags for their organisation's projects"
  ON public.project_tags FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = project_tags.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can update project tags for their organisation's projects" ON public.project_tags;
CREATE POLICY "Users can update project tags for their organisation's projects"
  ON public.project_tags FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = project_tags.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = project_tags.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can view project tags for their organisation's projects" ON public.project_tags;
CREATE POLICY "Users can view project tags for their organisation's projects"
  ON public.project_tags FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = project_tags.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- boq_exports
DROP POLICY IF EXISTS "Users can insert BOQ exports for their organisation's projects" ON public.boq_exports;
CREATE POLICY "Users can insert BOQ exports for their organisation's projects"
  ON public.boq_exports FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = boq_exports.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can view BOQ exports for their organisation's projects" ON public.boq_exports;
CREATE POLICY "Users can view BOQ exports for their organisation's projects"
  ON public.boq_exports FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = boq_exports.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- projects
DROP POLICY IF EXISTS "Users can update their org projects" ON public.projects;
CREATE POLICY "Users can update their org projects"
  ON public.projects FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = projects.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = projects.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can view their org projects" ON public.projects;
CREATE POLICY "Users can view their org projects"
  ON public.projects FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = projects.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- suppliers
DROP POLICY IF EXISTS "Org admins can delete suppliers" ON public.suppliers;
CREATE POLICY "Org admins can delete suppliers"
  ON public.suppliers FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = suppliers.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin')
  ));

DROP POLICY IF EXISTS "Org admins can update suppliers" ON public.suppliers;
CREATE POLICY "Org admins can update suppliers"
  ON public.suppliers FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = suppliers.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = suppliers.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin')
  ));

DROP POLICY IF EXISTS "Users can view suppliers in their org" ON public.suppliers;
CREATE POLICY "Users can view suppliers in their org"
  ON public.suppliers FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = suppliers.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- quotes
DROP POLICY IF EXISTS "Users and admins can view quotes" ON public.quotes;
CREATE POLICY "Users and admins can view quotes"
  ON public.quotes FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = quotes.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can delete quotes" ON public.quotes;
CREATE POLICY "Users can delete quotes"
  ON public.quotes FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = quotes.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can update quotes" ON public.quotes;
CREATE POLICY "Users can update quotes"
  ON public.quotes FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = quotes.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = quotes.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));
