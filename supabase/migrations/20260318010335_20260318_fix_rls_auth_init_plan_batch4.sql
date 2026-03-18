/*
  # Fix Auth RLS Initialization Plan - Batch 4
  
  Covers: fire_engineer_schedules, schedule_boq_links, fire_engineer_schedule_rows,
  subcontract_attachments, revision_requests, revision_request_suppliers
*/

-- fire_engineer_schedules
DROP POLICY IF EXISTS "Users can delete fire schedules for their organisation's projec" ON public.fire_engineer_schedules;
CREATE POLICY "Users can delete fire schedules for their organisation's projec"
  ON public.fire_engineer_schedules FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = fire_engineer_schedules.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can insert fire schedules for their organisation's projec" ON public.fire_engineer_schedules;
CREATE POLICY "Users can insert fire schedules for their organisation's projec"
  ON public.fire_engineer_schedules FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = fire_engineer_schedules.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can update fire schedules for their organisation's projec" ON public.fire_engineer_schedules;
CREATE POLICY "Users can update fire schedules for their organisation's projec"
  ON public.fire_engineer_schedules FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = fire_engineer_schedules.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = fire_engineer_schedules.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can view fire schedules for their organisation's projects" ON public.fire_engineer_schedules;
CREATE POLICY "Users can view fire schedules for their organisation's projects"
  ON public.fire_engineer_schedules FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = fire_engineer_schedules.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- schedule_boq_links (uses project_id directly)
DROP POLICY IF EXISTS "Users can delete schedule links for their organisation's projec" ON public.schedule_boq_links;
CREATE POLICY "Users can delete schedule links for their organisation's projec"
  ON public.schedule_boq_links FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = schedule_boq_links.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can insert schedule links for their organisation's projec" ON public.schedule_boq_links;
CREATE POLICY "Users can insert schedule links for their organisation's projec"
  ON public.schedule_boq_links FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = schedule_boq_links.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can update schedule links for their organisation's projec" ON public.schedule_boq_links;
CREATE POLICY "Users can update schedule links for their organisation's projec"
  ON public.schedule_boq_links FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = schedule_boq_links.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = schedule_boq_links.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can view schedule links for their organisation's projects" ON public.schedule_boq_links;
CREATE POLICY "Users can view schedule links for their organisation's projects"
  ON public.schedule_boq_links FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = schedule_boq_links.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- fire_engineer_schedule_rows (uses schedule_id -> fire_engineer_schedules)
DROP POLICY IF EXISTS "Users can delete schedule rows for their organisation's project" ON public.fire_engineer_schedule_rows;
CREATE POLICY "Users can delete schedule rows for their organisation's project"
  ON public.fire_engineer_schedule_rows FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.fire_engineer_schedules fes
    JOIN public.projects p ON p.id = fes.project_id
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE fes.id = fire_engineer_schedule_rows.schedule_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can insert schedule rows for their organisation's project" ON public.fire_engineer_schedule_rows;
CREATE POLICY "Users can insert schedule rows for their organisation's project"
  ON public.fire_engineer_schedule_rows FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.fire_engineer_schedules fes
    JOIN public.projects p ON p.id = fes.project_id
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE fes.id = fire_engineer_schedule_rows.schedule_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can update schedule rows for their organisation's project" ON public.fire_engineer_schedule_rows;
CREATE POLICY "Users can update schedule rows for their organisation's project"
  ON public.fire_engineer_schedule_rows FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.fire_engineer_schedules fes
    JOIN public.projects p ON p.id = fes.project_id
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE fes.id = fire_engineer_schedule_rows.schedule_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.fire_engineer_schedules fes
    JOIN public.projects p ON p.id = fes.project_id
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE fes.id = fire_engineer_schedule_rows.schedule_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can view schedule rows for their organisation's projects" ON public.fire_engineer_schedule_rows;
CREATE POLICY "Users can view schedule rows for their organisation's projects"
  ON public.fire_engineer_schedule_rows FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.fire_engineer_schedules fes
    JOIN public.projects p ON p.id = fes.project_id
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE fes.id = fire_engineer_schedule_rows.schedule_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- subcontract_attachments
DROP POLICY IF EXISTS "Users can delete their own attachments from unlocked agreements" ON public.subcontract_attachments;
CREATE POLICY "Users can delete their own attachments from unlocked agreements"
  ON public.subcontract_attachments FOR DELETE
  TO authenticated
  USING (uploaded_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can upload attachments to unlocked agreements" ON public.subcontract_attachments;
CREATE POLICY "Users can upload attachments to unlocked agreements"
  ON public.subcontract_attachments FOR INSERT
  TO authenticated
  WITH CHECK (uploaded_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can view attachments for agreements in their organisation" ON public.subcontract_attachments;
CREATE POLICY "Users can view attachments for agreements in their organisation"
  ON public.subcontract_attachments FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.subcontract_agreements sa
    JOIN public.organisation_members om ON om.organisation_id = sa.organisation_id
    WHERE sa.id = subcontract_attachments.agreement_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- revision_requests
DROP POLICY IF EXISTS "Users can delete revision requests in their org projects" ON public.revision_requests;
CREATE POLICY "Users can delete revision requests in their org projects"
  ON public.revision_requests FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = revision_requests.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can insert revision requests in their org projects" ON public.revision_requests;
CREATE POLICY "Users can insert revision requests in their org projects"
  ON public.revision_requests FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = revision_requests.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can update revision requests in their org projects" ON public.revision_requests;
CREATE POLICY "Users can update revision requests in their org projects"
  ON public.revision_requests FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = revision_requests.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = revision_requests.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can view revision requests in their org projects" ON public.revision_requests;
CREATE POLICY "Users can view revision requests in their org projects"
  ON public.revision_requests FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = revision_requests.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

-- revision_request_suppliers
DROP POLICY IF EXISTS "Users can delete revision request suppliers in their org" ON public.revision_request_suppliers;
CREATE POLICY "Users can delete revision request suppliers in their org"
  ON public.revision_request_suppliers FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.revision_requests rr
    JOIN public.projects p ON p.id = rr.project_id
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE rr.id = revision_request_suppliers.revision_request_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can insert revision request suppliers in their org" ON public.revision_request_suppliers;
CREATE POLICY "Users can insert revision request suppliers in their org"
  ON public.revision_request_suppliers FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.revision_requests rr
    JOIN public.projects p ON p.id = rr.project_id
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE rr.id = revision_request_suppliers.revision_request_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can update revision request suppliers in their org" ON public.revision_request_suppliers;
CREATE POLICY "Users can update revision request suppliers in their org"
  ON public.revision_request_suppliers FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.revision_requests rr
    JOIN public.projects p ON p.id = rr.project_id
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE rr.id = revision_request_suppliers.revision_request_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.revision_requests rr
    JOIN public.projects p ON p.id = rr.project_id
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE rr.id = revision_request_suppliers.revision_request_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));

DROP POLICY IF EXISTS "Users can view revision request suppliers in their org" ON public.revision_request_suppliers;
CREATE POLICY "Users can view revision request suppliers in their org"
  ON public.revision_request_suppliers FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.revision_requests rr
    JOIN public.projects p ON p.id = rr.project_id
    JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
    WHERE rr.id = revision_request_suppliers.revision_request_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ));
