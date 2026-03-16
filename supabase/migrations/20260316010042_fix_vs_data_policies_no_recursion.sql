/*
  # Fix infinite recursion in vs_projects/suppliers/materials write policies

  ## Problem
  The previous migration checked vs_user_profiles inside the policy USING clause,
  but vs_user_profiles itself has RLS, causing infinite recursion.

  ## Fix
  Create a SECURITY DEFINER helper function that bypasses RLS to look up
  the org membership, then use that in all write policies.
*/

-- Helper: get the organisation_id for the current user, bypassing RLS
CREATE OR REPLACE FUNCTION get_vs_user_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- ============================================================
-- vs_projects
-- ============================================================
DROP POLICY IF EXISTS "Org members can insert projects" ON vs_projects;
DROP POLICY IF EXISTS "Org members can update projects" ON vs_projects;
DROP POLICY IF EXISTS "Org members can delete projects" ON vs_projects;

CREATE POLICY "Org members can insert projects"
  ON vs_projects FOR INSERT TO authenticated
  WITH CHECK (organisation_id = get_vs_user_org_id());

CREATE POLICY "Org members can update projects"
  ON vs_projects FOR UPDATE TO authenticated
  USING (organisation_id = get_vs_user_org_id())
  WITH CHECK (organisation_id = get_vs_user_org_id());

CREATE POLICY "Org members can delete projects"
  ON vs_projects FOR DELETE TO authenticated
  USING (organisation_id = get_vs_user_org_id());

-- ============================================================
-- vs_suppliers
-- ============================================================
DROP POLICY IF EXISTS "Org members can insert suppliers" ON vs_suppliers;
DROP POLICY IF EXISTS "Org members can update suppliers" ON vs_suppliers;
DROP POLICY IF EXISTS "Org members can delete suppliers" ON vs_suppliers;

CREATE POLICY "Org members can insert suppliers"
  ON vs_suppliers FOR INSERT TO authenticated
  WITH CHECK (organisation_id = get_vs_user_org_id());

CREATE POLICY "Org members can update suppliers"
  ON vs_suppliers FOR UPDATE TO authenticated
  USING (organisation_id = get_vs_user_org_id())
  WITH CHECK (organisation_id = get_vs_user_org_id());

CREATE POLICY "Org members can delete suppliers"
  ON vs_suppliers FOR DELETE TO authenticated
  USING (organisation_id = get_vs_user_org_id());

-- ============================================================
-- vs_materials
-- ============================================================
DROP POLICY IF EXISTS "Org members can insert materials" ON vs_materials;
DROP POLICY IF EXISTS "Org members can update materials" ON vs_materials;
DROP POLICY IF EXISTS "Org members can delete materials" ON vs_materials;

CREATE POLICY "Org members can insert materials"
  ON vs_materials FOR INSERT TO authenticated
  WITH CHECK (organisation_id = get_vs_user_org_id());

CREATE POLICY "Org members can update materials"
  ON vs_materials FOR UPDATE TO authenticated
  USING (organisation_id = get_vs_user_org_id())
  WITH CHECK (organisation_id = get_vs_user_org_id());

CREATE POLICY "Org members can delete materials"
  ON vs_materials FOR DELETE TO authenticated
  USING (organisation_id = get_vs_user_org_id());
