/*
  # Consolidate Multiple Permissive Policies

  ## Summary
  Consolidates multiple permissive SELECT policies into single policies for better performance.

  1. Changes
    - Combine multiple SELECT policies for revision_requests, revision_request_suppliers, and suppliers
    - Use OR conditions instead of multiple policies
    
  2. Performance
    - Reduces policy evaluation overhead
    - Simplifies query planning
*/

-- Revision Requests: Consolidate SELECT policies
DROP POLICY IF EXISTS "Platform admins can view all revision requests" ON public.revision_requests;
DROP POLICY IF EXISTS "Users can view revision requests for their organisation project" ON public.revision_requests;

CREATE POLICY "Users and admins can view revision requests"
  ON public.revision_requests FOR SELECT
  TO authenticated
  USING (
    -- Platform admins can view all
    EXISTS (
      SELECT 1 FROM public.platform_admins
      WHERE user_id = (SELECT auth.uid())
      AND is_active = true
    )
    OR
    -- Org members can view their organisation's requests
    EXISTS (
      SELECT 1 FROM public.projects p
      INNER JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = revision_requests.project_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
    )
  );

-- Revision Request Suppliers: Consolidate SELECT policies
DROP POLICY IF EXISTS "Platform admins can view all revision request suppliers" ON public.revision_request_suppliers;
DROP POLICY IF EXISTS "Users can view revision request suppliers for their organisatio" ON public.revision_request_suppliers;

CREATE POLICY "Users and admins can view revision request suppliers"
  ON public.revision_request_suppliers FOR SELECT
  TO authenticated
  USING (
    -- Platform admins can view all
    EXISTS (
      SELECT 1 FROM public.platform_admins
      WHERE user_id = (SELECT auth.uid())
      AND is_active = true
    )
    OR
    -- Org members can view their organisation's supplier requests
    EXISTS (
      SELECT 1 FROM public.revision_requests rr
      INNER JOIN public.projects p ON p.id = rr.project_id
      INNER JOIN public.organisation_members om ON om.organisation_id = p.organisation_id
      WHERE rr.id = revision_request_suppliers.revision_request_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
    )
  );

-- Suppliers: Consolidate SELECT policies
DROP POLICY IF EXISTS "Org admins can manage suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Users and admins can view suppliers" ON public.suppliers;

CREATE POLICY "Users can view and manage suppliers"
  ON public.suppliers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organisation_members om
      WHERE om.organisation_id = suppliers.organisation_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
    )
  );
