/*
  # Fix all remaining vs_* write policies still using vs_user_profiles

  ## Problem
  Many INSERT/UPDATE policies still query vs_user_profiles (empty table),
  causing "infinite recursion" errors. All must use is_vs_org_member() instead.

  ## Also
  The vs_user_profiles "Admins can view all profiles in org" SELECT policy
  is self-referential causing the infinite recursion error shown in the UI.
  Since vs_user_profiles is unused (app uses organisation_members), simplify it.
*/

-- ============================================================
-- vs_orders
-- ============================================================
DROP POLICY IF EXISTS "Org members can insert orders" ON vs_orders;
DROP POLICY IF EXISTS "Org members can update orders" ON vs_orders;
DROP POLICY IF EXISTS "Org members can delete orders" ON vs_orders;

CREATE POLICY "Org members can insert orders"
  ON vs_orders FOR INSERT TO authenticated
  WITH CHECK (is_vs_org_member(organisation_id));

CREATE POLICY "Org members can update orders"
  ON vs_orders FOR UPDATE TO authenticated
  USING (is_vs_org_member(organisation_id))
  WITH CHECK (is_vs_org_member(organisation_id));

CREATE POLICY "Org members can delete orders"
  ON vs_orders FOR DELETE TO authenticated
  USING (is_vs_org_member(organisation_id));

-- ============================================================
-- vs_order_items
-- ============================================================
DROP POLICY IF EXISTS "Org members can insert order items" ON vs_order_items;
DROP POLICY IF EXISTS "Org members can update order items" ON vs_order_items;
DROP POLICY IF EXISTS "Org members can delete order items" ON vs_order_items;

CREATE POLICY "Org members can insert order items"
  ON vs_order_items FOR INSERT TO authenticated
  WITH CHECK (is_vs_org_member(organisation_id));

CREATE POLICY "Org members can update order items"
  ON vs_order_items FOR UPDATE TO authenticated
  USING (is_vs_org_member(organisation_id))
  WITH CHECK (is_vs_org_member(organisation_id));

CREATE POLICY "Org members can delete order items"
  ON vs_order_items FOR DELETE TO authenticated
  USING (is_vs_org_member(organisation_id));

-- ============================================================
-- vs_stock_movements
-- ============================================================
DROP POLICY IF EXISTS "Org members can insert movements" ON vs_stock_movements;
DROP POLICY IF EXISTS "Org members can update movements" ON vs_stock_movements;

CREATE POLICY "Org members can insert movements"
  ON vs_stock_movements FOR INSERT TO authenticated
  WITH CHECK (is_vs_org_member(organisation_id));

CREATE POLICY "Org members can update movements"
  ON vs_stock_movements FOR UPDATE TO authenticated
  USING (is_vs_org_member(organisation_id))
  WITH CHECK (is_vs_org_member(organisation_id));

-- ============================================================
-- vs_stock_balances
-- ============================================================
DROP POLICY IF EXISTS "Org members can upsert balances" ON vs_stock_balances;
DROP POLICY IF EXISTS "Org members can update balances" ON vs_stock_balances;
DROP POLICY IF EXISTS "Org members can delete balances" ON vs_stock_balances;

CREATE POLICY "Org members can upsert balances"
  ON vs_stock_balances FOR INSERT TO authenticated
  WITH CHECK (is_vs_org_member(organisation_id));

CREATE POLICY "Org members can update balances"
  ON vs_stock_balances FOR UPDATE TO authenticated
  USING (is_vs_org_member(organisation_id))
  WITH CHECK (is_vs_org_member(organisation_id));

-- ============================================================
-- vs_transfer_requests
-- ============================================================
DROP POLICY IF EXISTS "Org members can insert transfer requests" ON vs_transfer_requests;
DROP POLICY IF EXISTS "Org members can update transfer requests" ON vs_transfer_requests;
DROP POLICY IF EXISTS "Org members can delete transfer requests" ON vs_transfer_requests;

CREATE POLICY "Org members can insert transfer requests"
  ON vs_transfer_requests FOR INSERT TO authenticated
  WITH CHECK (is_vs_org_member(organisation_id));

CREATE POLICY "Org members can update transfer requests"
  ON vs_transfer_requests FOR UPDATE TO authenticated
  USING (is_vs_org_member(organisation_id))
  WITH CHECK (is_vs_org_member(organisation_id));

CREATE POLICY "Org members can delete transfer requests"
  ON vs_transfer_requests FOR DELETE TO authenticated
  USING (is_vs_org_member(organisation_id));

-- ============================================================
-- vs_sourcing_decisions
-- ============================================================
DROP POLICY IF EXISTS "Org members can insert sourcing decisions" ON vs_sourcing_decisions;
DROP POLICY IF EXISTS "Org members can update sourcing decisions" ON vs_sourcing_decisions;
DROP POLICY IF EXISTS "Org members can delete sourcing decisions" ON vs_sourcing_decisions;

CREATE POLICY "Org members can insert sourcing decisions"
  ON vs_sourcing_decisions FOR INSERT TO authenticated
  WITH CHECK (is_vs_org_member(organisation_id));

CREATE POLICY "Org members can update sourcing decisions"
  ON vs_sourcing_decisions FOR UPDATE TO authenticated
  USING (is_vs_org_member(organisation_id))
  WITH CHECK (is_vs_org_member(organisation_id));

CREATE POLICY "Org members can delete sourcing decisions"
  ON vs_sourcing_decisions FOR DELETE TO authenticated
  USING (is_vs_org_member(organisation_id));

-- ============================================================
-- vs_sourcing_plan_items
-- ============================================================
DROP POLICY IF EXISTS "Org members can insert sourcing plan items" ON vs_sourcing_plan_items;
DROP POLICY IF EXISTS "Org members can update sourcing plan items" ON vs_sourcing_plan_items;
DROP POLICY IF EXISTS "Org members can delete sourcing plan items" ON vs_sourcing_plan_items;

CREATE POLICY "Org members can insert sourcing plan items"
  ON vs_sourcing_plan_items FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM vs_sourcing_decisions sd
      WHERE sd.id = sourcing_decision_id
        AND is_vs_org_member(sd.organisation_id)
    )
  );

CREATE POLICY "Org members can update sourcing plan items"
  ON vs_sourcing_plan_items FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM vs_sourcing_decisions sd
      WHERE sd.id = sourcing_decision_id
        AND is_vs_org_member(sd.organisation_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM vs_sourcing_decisions sd
      WHERE sd.id = sourcing_decision_id
        AND is_vs_org_member(sd.organisation_id)
    )
  );

CREATE POLICY "Org members can delete sourcing plan items"
  ON vs_sourcing_plan_items FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM vs_sourcing_decisions sd
      WHERE sd.id = sourcing_decision_id
        AND is_vs_org_member(sd.organisation_id)
    )
  );

-- ============================================================
-- vs_user_profiles — fix self-referential recursion
-- ============================================================
DROP POLICY IF EXISTS "Admins can view all profiles in org" ON vs_user_profiles;
DROP POLICY IF EXISTS "Admins can update profiles in org" ON vs_user_profiles;

CREATE POLICY "Admins can view all profiles in org"
  ON vs_user_profiles FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organisation_members om
      WHERE om.user_id = auth.uid()
        AND om.organisation_id = vs_user_profiles.organisation_id
        AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Admins can update profiles in org"
  ON vs_user_profiles FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organisation_members om
      WHERE om.user_id = auth.uid()
        AND om.organisation_id = vs_user_profiles.organisation_id
        AND om.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organisation_members om
      WHERE om.user_id = auth.uid()
        AND om.organisation_id = vs_user_profiles.organisation_id
        AND om.role IN ('owner', 'admin')
    )
  );
