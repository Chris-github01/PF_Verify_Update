/*
  # Fix Verify Stock Settings — RLS, Indexes & Triggers

  ## Summary
  The three core settings tables (vs_projects, vs_suppliers, vs_materials) exist and
  have RLS enabled, but their INSERT policies are missing WITH CHECK clauses, meaning
  any authenticated user could insert rows into any organisation. This migration:

  1. Replaces all INSERT policies on the three tables with correctly-constrained versions
     that enforce organisation membership AND admin role via WITH CHECK.

  2. Adds composite indexes on (organisation_id, active) for the common filtered query
     pattern used throughout the settings UI (filter by org + only active rows).

  3. Adds an updated_at auto-update trigger on all three tables so the timestamp stays
     accurate on every UPDATE without application-level handling.

  ## Tables Modified
  - vs_projects   — INSERT policy fixed, composite index added, trigger added
  - vs_suppliers  — INSERT policy fixed, composite index added, trigger added
  - vs_materials  — INSERT policy fixed, composite index added, trigger added

  ## Security Changes
  All INSERT policies now include:
    WITH CHECK (
      organisation_id IN (
        SELECT organisation_id FROM vs_user_profiles
        WHERE id = auth.uid() AND role = 'admin'
      )
    )
  This ensures users can only insert rows that belong to their own organisation
  AND only when they hold the 'admin' role within that organisation.
*/

-- ============================================================
-- 1. Fix INSERT policies — add WITH CHECK for org+role guard
-- ============================================================

-- vs_projects
DROP POLICY IF EXISTS "Admins can insert projects" ON vs_projects;
CREATE POLICY "Admins can insert projects"
  ON vs_projects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM vs_user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- vs_suppliers
DROP POLICY IF EXISTS "Admins can insert suppliers" ON vs_suppliers;
CREATE POLICY "Admins can insert suppliers"
  ON vs_suppliers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM vs_user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- vs_materials
DROP POLICY IF EXISTS "Admins can insert materials" ON vs_materials;
CREATE POLICY "Admins can insert materials"
  ON vs_materials
  FOR INSERT
  TO authenticated
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM vs_user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================
-- 2. Composite indexes for (organisation_id, active) queries
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_vs_projects_org_active
  ON vs_projects (organisation_id, active);

CREATE INDEX IF NOT EXISTS idx_vs_suppliers_org_active
  ON vs_suppliers (organisation_id, active);

CREATE INDEX IF NOT EXISTS idx_vs_materials_org_active
  ON vs_materials (organisation_id, active);

-- Also index materials by supplier for join performance
CREATE INDEX IF NOT EXISTS idx_vs_materials_supplier
  ON vs_materials (supplier_id)
  WHERE supplier_id IS NOT NULL;

-- ============================================================
-- 3. updated_at auto-update trigger
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- vs_projects trigger
DROP TRIGGER IF EXISTS trg_vs_projects_updated_at ON vs_projects;
CREATE TRIGGER trg_vs_projects_updated_at
  BEFORE UPDATE ON vs_projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- vs_suppliers trigger
DROP TRIGGER IF EXISTS trg_vs_suppliers_updated_at ON vs_suppliers;
CREATE TRIGGER trg_vs_suppliers_updated_at
  BEFORE UPDATE ON vs_suppliers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- vs_materials trigger
DROP TRIGGER IF EXISTS trg_vs_materials_updated_at ON vs_materials;
CREATE TRIGGER trg_vs_materials_updated_at
  BEFORE UPDATE ON vs_materials
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
