/*
  # Allow all org members to manage vs_projects, vs_suppliers, vs_materials

  ## Problem
  INSERT/UPDATE/DELETE policies on these three tables require role = 'admin',
  so regular org members get a silent RLS rejection when trying to add data.

  ## Fix
  Replace admin-only write policies with org-member write policies.
  Any authenticated member of the organisation can now create, update,
  and soft-delete their organisation's projects, suppliers, and materials.

  ## Tables Modified
  - vs_projects   — INSERT, UPDATE, DELETE open to all org members
  - vs_suppliers  — INSERT, UPDATE, DELETE open to all org members
  - vs_materials  — INSERT, UPDATE, DELETE open to all org members
*/

-- ============================================================
-- vs_projects
-- ============================================================
DROP POLICY IF EXISTS "Admins can insert projects"  ON vs_projects;
DROP POLICY IF EXISTS "Admins can update projects"  ON vs_projects;
DROP POLICY IF EXISTS "Admins can delete projects"  ON vs_projects;

CREATE POLICY "Org members can insert projects"
  ON vs_projects FOR INSERT TO authenticated
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Org members can update projects"
  ON vs_projects FOR UPDATE TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Org members can delete projects"
  ON vs_projects FOR DELETE TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid()
    )
  );

-- ============================================================
-- vs_suppliers
-- ============================================================
DROP POLICY IF EXISTS "Admins can insert suppliers"  ON vs_suppliers;
DROP POLICY IF EXISTS "Admins can update suppliers"  ON vs_suppliers;
DROP POLICY IF EXISTS "Admins can delete suppliers"  ON vs_suppliers;

CREATE POLICY "Org members can insert suppliers"
  ON vs_suppliers FOR INSERT TO authenticated
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Org members can update suppliers"
  ON vs_suppliers FOR UPDATE TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Org members can delete suppliers"
  ON vs_suppliers FOR DELETE TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid()
    )
  );

-- ============================================================
-- vs_materials
-- ============================================================
DROP POLICY IF EXISTS "Admins can insert materials"  ON vs_materials;
DROP POLICY IF EXISTS "Admins can update materials"  ON vs_materials;
DROP POLICY IF EXISTS "Admins can delete materials"  ON vs_materials;

CREATE POLICY "Org members can insert materials"
  ON vs_materials FOR INSERT TO authenticated
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Org members can update materials"
  ON vs_materials FOR UPDATE TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Org members can delete materials"
  ON vs_materials FOR DELETE TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid()
    )
  );
