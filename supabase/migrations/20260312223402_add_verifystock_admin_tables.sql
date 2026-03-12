/*
  # VerifyStock Admin Tables

  ## New Tables
  - `vs_user_profiles` — per-user profile storing role (admin/user), last known GPS coords and timestamp, van plate
  - `vs_materials` — catalogue of materials/products with supplier, type, unit, SKU, price
  - `vs_suppliers` — supplier master with name, emails (array), phone, address, active flag
  - `vs_locations` — storerooms / vans / sites with address, lat/lng, type
  - `vs_projects` — project register with name, number, client, address

  ## Security
  - RLS enabled on all tables
  - Authenticated users can read; only admins can write to admin-only tables
*/

-- vs_user_profiles
CREATE TABLE IF NOT EXISTS vs_user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  van_plate text,
  last_lat double precision,
  last_lon double precision,
  last_location_at timestamptz,
  nearest_location_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE vs_user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON vs_user_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON vs_user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON vs_user_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can view all profiles in org"
  ON vs_user_profiles FOR SELECT
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update profiles in org"
  ON vs_user_profiles FOR UPDATE
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- vs_suppliers
CREATE TABLE IF NOT EXISTS vs_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name text NOT NULL,
  emails text[] DEFAULT '{}',
  phone text,
  address text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE vs_suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view suppliers"
  ON vs_suppliers FOR SELECT
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Admins can insert suppliers"
  ON vs_suppliers FOR INSERT
  TO authenticated
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update suppliers"
  ON vs_suppliers FOR UPDATE
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can delete suppliers"
  ON vs_suppliers FOR DELETE
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- vs_materials
CREATE TABLE IF NOT EXISTS vs_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text,
  unit text NOT NULL DEFAULT 'ea',
  unit_value numeric(12,4),
  price numeric(12,2),
  sku text,
  supplier_id uuid REFERENCES vs_suppliers(id),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE vs_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view materials"
  ON vs_materials FOR SELECT
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Admins can insert materials"
  ON vs_materials FOR INSERT
  TO authenticated
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update materials"
  ON vs_materials FOR UPDATE
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can delete materials"
  ON vs_materials FOR DELETE
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- vs_locations
CREATE TABLE IF NOT EXISTS vs_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'storeroom' CHECK (type IN ('storeroom', 'van', 'site')),
  address text,
  lat double precision,
  lng double precision,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE vs_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view locations"
  ON vs_locations FOR SELECT
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Admins can insert locations"
  ON vs_locations FOR INSERT
  TO authenticated
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update locations"
  ON vs_locations FOR UPDATE
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can delete locations"
  ON vs_locations FOR DELETE
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- vs_projects
CREATE TABLE IF NOT EXISTS vs_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name text NOT NULL,
  project_number text,
  client_name text,
  address text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE vs_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view projects"
  ON vs_projects FOR SELECT
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Admins can insert projects"
  ON vs_projects FOR INSERT
  TO authenticated
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update projects"
  ON vs_projects FOR UPDATE
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can delete projects"
  ON vs_projects FOR DELETE
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM vs_user_profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- location inventory view (materials at a location via stock items)
CREATE OR REPLACE FUNCTION admin_adjust_stock(
  p_organisation_id uuid,
  p_stock_item_id uuid,
  p_delta integer,
  p_admin_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO vs_stock_levels (organisation_id, stock_item_id, quantity_on_hand, last_verified_at, last_verified_by)
  VALUES (p_organisation_id, p_stock_item_id, GREATEST(0, p_delta), now(), p_admin_id)
  ON CONFLICT (stock_item_id) DO UPDATE
    SET quantity_on_hand = GREATEST(0, vs_stock_levels.quantity_on_hand + p_delta),
        last_verified_at = now(),
        last_verified_by = p_admin_id;

  INSERT INTO vs_stock_adjustments (organisation_id, stock_item_id, adjustment_type, quantity, reason, adjusted_by)
  VALUES (
    p_organisation_id,
    p_stock_item_id,
    CASE WHEN p_delta >= 0 THEN 'ADD' ELSE 'REMOVE' END,
    ABS(p_delta),
    'Admin adjustment',
    p_admin_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION admin_transfer_stock(
  p_organisation_id uuid,
  p_stock_item_id uuid,
  p_quantity integer,
  p_from_location text,
  p_to_location text,
  p_admin_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE vs_stock_levels
  SET quantity_on_hand = GREATEST(0, quantity_on_hand - p_quantity),
      last_verified_at = now(),
      last_verified_by = p_admin_id
  WHERE stock_item_id = p_stock_item_id;

  INSERT INTO vs_stock_adjustments (organisation_id, stock_item_id, adjustment_type, quantity, reason, reference, adjusted_by)
  VALUES (
    p_organisation_id,
    p_stock_item_id,
    'TRANSFER_OUT',
    p_quantity,
    'Admin transfer to ' || p_to_location,
    p_from_location || ' → ' || p_to_location,
    p_admin_id
  );
END;
$$;

-- RPC to get users with emails for admin user management
CREATE OR REPLACE FUNCTION get_users_with_emails(p_organisation_id uuid)
RETURNS TABLE (
  id uuid,
  email text,
  role text,
  van_plate text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id,
    u.email::text,
    COALESCE(p.role, 'user')::text,
    p.van_plate,
    u.created_at
  FROM auth.users u
  LEFT JOIN vs_user_profiles p ON p.id = u.id AND p.organisation_id = p_organisation_id
  WHERE u.id IN (
    SELECT id FROM vs_user_profiles WHERE organisation_id = p_organisation_id
  );
END;
$$;

-- RPC to set user role
CREATE OR REPLACE FUNCTION set_user_role(
  p_target_user_id uuid,
  p_organisation_id uuid,
  p_role text,
  p_requesting_user_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vs_user_profiles
    WHERE id = p_requesting_user_id
      AND organisation_id = p_organisation_id
      AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: only admins can change roles';
  END IF;

  INSERT INTO vs_user_profiles (id, organisation_id, role)
  VALUES (p_target_user_id, p_organisation_id, p_role)
  ON CONFLICT (id) DO UPDATE SET role = p_role, updated_at = now();
END;
$$;

CREATE INDEX IF NOT EXISTS idx_vs_user_profiles_org ON vs_user_profiles(organisation_id);
CREATE INDEX IF NOT EXISTS idx_vs_materials_org ON vs_materials(organisation_id);
CREATE INDEX IF NOT EXISTS idx_vs_suppliers_org ON vs_suppliers(organisation_id);
CREATE INDEX IF NOT EXISTS idx_vs_locations_org ON vs_locations(organisation_id);
CREATE INDEX IF NOT EXISTS idx_vs_projects_org ON vs_projects(organisation_id);
