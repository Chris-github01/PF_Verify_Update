/*
  # Optimize Contract and Onboarding RLS Policies

  ## Summary
  Wraps auth.uid() calls with SELECT for contract and onboarding tables to prevent re-evaluation.

  1. Changes
    - Update contract_allowances, letters_of_intent, contract_inclusions, contract_exclusions policies
    - Update onboarding_compliance_documents and onboarding_audit_log policies
    
  2. Performance
    - Prevents auth function re-evaluation for each row
    - Improves query performance at scale
*/

-- Contract Allowances policies
DROP POLICY IF EXISTS "Users can view allowances in their organisation's projects" ON public.contract_allowances;
CREATE POLICY "Users can view allowances in their organisation's projects"
  ON public.contract_allowances FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      INNER JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = contract_allowances.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can insert allowances in their organisation's projects" ON public.contract_allowances;
CREATE POLICY "Users can insert allowances in their organisation's projects"
  ON public.contract_allowances FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      INNER JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = contract_allowances.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin', 'member')
    )
  );

DROP POLICY IF EXISTS "Users can update allowances in their organisation's projects" ON public.contract_allowances;
CREATE POLICY "Users can update allowances in their organisation's projects"
  ON public.contract_allowances FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      INNER JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = contract_allowances.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin', 'member')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      INNER JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = contract_allowances.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin', 'member')
    )
  );

DROP POLICY IF EXISTS "Users can delete allowances in their organisation's projects" ON public.contract_allowances;
CREATE POLICY "Users can delete allowances in their organisation's projects"
  ON public.contract_allowances FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      INNER JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = contract_allowances.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin')
    )
  );

-- Letters of Intent policies
DROP POLICY IF EXISTS "Users can view LOIs in their organisation's projects" ON public.letters_of_intent;
CREATE POLICY "Users can view LOIs in their organisation's projects"
  ON public.letters_of_intent FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      INNER JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = letters_of_intent.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can insert LOIs in their organisation's projects" ON public.letters_of_intent;
CREATE POLICY "Users can insert LOIs in their organisation's projects"
  ON public.letters_of_intent FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      INNER JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = letters_of_intent.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin', 'member')
    )
  );

DROP POLICY IF EXISTS "Users can update LOIs in their organisation's projects" ON public.letters_of_intent;
CREATE POLICY "Users can update LOIs in their organisation's projects"
  ON public.letters_of_intent FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      INNER JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = letters_of_intent.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin', 'member')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      INNER JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = letters_of_intent.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin', 'member')
    )
  );

DROP POLICY IF EXISTS "Users can delete LOIs in their organisation's projects" ON public.letters_of_intent;
CREATE POLICY "Users can delete LOIs in their organisation's projects"
  ON public.letters_of_intent FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      INNER JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = letters_of_intent.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin')
    )
  );

-- Contract Inclusions policies
DROP POLICY IF EXISTS "Users can view inclusions in their organisation's projects" ON public.contract_inclusions;
CREATE POLICY "Users can view inclusions in their organisation's projects"
  ON public.contract_inclusions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      INNER JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = contract_inclusions.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can insert inclusions in their organisation's projects" ON public.contract_inclusions;
CREATE POLICY "Users can insert inclusions in their organisation's projects"
  ON public.contract_inclusions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      INNER JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = contract_inclusions.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin', 'member')
    )
  );

DROP POLICY IF EXISTS "Users can update inclusions in their organisation's projects" ON public.contract_inclusions;
CREATE POLICY "Users can update inclusions in their organisation's projects"
  ON public.contract_inclusions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      INNER JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = contract_inclusions.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin', 'member')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      INNER JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = contract_inclusions.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin', 'member')
    )
  );

DROP POLICY IF EXISTS "Users can delete inclusions in their organisation's projects" ON public.contract_inclusions;
CREATE POLICY "Users can delete inclusions in their organisation's projects"
  ON public.contract_inclusions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      INNER JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = contract_inclusions.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin')
    )
  );

-- Contract Exclusions policies
DROP POLICY IF EXISTS "Users can view exclusions in their organisation's projects" ON public.contract_exclusions;
CREATE POLICY "Users can view exclusions in their organisation's projects"
  ON public.contract_exclusions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      INNER JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = contract_exclusions.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can insert exclusions in their organisation's projects" ON public.contract_exclusions;
CREATE POLICY "Users can insert exclusions in their organisation's projects"
  ON public.contract_exclusions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      INNER JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = contract_exclusions.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin', 'member')
    )
  );

DROP POLICY IF EXISTS "Users can update exclusions in their organisation's projects" ON public.contract_exclusions;
CREATE POLICY "Users can update exclusions in their organisation's projects"
  ON public.contract_exclusions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      INNER JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = contract_exclusions.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin', 'member')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      INNER JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = contract_exclusions.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin', 'member')
    )
  );

DROP POLICY IF EXISTS "Users can delete exclusions in their organisation's projects" ON public.contract_exclusions;
CREATE POLICY "Users can delete exclusions in their organisation's projects"
  ON public.contract_exclusions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      INNER JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = contract_exclusions.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin')
    )
  );

-- Onboarding Compliance Documents policies
DROP POLICY IF EXISTS "Users can view compliance docs in their organisation's projects" ON public.onboarding_compliance_documents;
CREATE POLICY "Users can view compliance docs in their organisation's projects"
  ON public.onboarding_compliance_documents FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      INNER JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = onboarding_compliance_documents.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can insert compliance docs in their organisation's projec" ON public.onboarding_compliance_documents;
CREATE POLICY "Users can insert compliance docs in their organisation's projec"
  ON public.onboarding_compliance_documents FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      INNER JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = onboarding_compliance_documents.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin', 'member')
    )
  );

DROP POLICY IF EXISTS "Users can update compliance docs in their organisation's projec" ON public.onboarding_compliance_documents;
CREATE POLICY "Users can update compliance docs in their organisation's projec"
  ON public.onboarding_compliance_documents FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      INNER JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = onboarding_compliance_documents.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin', 'member')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      INNER JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = onboarding_compliance_documents.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin', 'member')
    )
  );

-- Onboarding Audit Log policies
DROP POLICY IF EXISTS "Users can view audit logs in their organisation's projects" ON public.onboarding_audit_log;
CREATE POLICY "Users can view audit logs in their organisation's projects"
  ON public.onboarding_audit_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      INNER JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = onboarding_audit_log.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can insert audit logs in their organisation's projects" ON public.onboarding_audit_log;
CREATE POLICY "Users can insert audit logs in their organisation's projects"
  ON public.onboarding_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      INNER JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = onboarding_audit_log.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
    )
  );
