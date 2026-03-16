/*
  # Fix all vs_* SELECT policies to use organisation_members

  ## Problem
  All SELECT policies on vs_* tables query vs_user_profiles to check org membership,
  but vs_user_profiles is empty. The correct table is organisation_members.

  ## Fix
  Drop all broken SELECT policies and recreate them using is_vs_org_member(),
  which checks organisation_members via SECURITY DEFINER (no recursion).
*/

-- vs_projects
DROP POLICY IF EXISTS "Org members can view projects" ON vs_projects;
CREATE POLICY "Org members can view projects"
  ON vs_projects FOR SELECT TO authenticated
  USING (is_vs_org_member(organisation_id));

-- vs_suppliers
DROP POLICY IF EXISTS "Org members can view suppliers" ON vs_suppliers;
CREATE POLICY "Org members can view suppliers"
  ON vs_suppliers FOR SELECT TO authenticated
  USING (is_vs_org_member(organisation_id));

-- vs_materials
DROP POLICY IF EXISTS "Org members can view materials" ON vs_materials;
CREATE POLICY "Org members can view materials"
  ON vs_materials FOR SELECT TO authenticated
  USING (is_vs_org_member(organisation_id));

-- vs_locations
DROP POLICY IF EXISTS "Org members can view locations" ON vs_locations;
CREATE POLICY "Org members can view locations"
  ON vs_locations FOR SELECT TO authenticated
  USING (is_vs_org_member(organisation_id));

-- vs_orders
DROP POLICY IF EXISTS "Org members can view orders" ON vs_orders;
CREATE POLICY "Org members can view orders"
  ON vs_orders FOR SELECT TO authenticated
  USING (is_vs_org_member(organisation_id));

-- vs_order_items
DROP POLICY IF EXISTS "Org members can view order items" ON vs_order_items;
CREATE POLICY "Org members can view order items"
  ON vs_order_items FOR SELECT TO authenticated
  USING (is_vs_org_member(organisation_id));

-- vs_stock_movements
DROP POLICY IF EXISTS "Org members can view movements" ON vs_stock_movements;
CREATE POLICY "Org members can view movements"
  ON vs_stock_movements FOR SELECT TO authenticated
  USING (is_vs_org_member(organisation_id));

-- vs_stock_balances
DROP POLICY IF EXISTS "Org members can view balances" ON vs_stock_balances;
CREATE POLICY "Org members can view balances"
  ON vs_stock_balances FOR SELECT TO authenticated
  USING (is_vs_org_member(organisation_id));

-- vs_sourcing_decisions
DROP POLICY IF EXISTS "Org members can view sourcing decisions" ON vs_sourcing_decisions;
CREATE POLICY "Org members can view sourcing decisions"
  ON vs_sourcing_decisions FOR SELECT TO authenticated
  USING (is_vs_org_member(organisation_id));

-- vs_sourcing_plan_items (no direct org_id col — join through sourcing_decisions)
DROP POLICY IF EXISTS "Org members can view sourcing plan items" ON vs_sourcing_plan_items;
CREATE POLICY "Org members can view sourcing plan items"
  ON vs_sourcing_plan_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM vs_sourcing_decisions sd
      WHERE sd.id = sourcing_decision_id
        AND is_vs_org_member(sd.organisation_id)
    )
  );

-- vs_transfer_requests
DROP POLICY IF EXISTS "Org members can view transfer requests" ON vs_transfer_requests;
CREATE POLICY "Org members can view transfer requests"
  ON vs_transfer_requests FOR SELECT TO authenticated
  USING (is_vs_org_member(organisation_id));
