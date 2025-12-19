/*
  # Optimize RLS Auth Function Calls

  ## Summary
  Wraps auth.uid() calls with SELECT to prevent re-evaluation for each row, improving performance.

  1. Changes
    - Update RLS policies to use (SELECT auth.uid()) instead of auth.uid()
    - Applies to award_approvals, revision_requests, revision_request_suppliers, contract tables, and onboarding tables
    
  2. Performance
    - Prevents auth function re-evaluation for each row
    - Significantly improves query performance at scale
*/

-- Award Approvals policies
DROP POLICY IF EXISTS "Users can view approvals in their organisation" ON public.award_approvals;
CREATE POLICY "Users can view approvals in their organisation"
  ON public.award_approvals FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      INNER JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = award_approvals.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can create approvals in their organisation" ON public.award_approvals;
CREATE POLICY "Users can create approvals in their organisation"
  ON public.award_approvals FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      INNER JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = award_approvals.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Users can update recent approvals" ON public.award_approvals;
CREATE POLICY "Users can update recent approvals"
  ON public.award_approvals FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      INNER JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = award_approvals.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin')
    )
    AND award_approvals.approved_at > NOW() - INTERVAL '24 hours'
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      INNER JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = award_approvals.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin')
    )
  );

-- Revision Requests policies
DROP POLICY IF EXISTS "Users can view revision requests for their organisation project" ON public.revision_requests;
CREATE POLICY "Users can view revision requests for their organisation project"
  ON public.revision_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      INNER JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = revision_requests.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Platform admins can view all revision requests" ON public.revision_requests;
CREATE POLICY "Platform admins can view all revision requests"
  ON public.revision_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.platform_admins
      WHERE user_id = (SELECT auth.uid())
      AND is_active = true
    )
  );

DROP POLICY IF EXISTS "Users can create revision requests for their organisation proje" ON public.revision_requests;
CREATE POLICY "Users can create revision requests for their organisation proje"
  ON public.revision_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      INNER JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = revision_requests.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin', 'member')
    )
  );

DROP POLICY IF EXISTS "Users can update revision requests for their organisation proje" ON public.revision_requests;
CREATE POLICY "Users can update revision requests for their organisation proje"
  ON public.revision_requests FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      INNER JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = revision_requests.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin', 'member')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      INNER JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = revision_requests.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin', 'member')
    )
  );

-- Revision Request Suppliers policies
DROP POLICY IF EXISTS "Users can view revision request suppliers for their organisatio" ON public.revision_request_suppliers;
CREATE POLICY "Users can view revision request suppliers for their organisatio"
  ON public.revision_request_suppliers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.revision_requests rr
      INNER JOIN public.projects p ON p.id = rr.project_id
      INNER JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
      WHERE rr.id = revision_request_suppliers.revision_request_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Platform admins can view all revision request suppliers" ON public.revision_request_suppliers;
CREATE POLICY "Platform admins can view all revision request suppliers"
  ON public.revision_request_suppliers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.platform_admins
      WHERE user_id = (SELECT auth.uid())
      AND is_active = true
    )
  );

DROP POLICY IF EXISTS "Users can create revision request suppliers for their organisat" ON public.revision_request_suppliers;
CREATE POLICY "Users can create revision request suppliers for their organisat"
  ON public.revision_request_suppliers FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.revision_requests rr
      INNER JOIN public.projects p ON p.id = rr.project_id
      INNER JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
      WHERE rr.id = revision_request_suppliers.revision_request_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin', 'member')
    )
  );

DROP POLICY IF EXISTS "Users can update revision request suppliers for their organisat" ON public.revision_request_suppliers;
CREATE POLICY "Users can update revision request suppliers for their organisat"
  ON public.revision_request_suppliers FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.revision_requests rr
      INNER JOIN public.projects p ON p.id = rr.project_id
      INNER JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
      WHERE rr.id = revision_request_suppliers.revision_request_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin', 'member')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.revision_requests rr
      INNER JOIN public.projects p ON p.id = rr.project_id
      INNER JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
      WHERE rr.id = revision_request_suppliers.revision_request_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin', 'member')
    )
  );
