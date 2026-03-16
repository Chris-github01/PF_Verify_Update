/*
  # Fix vs write policies to use organisation_members (v2 — drop cascade)

  ## Problem
  vs_user_profiles is empty. The correct membership table is organisation_members.
  Must drop old function with CASCADE to remove dependent policies first.
*/

-- Drop old function and all dependent policies in one shot
DROP FUNCTION IF EXISTS get_vs_user_org_id() CASCADE;

-- New helper: checks if the current user is a member of a given org
CREATE OR REPLACE FUNCTION is_vs_org_member(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organisation_members
    WHERE user_id = auth.uid()
      AND organisation_id = p_org_id
  );
$$;

-- ============================================================
-- vs_projects
-- ============================================================
CREATE POLICY "Org members can insert projects"
  ON vs_projects FOR INSERT TO authenticated
  WITH CHECK (is_vs_org_member(organisation_id));

CREATE POLICY "Org members can update projects"
  ON vs_projects FOR UPDATE TO authenticated
  USING (is_vs_org_member(organisation_id))
  WITH CHECK (is_vs_org_member(organisation_id));

CREATE POLICY "Org members can delete projects"
  ON vs_projects FOR DELETE TO authenticated
  USING (is_vs_org_member(organisation_id));

-- ============================================================
-- vs_suppliers
-- ============================================================
CREATE POLICY "Org members can insert suppliers"
  ON vs_suppliers FOR INSERT TO authenticated
  WITH CHECK (is_vs_org_member(organisation_id));

CREATE POLICY "Org members can update suppliers"
  ON vs_suppliers FOR UPDATE TO authenticated
  USING (is_vs_org_member(organisation_id))
  WITH CHECK (is_vs_org_member(organisation_id));

CREATE POLICY "Org members can delete suppliers"
  ON vs_suppliers FOR DELETE TO authenticated
  USING (is_vs_org_member(organisation_id));

-- ============================================================
-- vs_materials
-- ============================================================
CREATE POLICY "Org members can insert materials"
  ON vs_materials FOR INSERT TO authenticated
  WITH CHECK (is_vs_org_member(organisation_id));

CREATE POLICY "Org members can update materials"
  ON vs_materials FOR UPDATE TO authenticated
  USING (is_vs_org_member(organisation_id))
  WITH CHECK (is_vs_org_member(organisation_id));

CREATE POLICY "Org members can delete materials"
  ON vs_materials FOR DELETE TO authenticated
  USING (is_vs_org_member(organisation_id));

-- ============================================================
-- vs_locations (fix preemptively — same pattern)
-- ============================================================
DROP POLICY IF EXISTS "Admins can insert locations" ON vs_locations;
DROP POLICY IF EXISTS "Admins can update locations" ON vs_locations;
DROP POLICY IF EXISTS "Admins can delete locations" ON vs_locations;

CREATE POLICY "Org members can insert locations"
  ON vs_locations FOR INSERT TO authenticated
  WITH CHECK (is_vs_org_member(organisation_id));

CREATE POLICY "Org members can update locations"
  ON vs_locations FOR UPDATE TO authenticated
  USING (is_vs_org_member(organisation_id))
  WITH CHECK (is_vs_org_member(organisation_id));

CREATE POLICY "Org members can delete locations"
  ON vs_locations FOR DELETE TO authenticated
  USING (is_vs_org_member(organisation_id));
