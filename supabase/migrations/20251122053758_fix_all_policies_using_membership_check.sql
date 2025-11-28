/*
  # Fix All Policies Using Membership Check

  1. Problem
    - Multiple policies query organisation_members in their USING/WITH CHECK
    - This can cause recursion or performance issues
  
  2. Solution
    - Use the user_is_org_member() security definer function
    - More efficient and avoids recursion
*/

-- Update organisations policies to use the function
DROP POLICY IF EXISTS "Users can view their organisations" ON public.organisations;
CREATE POLICY "Users can view their organisations"
  ON public.organisations FOR SELECT
  TO authenticated
  USING (
    public.user_is_org_member(id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Org owners and admins can update organisation" ON public.organisations;
CREATE POLICY "Org owners and admins can update organisation"
  ON public.organisations FOR UPDATE
  TO authenticated
  USING (
    public.user_is_org_member(id, (SELECT auth.uid()))
    AND EXISTS (
      SELECT 1
      FROM public.organisation_members om
      WHERE om.organisation_id = organisations.id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('owner', 'admin')
    )
  );

-- Update projects policies
DROP POLICY IF EXISTS "Users can view projects in their organisation" ON public.projects;
CREATE POLICY "Users can view projects in their organisation"
  ON public.projects FOR SELECT
  TO authenticated
  USING (
    public.user_is_org_member(organisation_id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Users can create projects in their organisation" ON public.projects;
CREATE POLICY "Users can create projects in their organisation"
  ON public.projects FOR INSERT
  TO authenticated
  WITH CHECK (
    public.user_is_org_member(organisation_id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Users can update projects in their organisation" ON public.projects;
CREATE POLICY "Users can update projects in their organisation"
  ON public.projects FOR UPDATE
  TO authenticated
  USING (
    public.user_is_org_member(organisation_id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Users can delete projects in their organisation" ON public.projects;
CREATE POLICY "Users can delete projects in their organisation"
  ON public.projects FOR DELETE
  TO authenticated
  USING (
    public.user_is_org_member(organisation_id, (SELECT auth.uid()))
  );

-- Update scope_categories policies
DROP POLICY IF EXISTS "Users can view scope_categories in their organisation" ON public.scope_categories;
CREATE POLICY "Users can view scope_categories in their organisation"
  ON public.scope_categories FOR SELECT
  TO authenticated
  USING (
    project_id IN (
      SELECT p.id
      FROM public.projects p
      WHERE public.user_is_org_member(p.organisation_id, (SELECT auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Users can create scope_categories in their organisation" ON public.scope_categories;
CREATE POLICY "Users can create scope_categories in their organisation"
  ON public.scope_categories FOR INSERT
  TO authenticated
  WITH CHECK (
    project_id IN (
      SELECT p.id
      FROM public.projects p
      WHERE public.user_is_org_member(p.organisation_id, (SELECT auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Users can update scope_categories in their organisation" ON public.scope_categories;
CREATE POLICY "Users can update scope_categories in their organisation"
  ON public.scope_categories FOR UPDATE
  TO authenticated
  USING (
    project_id IN (
      SELECT p.id
      FROM public.projects p
      WHERE public.user_is_org_member(p.organisation_id, (SELECT auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Users can delete scope_categories in their organisation" ON public.scope_categories;
CREATE POLICY "Users can delete scope_categories in their organisation"
  ON public.scope_categories FOR DELETE
  TO authenticated
  USING (
    project_id IN (
      SELECT p.id
      FROM public.projects p
      WHERE public.user_is_org_member(p.organisation_id, (SELECT auth.uid()))
    )
  );

-- Update parsing_jobs policies
DROP POLICY IF EXISTS "Users can view their own parsing jobs" ON public.parsing_jobs;
CREATE POLICY "Users can view their own parsing jobs"
  ON public.parsing_jobs FOR SELECT
  TO authenticated
  USING (
    public.user_is_org_member(organisation_id, (SELECT auth.uid()))
  );

-- Update library_items policies
DROP POLICY IF EXISTS "Users can view library items in their organisation" ON public.library_items;
CREATE POLICY "Users can view library items in their organisation"
  ON public.library_items FOR SELECT
  TO authenticated
  USING (
    public.user_is_org_member(organisation_id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Admins can insert library items" ON public.library_items;
CREATE POLICY "Admins can insert library items"
  ON public.library_items FOR INSERT
  TO authenticated
  WITH CHECK (
    public.user_is_org_member(organisation_id, (SELECT auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.organisation_members om
      WHERE om.organisation_id = library_items.organisation_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Admins can update library items" ON public.library_items;
CREATE POLICY "Admins can update library items"
  ON public.library_items FOR UPDATE
  TO authenticated
  USING (
    public.user_is_org_member(organisation_id, (SELECT auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.organisation_members om
      WHERE om.organisation_id = library_items.organisation_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Admins can delete library items" ON public.library_items;
CREATE POLICY "Admins can delete library items"
  ON public.library_items FOR DELETE
  TO authenticated
  USING (
    public.user_is_org_member(organisation_id, (SELECT auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.organisation_members om
      WHERE om.organisation_id = library_items.organisation_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('owner', 'admin')
    )
  );

-- Update supplier_template_fingerprints policies
DROP POLICY IF EXISTS "Users can read templates from their org" ON public.supplier_template_fingerprints;
CREATE POLICY "Users can read templates from their org"
  ON public.supplier_template_fingerprints FOR SELECT
  TO authenticated
  USING (
    public.user_is_org_member(organisation_id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Users can insert templates for their org" ON public.supplier_template_fingerprints;
CREATE POLICY "Users can insert templates for their org"
  ON public.supplier_template_fingerprints FOR INSERT
  TO authenticated
  WITH CHECK (
    public.user_is_org_member(organisation_id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Users can update templates from their org" ON public.supplier_template_fingerprints;
CREATE POLICY "Users can update templates from their org"
  ON public.supplier_template_fingerprints FOR UPDATE
  TO authenticated
  USING (
    public.user_is_org_member(organisation_id, (SELECT auth.uid()))
  );