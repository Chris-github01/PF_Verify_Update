/*
  # Fix Auth RLS Initialization Plan - Batch 2
  
  Covers: contract_allowances, boq_tenderer_map, scope_gaps, parsing_chunks,
  quote_items, contract_variations, progress_claims, tag_library, project_tags,
  boq_exports, projects, subcontract_field_values, suppliers, quotes
*/

-- contract_allowances
DROP POLICY IF EXISTS "Users can delete allowances in their org projects" ON public.contract_allowances;
CREATE POLICY "Users can delete allowances in their org projects"
  ON public.contract_allowances FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = contract_allowances.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can insert allowances in their org projects" ON public.contract_allowances;
CREATE POLICY "Users can insert allowances in their org projects"
  ON public.contract_allowances FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = contract_allowances.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can update allowances in their org projects" ON public.contract_allowances;
CREATE POLICY "Users can update allowances in their org projects"
  ON public.contract_allowances FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = contract_allowances.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = contract_allowances.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can view allowances in their org projects" ON public.contract_allowances;
CREATE POLICY "Users can view allowances in their org projects"
  ON public.contract_allowances FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = contract_allowances.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- boq_tenderer_map
DROP POLICY IF EXISTS "Users can delete tenderer mappings for their organisation's pro" ON public.boq_tenderer_map;
CREATE POLICY "Users can delete tenderer mappings for their organisation's pro"
  ON public.boq_tenderer_map FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = boq_tenderer_map.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can insert tenderer mappings for their organisation's pro" ON public.boq_tenderer_map;
CREATE POLICY "Users can insert tenderer mappings for their organisation's pro"
  ON public.boq_tenderer_map FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = boq_tenderer_map.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can update tenderer mappings for their organisation's pro" ON public.boq_tenderer_map;
CREATE POLICY "Users can update tenderer mappings for their organisation's pro"
  ON public.boq_tenderer_map FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = boq_tenderer_map.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = boq_tenderer_map.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can view tenderer mappings for their organisation's proje" ON public.boq_tenderer_map;
CREATE POLICY "Users can view tenderer mappings for their organisation's proje"
  ON public.boq_tenderer_map FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = boq_tenderer_map.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- scope_gaps
DROP POLICY IF EXISTS "Users can delete scope gaps for their organisation's projects" ON public.scope_gaps;
CREATE POLICY "Users can delete scope gaps for their organisation's projects"
  ON public.scope_gaps FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = scope_gaps.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can insert scope gaps for their organisation's projects" ON public.scope_gaps;
CREATE POLICY "Users can insert scope gaps for their organisation's projects"
  ON public.scope_gaps FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = scope_gaps.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can update scope gaps for their organisation's projects" ON public.scope_gaps;
CREATE POLICY "Users can update scope gaps for their organisation's projects"
  ON public.scope_gaps FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = scope_gaps.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = scope_gaps.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can view scope gaps for their organisation's projects" ON public.scope_gaps;
CREATE POLICY "Users can view scope gaps for their organisation's projects"
  ON public.scope_gaps FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = scope_gaps.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- parsing_chunks
DROP POLICY IF EXISTS "Users can delete parsing chunks" ON public.parsing_chunks;
CREATE POLICY "Users can delete parsing chunks"
  ON public.parsing_chunks FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.parsing_jobs pj
    WHERE pj.id = parsing_chunks.job_id
      AND pj.user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "Users can update parsing chunks" ON public.parsing_chunks;
CREATE POLICY "Users can update parsing chunks"
  ON public.parsing_chunks FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.parsing_jobs pj
    WHERE pj.id = parsing_chunks.job_id
      AND pj.user_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.parsing_jobs pj
    WHERE pj.id = parsing_chunks.job_id
      AND pj.user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "Users can view parsing chunks" ON public.parsing_chunks;
CREATE POLICY "Users can view parsing chunks"
  ON public.parsing_chunks FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.parsing_jobs pj
    WHERE pj.id = parsing_chunks.job_id
      AND pj.user_id = (SELECT auth.uid())
  ));

-- quote_items
DROP POLICY IF EXISTS "Users and admins can view quote items" ON public.quote_items;
CREATE POLICY "Users and admins can view quote items"
  ON public.quote_items FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.quotes q
    JOIN public.organisation_members om ON om.organisation_id = q.organisation_id
    WHERE q.id = quote_items.quote_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can delete quote items" ON public.quote_items;
CREATE POLICY "Users can delete quote items"
  ON public.quote_items FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.quotes q
    JOIN public.organisation_members om ON om.organisation_id = q.organisation_id
    WHERE q.id = quote_items.quote_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can update quote items" ON public.quote_items;
CREATE POLICY "Users can update quote items"
  ON public.quote_items FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.quotes q
    JOIN public.organisation_members om ON om.organisation_id = q.organisation_id
    WHERE q.id = quote_items.quote_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.quotes q
    JOIN public.organisation_members om ON om.organisation_id = q.organisation_id
    WHERE q.id = quote_items.quote_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));
