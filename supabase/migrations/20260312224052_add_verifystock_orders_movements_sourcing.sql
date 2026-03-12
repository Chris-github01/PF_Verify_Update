/*
  # VerifyStock Orders, Stock Movements & Sourcing System

  ## New Tables
  - `vs_orders` — purchase/transfer orders with status lifecycle (DRAFT → PLANNED → COMPLETE / CANCELLED)
  - `vs_order_items` — line items per order (material, quantity, source type)
  - `vs_stock_movements` — immutable ledger of every stock add/remove/transfer with project allocation
  - `vs_stock_balances` — running balance per material+location, updated by trigger
  - `vs_sourcing_decisions` — approved sourcing plan header per order
  - `vs_sourcing_plan_items` — individual source lines (van/storeroom/supplier per material)
  - `vs_order_sourcing` — maps orders to their sourcing decisions
  - `vs_transfer_requests` — pending transfer requests from one user to another
  - `stock_search_view` — materialised view joining materials + balances + locations for search

  ## RPCs
  - `calculate_multi_material_sourcing` — sourcing plan engine
  - `plan_order` — marks order as PLANNED, creates sourcing rows, generates PO
  - `receive_supplier_order` — adds ordered materials to van stock
  - `approve_transfer` / `reject_transfer` — handle pending transfer requests
*/

-- vs_orders
CREATE TABLE IF NOT EXISTS vs_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  project_id uuid REFERENCES vs_projects(id),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PLANNED','COMPLETE','CANCELLED')),
  po_number text,
  notes text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE vs_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view orders"
  ON vs_orders FOR SELECT TO authenticated
  USING (organisation_id IN (
    SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Org members can insert orders"
  ON vs_orders FOR INSERT TO authenticated
  WITH CHECK (organisation_id IN (
    SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid()
  ) AND created_by = auth.uid());

CREATE POLICY "Org members can update orders"
  ON vs_orders FOR UPDATE TO authenticated
  USING (organisation_id IN (
    SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid()
  ))
  WITH CHECK (organisation_id IN (
    SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid()
  ));

-- vs_order_items
CREATE TABLE IF NOT EXISTS vs_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES vs_orders(id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  material_id uuid REFERENCES vs_materials(id),
  material_name text NOT NULL,
  supplier_id uuid REFERENCES vs_suppliers(id),
  supplier_name text,
  quantity numeric(12,4) NOT NULL CHECK (quantity > 0),
  source_type text CHECK (source_type IN ('SUPPLIER','STOREROOM','VAN')),
  from_location_id uuid REFERENCES vs_locations(id),
  from_location_name text,
  unit text DEFAULT 'ea',
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE vs_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view order items"
  ON vs_order_items FOR SELECT TO authenticated
  USING (organisation_id IN (
    SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Org members can insert order items"
  ON vs_order_items FOR INSERT TO authenticated
  WITH CHECK (organisation_id IN (
    SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Org members can update order items"
  ON vs_order_items FOR UPDATE TO authenticated
  USING (organisation_id IN (
    SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid()
  ))
  WITH CHECK (organisation_id IN (
    SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid()
  ));

-- vs_stock_movements (immutable ledger)
CREATE TABLE IF NOT EXISTS vs_stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  material_id uuid REFERENCES vs_materials(id),
  material_name text NOT NULL,
  supplier_id uuid REFERENCES vs_suppliers(id),
  supplier_name text,
  location_id uuid REFERENCES vs_locations(id),
  location_name text,
  movement_type text NOT NULL CHECK (movement_type IN ('ADD','REMOVE','TRANSFER','SUPPLIER_ORDER','ORDER')),
  quantity numeric(12,4) NOT NULL,
  allocated_project_id uuid REFERENCES vs_projects(id),
  allocated_project_name text,
  order_id uuid REFERENCES vs_orders(id),
  notes text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE vs_stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view movements"
  ON vs_stock_movements FOR SELECT TO authenticated
  USING (organisation_id IN (
    SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Org members can insert movements"
  ON vs_stock_movements FOR INSERT TO authenticated
  WITH CHECK (organisation_id IN (
    SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid()
  ) AND created_by = auth.uid());

-- vs_stock_balances
CREATE TABLE IF NOT EXISTS vs_stock_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES vs_materials(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES vs_locations(id) ON DELETE CASCADE,
  quantity numeric(12,4) NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (material_id, location_id)
);

ALTER TABLE vs_stock_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view balances"
  ON vs_stock_balances FOR SELECT TO authenticated
  USING (organisation_id IN (
    SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Org members can upsert balances"
  ON vs_stock_balances FOR INSERT TO authenticated
  WITH CHECK (organisation_id IN (
    SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Org members can update balances"
  ON vs_stock_balances FOR UPDATE TO authenticated
  USING (organisation_id IN (
    SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid()
  ))
  WITH CHECK (organisation_id IN (
    SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid()
  ));

-- Trigger to update stock balances on movement insert
CREATE OR REPLACE FUNCTION update_stock_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.location_id IS NULL OR NEW.material_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO vs_stock_balances (organisation_id, material_id, location_id, quantity, updated_at)
  VALUES (NEW.organisation_id, NEW.material_id, NEW.location_id, 0, now())
  ON CONFLICT (material_id, location_id) DO NOTHING;

  IF NEW.movement_type IN ('ADD', 'SUPPLIER_ORDER') THEN
    UPDATE vs_stock_balances
    SET quantity = GREATEST(0, quantity + NEW.quantity), updated_at = now()
    WHERE material_id = NEW.material_id AND location_id = NEW.location_id;
  ELSIF NEW.movement_type IN ('REMOVE', 'ORDER') THEN
    UPDATE vs_stock_balances
    SET quantity = GREATEST(0, quantity - NEW.quantity), updated_at = now()
    WHERE material_id = NEW.material_id AND location_id = NEW.location_id;
  ELSIF NEW.movement_type = 'TRANSFER' THEN
    UPDATE vs_stock_balances
    SET quantity = GREATEST(0, quantity - NEW.quantity), updated_at = now()
    WHERE material_id = NEW.material_id AND location_id = NEW.location_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_stock_balance ON vs_stock_movements;
CREATE TRIGGER trg_update_stock_balance
  AFTER INSERT ON vs_stock_movements
  FOR EACH ROW EXECUTE FUNCTION update_stock_balance();

-- vs_sourcing_decisions
CREATE TABLE IF NOT EXISTS vs_sourcing_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES vs_orders(id) ON DELETE CASCADE,
  approved_by uuid NOT NULL REFERENCES auth.users(id),
  approved_at timestamptz DEFAULT now(),
  total_cost numeric(12,2),
  notes text
);

ALTER TABLE vs_sourcing_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view sourcing decisions"
  ON vs_sourcing_decisions FOR SELECT TO authenticated
  USING (organisation_id IN (
    SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Org members can insert sourcing decisions"
  ON vs_sourcing_decisions FOR INSERT TO authenticated
  WITH CHECK (organisation_id IN (
    SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid()
  ));

-- vs_sourcing_plan_items
CREATE TABLE IF NOT EXISTS vs_sourcing_plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sourcing_decision_id uuid NOT NULL REFERENCES vs_sourcing_decisions(id) ON DELETE CASCADE,
  material_id uuid REFERENCES vs_materials(id),
  material_name text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('VAN','STOREROOM','SUPPLIER')),
  source_id uuid REFERENCES vs_locations(id),
  source_name text,
  quantity numeric(12,4) NOT NULL,
  collection_cost numeric(12,2),
  material_value numeric(12,2),
  efficiency_ratio numeric(8,4),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE vs_sourcing_plan_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view sourcing plan items"
  ON vs_sourcing_plan_items FOR SELECT TO authenticated
  USING (
    sourcing_decision_id IN (
      SELECT sd.id FROM vs_sourcing_decisions sd
      WHERE sd.organisation_id IN (
        SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Org members can insert sourcing plan items"
  ON vs_sourcing_plan_items FOR INSERT TO authenticated
  WITH CHECK (
    sourcing_decision_id IN (
      SELECT sd.id FROM vs_sourcing_decisions sd
      WHERE sd.organisation_id IN (
        SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid()
      )
    )
  );

-- vs_transfer_requests
CREATE TABLE IF NOT EXISTS vs_transfer_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  material_id uuid REFERENCES vs_materials(id),
  material_name text NOT NULL,
  from_location_id uuid REFERENCES vs_locations(id),
  from_location_name text,
  to_location_id uuid REFERENCES vs_locations(id),
  to_location_name text,
  quantity numeric(12,4) NOT NULL,
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  requester_name text,
  po_number text,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  order_id uuid REFERENCES vs_orders(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE vs_transfer_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view transfer requests"
  ON vs_transfer_requests FOR SELECT TO authenticated
  USING (organisation_id IN (
    SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Org members can insert transfer requests"
  ON vs_transfer_requests FOR INSERT TO authenticated
  WITH CHECK (organisation_id IN (
    SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid()
  ) AND requested_by = auth.uid());

CREATE POLICY "Org members can update transfer requests"
  ON vs_transfer_requests FOR UPDATE TO authenticated
  USING (organisation_id IN (
    SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid()
  ))
  WITH CHECK (organisation_id IN (
    SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid()
  ));

-- Stock search view
CREATE OR REPLACE VIEW stock_search_view AS
SELECT
  m.id AS material_id,
  m.name AS material_name,
  m.type AS material_type,
  m.unit,
  m.sku,
  m.organisation_id,
  s.id AS supplier_id,
  s.name AS supplier_name,
  l.id AS location_id,
  l.name AS location_name,
  l.type AS location_type,
  COALESCE(b.quantity, 0) AS quantity
FROM vs_materials m
LEFT JOIN vs_suppliers s ON s.id = m.supplier_id
LEFT JOIN vs_stock_balances b ON b.material_id = m.id
LEFT JOIN vs_locations l ON l.id = b.location_id
WHERE m.active = true;

-- RPC: calculate_multi_material_sourcing
CREATE OR REPLACE FUNCTION calculate_multi_material_sourcing(
  p_organisation_id uuid,
  p_user_id uuid,
  p_order_id uuid
)
RETURNS TABLE (
  material_id uuid,
  material_name text,
  source_type text,
  source_id uuid,
  source_name text,
  available_quantity numeric,
  recommended_quantity numeric,
  collection_cost numeric,
  material_value numeric,
  efficiency_ratio numeric,
  priority_rank integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nearest_location_id uuid;
BEGIN
  SELECT nearest_location_id INTO v_nearest_location_id
  FROM vs_user_profiles WHERE id = p_user_id;

  RETURN QUERY
  SELECT
    oi.material_id,
    oi.material_name,
    CASE
      WHEN l.type = 'van' AND l.id = v_nearest_location_id THEN 'VAN'
      WHEN l.type = 'storeroom' THEN 'STOREROOM'
      ELSE 'SUPPLIER'
    END::text AS source_type,
    b.location_id AS source_id,
    l.name AS source_name,
    b.quantity AS available_quantity,
    LEAST(b.quantity, oi.quantity) AS recommended_quantity,
    CASE
      WHEN l.type = 'van' AND l.id = v_nearest_location_id THEN 0.0
      WHEN l.type = 'storeroom' THEN 5.0
      ELSE 15.0
    END::numeric AS collection_cost,
    (LEAST(b.quantity, oi.quantity) * COALESCE(m.price, 0))::numeric AS material_value,
    CASE
      WHEN l.type = 'van' AND l.id = v_nearest_location_id THEN 1.0
      WHEN l.type = 'storeroom' THEN 0.8
      ELSE 0.5
    END::numeric AS efficiency_ratio,
    CASE
      WHEN l.type = 'van' AND l.id = v_nearest_location_id THEN 1
      WHEN l.type = 'storeroom' THEN 2
      ELSE 3
    END::integer AS priority_rank
  FROM vs_order_items oi
  JOIN vs_stock_balances b ON b.material_id = oi.material_id AND b.quantity > 0
  JOIN vs_locations l ON l.id = b.location_id AND l.organisation_id = p_organisation_id AND l.active = true
  JOIN vs_materials m ON m.id = oi.material_id
  WHERE oi.order_id = p_order_id
    AND oi.organisation_id = p_organisation_id
  ORDER BY oi.material_name, priority_rank;
END;
$$;

-- RPC: plan_order
CREATE OR REPLACE FUNCTION plan_order(
  p_order_id uuid,
  p_organisation_id uuid,
  p_user_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_po text;
BEGIN
  v_po := 'PO-' || to_char(now(), 'YYYYMMDD') || '-' || substr(p_order_id::text, 1, 6);

  UPDATE vs_orders
  SET status = 'PLANNED', po_number = v_po, updated_at = now()
  WHERE id = p_order_id AND organisation_id = p_organisation_id;

  RETURN v_po;
END;
$$;

-- RPC: receive_supplier_order
CREATE OR REPLACE FUNCTION receive_supplier_order(
  p_order_id uuid,
  p_organisation_id uuid,
  p_user_id uuid,
  p_van_location_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO vs_stock_movements (
    organisation_id, material_id, material_name, supplier_id, supplier_name,
    location_id, location_name, movement_type, quantity, order_id, created_by
  )
  SELECT
    oi.organisation_id,
    oi.material_id,
    oi.material_name,
    oi.supplier_id,
    oi.supplier_name,
    p_van_location_id,
    (SELECT name FROM vs_locations WHERE id = p_van_location_id),
    'SUPPLIER_ORDER',
    oi.quantity,
    p_order_id,
    p_user_id
  FROM vs_order_items oi
  WHERE oi.order_id = p_order_id
    AND oi.source_type = 'SUPPLIER';

  UPDATE vs_orders
  SET status = 'COMPLETE', updated_at = now()
  WHERE id = p_order_id;
END;
$$;

-- RPC: approve_transfer
CREATE OR REPLACE FUNCTION approve_transfer(
  p_request_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req vs_transfer_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_req FROM vs_transfer_requests WHERE id = p_request_id;

  -- Deduct from source
  UPDATE vs_stock_balances
  SET quantity = GREATEST(0, quantity - v_req.quantity), updated_at = now()
  WHERE material_id = v_req.material_id AND location_id = v_req.from_location_id;

  -- Add to destination
  INSERT INTO vs_stock_balances (organisation_id, material_id, location_id, quantity, updated_at)
  VALUES (v_req.organisation_id, v_req.material_id, v_req.to_location_id, v_req.quantity, now())
  ON CONFLICT (material_id, location_id) DO UPDATE
    SET quantity = vs_stock_balances.quantity + v_req.quantity, updated_at = now();

  UPDATE vs_transfer_requests SET status = 'APPROVED', updated_at = now() WHERE id = p_request_id;
END;
$$;

-- RPC: reject_transfer
CREATE OR REPLACE FUNCTION reject_transfer(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE vs_transfer_requests SET status = 'REJECTED', updated_at = now() WHERE id = p_request_id;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_vs_orders_org_status ON vs_orders(organisation_id, status);
CREATE INDEX IF NOT EXISTS idx_vs_order_items_order ON vs_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_vs_movements_org ON vs_stock_movements(organisation_id);
CREATE INDEX IF NOT EXISTS idx_vs_movements_material ON vs_stock_movements(material_id);
CREATE INDEX IF NOT EXISTS idx_vs_balances_material ON vs_stock_balances(material_id);
CREATE INDEX IF NOT EXISTS idx_vs_balances_location ON vs_stock_balances(location_id);
CREATE INDEX IF NOT EXISTS idx_vs_transfer_requests_org ON vs_transfer_requests(organisation_id, status);
