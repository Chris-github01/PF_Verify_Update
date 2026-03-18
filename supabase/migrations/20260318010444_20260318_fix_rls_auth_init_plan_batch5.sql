/*
  # Fix Auth RLS Initialization Plan - Batch 5
  
  Covers: contract_inclusions, contract_exclusions, base_tracker_exports,
  variation_register, base_tracker_claims, commercial_audit_log, prelet_appendix,
  contract_tags_clarifications, commercial_baseline_items, subcontract_agreements,
  contract_workflow_progress, contract_templates, subcontract_field_definitions,
  boq_lines, import_audit_logs, subcontract_agreement_versions
*/

-- contract_inclusions
DROP POLICY IF EXISTS "Users can delete inclusions in their org projects" ON public.contract_inclusions;
CREATE POLICY "Users can delete inclusions in their org projects"
  ON public.contract_inclusions FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = contract_inclusions.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can insert inclusions in their org projects" ON public.contract_inclusions;
CREATE POLICY "Users can insert inclusions in their org projects"
  ON public.contract_inclusions FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = contract_inclusions.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can update inclusions in their org projects" ON public.contract_inclusions;
CREATE POLICY "Users can update inclusions in their org projects"
  ON public.contract_inclusions FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = contract_inclusions.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = contract_inclusions.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can view inclusions in their org projects" ON public.contract_inclusions;
CREATE POLICY "Users can view inclusions in their org projects"
  ON public.contract_inclusions FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = contract_inclusions.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- contract_exclusions
DROP POLICY IF EXISTS "Users can delete exclusions in their org projects" ON public.contract_exclusions;
CREATE POLICY "Users can delete exclusions in their org projects"
  ON public.contract_exclusions FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = contract_exclusions.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can insert exclusions in their org projects" ON public.contract_exclusions;
CREATE POLICY "Users can insert exclusions in their org projects"
  ON public.contract_exclusions FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = contract_exclusions.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can update exclusions in their org projects" ON public.contract_exclusions;
CREATE POLICY "Users can update exclusions in their org projects"
  ON public.contract_exclusions FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = contract_exclusions.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = contract_exclusions.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can view exclusions in their org projects" ON public.contract_exclusions;
CREATE POLICY "Users can view exclusions in their org projects"
  ON public.contract_exclusions FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = contract_exclusions.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- base_tracker_exports
DROP POLICY IF EXISTS "Users can create base trackers for their organisation's project" ON public.base_tracker_exports;
CREATE POLICY "Users can create base trackers for their organisation's project"
  ON public.base_tracker_exports FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = base_tracker_exports.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can view base trackers for their organisation's projects" ON public.base_tracker_exports;
CREATE POLICY "Users can view base trackers for their organisation's projects"
  ON public.base_tracker_exports FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = base_tracker_exports.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- variation_register
DROP POLICY IF EXISTS "Users can create variations for their organisation's projects" ON public.variation_register;
CREATE POLICY "Users can create variations for their organisation's projects"
  ON public.variation_register FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = variation_register.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can update variations for their organisation's projects" ON public.variation_register;
CREATE POLICY "Users can update variations for their organisation's projects"
  ON public.variation_register FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = variation_register.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = variation_register.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can view variations for their organisation's projects" ON public.variation_register;
CREATE POLICY "Users can view variations for their organisation's projects"
  ON public.variation_register FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = variation_register.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- base_tracker_claims
DROP POLICY IF EXISTS "Users can create claims for their organisation's projects" ON public.base_tracker_claims;
CREATE POLICY "Users can create claims for their organisation's projects"
  ON public.base_tracker_claims FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = base_tracker_claims.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can update claims for their organisation's projects" ON public.base_tracker_claims;
CREATE POLICY "Users can update claims for their organisation's projects"
  ON public.base_tracker_claims FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = base_tracker_claims.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = base_tracker_claims.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can view claims for their organisation's projects" ON public.base_tracker_claims;
CREATE POLICY "Users can view claims for their organisation's projects"
  ON public.base_tracker_claims FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = base_tracker_claims.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- commercial_audit_log
DROP POLICY IF EXISTS "Users can view audit logs for their organisation's projects" ON public.commercial_audit_log;
CREATE POLICY "Users can view audit logs for their organisation's projects"
  ON public.commercial_audit_log FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = commercial_audit_log.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- prelet_appendix
DROP POLICY IF EXISTS "Users can delete prelet appendix in their org projects" ON public.prelet_appendix;
CREATE POLICY "Users can delete prelet appendix in their org projects"
  ON public.prelet_appendix FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = prelet_appendix.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can insert prelet appendix in their org projects" ON public.prelet_appendix;
CREATE POLICY "Users can insert prelet appendix in their org projects"
  ON public.prelet_appendix FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = prelet_appendix.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can update prelet appendix in their org projects" ON public.prelet_appendix;
CREATE POLICY "Users can update prelet appendix in their org projects"
  ON public.prelet_appendix FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = prelet_appendix.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = prelet_appendix.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can view prelet appendix in their org projects" ON public.prelet_appendix;
CREATE POLICY "Users can view prelet appendix in their org projects"
  ON public.prelet_appendix FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = prelet_appendix.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- contract_tags_clarifications
DROP POLICY IF EXISTS "Users can delete tags in their org projects" ON public.contract_tags_clarifications;
CREATE POLICY "Users can delete tags in their org projects"
  ON public.contract_tags_clarifications FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = contract_tags_clarifications.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can insert tags in their org projects" ON public.contract_tags_clarifications;
CREATE POLICY "Users can insert tags in their org projects"
  ON public.contract_tags_clarifications FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = contract_tags_clarifications.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can update tags in their org projects" ON public.contract_tags_clarifications;
CREATE POLICY "Users can update tags in their org projects"
  ON public.contract_tags_clarifications FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = contract_tags_clarifications.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = contract_tags_clarifications.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can view tags in their org projects" ON public.contract_tags_clarifications;
CREATE POLICY "Users can view tags in their org projects"
  ON public.contract_tags_clarifications FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = contract_tags_clarifications.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- commercial_baseline_items
DROP POLICY IF EXISTS "Users can create baseline for their organisation's projects" ON public.commercial_baseline_items;
CREATE POLICY "Users can create baseline for their organisation's projects"
  ON public.commercial_baseline_items FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = commercial_baseline_items.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can delete baseline for their organisation's projects" ON public.commercial_baseline_items;
CREATE POLICY "Users can delete baseline for their organisation's projects"
  ON public.commercial_baseline_items FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = commercial_baseline_items.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can update baseline for their organisation's projects" ON public.commercial_baseline_items;
CREATE POLICY "Users can update baseline for their organisation's projects"
  ON public.commercial_baseline_items FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = commercial_baseline_items.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = commercial_baseline_items.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can view baseline for their organisation's projects" ON public.commercial_baseline_items;
CREATE POLICY "Users can view baseline for their organisation's projects"
  ON public.commercial_baseline_items FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = commercial_baseline_items.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- subcontract_agreements
DROP POLICY IF EXISTS "Platform admins can delete agreements" ON public.subcontract_agreements;
CREATE POLICY "Platform admins can delete agreements"
  ON public.subcontract_agreements FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.platform_admins pa
    WHERE pa.user_id = (SELECT auth.uid()) AND pa.is_active = true
  ));

DROP POLICY IF EXISTS "Users can create agreements in their organisation" ON public.subcontract_agreements;
CREATE POLICY "Users can create agreements in their organisation"
  ON public.subcontract_agreements FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = subcontract_agreements.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can update unlocked agreements in their organisation" ON public.subcontract_agreements;
CREATE POLICY "Users can update unlocked agreements in their organisation"
  ON public.subcontract_agreements FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = subcontract_agreements.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = subcontract_agreements.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can view agreements in their organisation" ON public.subcontract_agreements;
CREATE POLICY "Users can view agreements in their organisation"
  ON public.subcontract_agreements FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.organisation_id = subcontract_agreements.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- contract_workflow_progress
DROP POLICY IF EXISTS "Users can insert workflow progress for their organization's pro" ON public.contract_workflow_progress;
CREATE POLICY "Users can insert workflow progress for their organization's pro"
  ON public.contract_workflow_progress FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = contract_workflow_progress.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can update workflow progress for their organization's pro" ON public.contract_workflow_progress;
CREATE POLICY "Users can update workflow progress for their organization's pro"
  ON public.contract_workflow_progress FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = contract_workflow_progress.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = contract_workflow_progress.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can view workflow progress for their organization's proje" ON public.contract_workflow_progress;
CREATE POLICY "Users can view workflow progress for their organization's proje"
  ON public.contract_workflow_progress FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = contract_workflow_progress.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- contract_templates
DROP POLICY IF EXISTS "Platform admins can manage templates" ON public.contract_templates;
CREATE POLICY "Platform admins can manage templates"
  ON public.contract_templates FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.platform_admins pa
    WHERE pa.user_id = (SELECT auth.uid()) AND pa.is_active = true
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.platform_admins pa
    WHERE pa.user_id = (SELECT auth.uid()) AND pa.is_active = true
  ));

-- subcontract_field_definitions
DROP POLICY IF EXISTS "Platform admins can manage field definitions" ON public.subcontract_field_definitions;
CREATE POLICY "Platform admins can manage field definitions"
  ON public.subcontract_field_definitions FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.platform_admins pa
    WHERE pa.user_id = (SELECT auth.uid()) AND pa.is_active = true
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.platform_admins pa
    WHERE pa.user_id = (SELECT auth.uid()) AND pa.is_active = true
  ));

-- subcontract_field_values
DROP POLICY IF EXISTS "Users can manage field values for unlocked agreements" ON public.subcontract_field_values;
CREATE POLICY "Users can manage field values for unlocked agreements"
  ON public.subcontract_field_values FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.subcontract_agreements sa
    JOIN public.organisation_members om ON om.organisation_id = sa.organisation_id
    WHERE sa.id = subcontract_field_values.agreement_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.subcontract_agreements sa
    JOIN public.organisation_members om ON om.organisation_id = sa.organisation_id
    WHERE sa.id = subcontract_field_values.agreement_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can view field values for agreements in their organisatio" ON public.subcontract_field_values;
CREATE POLICY "Users can view field values for agreements in their organisatio"
  ON public.subcontract_field_values FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.subcontract_agreements sa
    JOIN public.organisation_members om ON om.organisation_id = sa.organisation_id
    WHERE sa.id = subcontract_field_values.agreement_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- boq_lines
DROP POLICY IF EXISTS "Users can delete BOQ lines for their organisation's projects" ON public.boq_lines;
CREATE POLICY "Users can delete BOQ lines for their organisation's projects"
  ON public.boq_lines FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = boq_lines.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can insert BOQ lines for their organisation's projects" ON public.boq_lines;
CREATE POLICY "Users can insert BOQ lines for their organisation's projects"
  ON public.boq_lines FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = boq_lines.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can update BOQ lines for their organisation's projects" ON public.boq_lines;
CREATE POLICY "Users can update BOQ lines for their organisation's projects"
  ON public.boq_lines FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = boq_lines.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = boq_lines.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can view BOQ lines for their organisation's projects" ON public.boq_lines;
CREATE POLICY "Users can view BOQ lines for their organisation's projects"
  ON public.boq_lines FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = boq_lines.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- import_audit_logs
DROP POLICY IF EXISTS "Platform admins can view all import logs" ON public.import_audit_logs;
CREATE POLICY "Platform admins can view all import logs"
  ON public.import_audit_logs FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.platform_admins pa
    WHERE pa.user_id = (SELECT auth.uid()) AND pa.is_active = true
  ));

DROP POLICY IF EXISTS "Users can create import logs for their organisation projects" ON public.import_audit_logs;
CREATE POLICY "Users can create import logs for their organisation projects"
  ON public.import_audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = import_audit_logs.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can view import logs for their organisation projects" ON public.import_audit_logs;
CREATE POLICY "Users can view import logs for their organisation projects"
  ON public.import_audit_logs FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = import_audit_logs.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- subcontract_agreement_versions
DROP POLICY IF EXISTS "Users can insert versions for their agreements" ON public.subcontract_agreement_versions;
CREATE POLICY "Users can insert versions for their agreements"
  ON public.subcontract_agreement_versions FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.subcontract_agreements sa
    JOIN public.organisation_members om ON om.organisation_id = sa.organisation_id
    WHERE sa.id = subcontract_agreement_versions.agreement_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can view versions of their agreements" ON public.subcontract_agreement_versions;
CREATE POLICY "Users can view versions of their agreements"
  ON public.subcontract_agreement_versions FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.subcontract_agreements sa
    JOIN public.organisation_members om ON om.organisation_id = sa.organisation_id
    WHERE sa.id = subcontract_agreement_versions.agreement_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));
