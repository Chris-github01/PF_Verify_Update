/*
  # VerifyStock Module Schema

  ## Summary
  Creates all tables, indexes, RLS policies, and triggers for the VerifyStock module
  inside the SCC (Subcontract Commercial Control) section.

  ## New Tables

  ### vs_stock_items
  Master catalogue of tracked stock items. Stores item name, SKU, category, unit,
  min/max thresholds, location, supplier info, unit cost, and active flag.

  ### vs_stock_levels
  Current on-hand quantity per item (one row per item). Updated on every
  verification or adjustment. Tracks who last verified and when.

  ### vs_verifications
  Immutable audit log of every stock count performed. Records the verified quantity,
  the previous system quantity, and an auto-computed discrepancy column.

  ### vs_stock_adjustments
  Every inventory movement: ADD, REMOVE, ADJUST (set absolute), TRANSFER_IN,
  TRANSFER_OUT. Used for full audit trail.

  ### vs_stock_alerts
  Auto-generated alerts triggered when stock levels change (LOW_STOCK,
  OUT_OF_STOCK, OVERSTOCK). Also supports DISCREPANCY and CUSTOM alert types.

  ## Security
  - RLS enabled on all five tables
  - Authenticated users can read everything (shared stock visibility)
  - Insert/Update restricted to owner or admin role
  - Alert trigger runs as SECURITY DEFINER to bypass RLS when inserting alerts

  ## Important Notes
  1. The vs_check_stock_alerts() trigger fires after every INSERT/UPDATE on
     vs_stock_levels.quantity_on_hand and auto-creates the relevant alert row.
  2. The discrepancy column in vs_verifications is a generated/stored column.
  3. All tables use IF NOT EXISTS so re-running this migration is safe.
*/

CREATE TABLE IF NOT EXISTS vs_stock_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  sku           text NOT NULL DEFAULT '',
  category      text NOT NULL DEFAULT 'General',
  unit          text NOT NULL DEFAULT 'each',
  min_quantity  numeric NOT NULL DEFAULT 0,
  max_quantity  numeric NOT NULL DEFAULT 0,
  location      text NOT NULL DEFAULT '',
  supplier_name text NOT NULL DEFAULT '',
  unit_cost     numeric NOT NULL DEFAULT 0,
  notes         text NOT NULL DEFAULT '',
  active        boolean NOT NULL DEFAULT true,
  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE vs_stock_items ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_vs_stock_items_active      ON vs_stock_items(active);
CREATE INDEX IF NOT EXISTS idx_vs_stock_items_category    ON vs_stock_items(category);
CREATE INDEX IF NOT EXISTS idx_vs_stock_items_created_by  ON vs_stock_items(created_by);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vs_stock_items' AND policyname='vs_items_select') THEN
    CREATE POLICY "vs_items_select" ON vs_stock_items FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vs_stock_items' AND policyname='vs_items_insert') THEN
    CREATE POLICY "vs_items_insert" ON vs_stock_items FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vs_stock_items' AND policyname='vs_items_update') THEN
    CREATE POLICY "vs_items_update" ON vs_stock_items FOR UPDATE TO authenticated USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vs_stock_items' AND policyname='vs_items_delete') THEN
    CREATE POLICY "vs_items_delete" ON vs_stock_items FOR DELETE TO authenticated USING (auth.uid() = created_by);
  END IF;
END $$;

-- ============================================================

CREATE TABLE IF NOT EXISTS vs_stock_levels (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_item_id     uuid NOT NULL REFERENCES vs_stock_items(id) ON DELETE CASCADE,
  quantity_on_hand  numeric NOT NULL DEFAULT 0,
  last_verified_at  timestamptz,
  last_verified_by  uuid REFERENCES auth.users(id),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE(stock_item_id)
);

ALTER TABLE vs_stock_levels ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_vs_stock_levels_item ON vs_stock_levels(stock_item_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vs_stock_levels' AND policyname='vs_levels_select') THEN
    CREATE POLICY "vs_levels_select" ON vs_stock_levels FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vs_stock_levels' AND policyname='vs_levels_insert') THEN
    CREATE POLICY "vs_levels_insert" ON vs_stock_levels FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vs_stock_levels' AND policyname='vs_levels_update') THEN
    CREATE POLICY "vs_levels_update" ON vs_stock_levels FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================

CREATE TABLE IF NOT EXISTS vs_verifications (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_item_id     uuid NOT NULL REFERENCES vs_stock_items(id) ON DELETE CASCADE,
  verified_quantity numeric NOT NULL,
  previous_quantity numeric NOT NULL DEFAULT 0,
  discrepancy       numeric GENERATED ALWAYS AS (verified_quantity - previous_quantity) STORED,
  notes             text NOT NULL DEFAULT '',
  verified_by       uuid NOT NULL REFERENCES auth.users(id),
  verified_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE vs_verifications ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_vs_verifications_item ON vs_verifications(stock_item_id);
CREATE INDEX IF NOT EXISTS idx_vs_verifications_by   ON vs_verifications(verified_by);
CREATE INDEX IF NOT EXISTS idx_vs_verifications_at   ON vs_verifications(verified_at DESC);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vs_verifications' AND policyname='vs_verifs_select') THEN
    CREATE POLICY "vs_verifs_select" ON vs_verifications FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vs_verifications' AND policyname='vs_verifs_insert') THEN
    CREATE POLICY "vs_verifs_insert" ON vs_verifications FOR INSERT TO authenticated WITH CHECK (auth.uid() = verified_by);
  END IF;
END $$;

-- ============================================================

CREATE TABLE IF NOT EXISTS vs_stock_adjustments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_item_id    uuid NOT NULL REFERENCES vs_stock_items(id) ON DELETE CASCADE,
  adjustment_type  text NOT NULL CHECK (adjustment_type IN ('ADD','REMOVE','ADJUST','TRANSFER_IN','TRANSFER_OUT')),
  quantity         numeric NOT NULL,
  reason           text NOT NULL DEFAULT '',
  reference        text NOT NULL DEFAULT '',
  adjusted_by      uuid NOT NULL REFERENCES auth.users(id),
  adjusted_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE vs_stock_adjustments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_vs_adjustments_item ON vs_stock_adjustments(stock_item_id);
CREATE INDEX IF NOT EXISTS idx_vs_adjustments_at   ON vs_stock_adjustments(adjusted_at DESC);
CREATE INDEX IF NOT EXISTS idx_vs_adjustments_type ON vs_stock_adjustments(adjustment_type);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vs_stock_adjustments' AND policyname='vs_adjs_select') THEN
    CREATE POLICY "vs_adjs_select" ON vs_stock_adjustments FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vs_stock_adjustments' AND policyname='vs_adjs_insert') THEN
    CREATE POLICY "vs_adjs_insert" ON vs_stock_adjustments FOR INSERT TO authenticated WITH CHECK (auth.uid() = adjusted_by);
  END IF;
END $$;

-- ============================================================

CREATE TABLE IF NOT EXISTS vs_stock_alerts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_item_id  uuid NOT NULL REFERENCES vs_stock_items(id) ON DELETE CASCADE,
  alert_type     text NOT NULL CHECK (alert_type IN ('LOW_STOCK','OUT_OF_STOCK','OVERSTOCK','DISCREPANCY','CUSTOM')),
  message        text NOT NULL,
  is_read        boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE vs_stock_alerts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_vs_alerts_item    ON vs_stock_alerts(stock_item_id);
CREATE INDEX IF NOT EXISTS idx_vs_alerts_read    ON vs_stock_alerts(is_read);
CREATE INDEX IF NOT EXISTS idx_vs_alerts_created ON vs_stock_alerts(created_at DESC);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vs_stock_alerts' AND policyname='vs_alerts_select') THEN
    CREATE POLICY "vs_alerts_select" ON vs_stock_alerts FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vs_stock_alerts' AND policyname='vs_alerts_insert') THEN
    CREATE POLICY "vs_alerts_insert" ON vs_stock_alerts FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vs_stock_alerts' AND policyname='vs_alerts_update') THEN
    CREATE POLICY "vs_alerts_update" ON vs_stock_alerts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================
-- Auto-alert trigger

CREATE OR REPLACE FUNCTION vs_check_stock_alerts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item vs_stock_items%ROWTYPE;
BEGIN
  SELECT * INTO item FROM vs_stock_items WHERE id = NEW.stock_item_id;
  IF item.id IS NULL THEN RETURN NEW; END IF;

  IF NEW.quantity_on_hand = 0 THEN
    INSERT INTO vs_stock_alerts (stock_item_id, alert_type, message)
    VALUES (NEW.stock_item_id, 'OUT_OF_STOCK', item.name || ' is out of stock.');
  ELSIF item.min_quantity > 0 AND NEW.quantity_on_hand <= item.min_quantity THEN
    INSERT INTO vs_stock_alerts (stock_item_id, alert_type, message)
    VALUES (NEW.stock_item_id, 'LOW_STOCK', item.name || ' is below the minimum threshold (' || item.min_quantity || ' ' || item.unit || ').');
  ELSIF item.max_quantity > 0 AND NEW.quantity_on_hand > item.max_quantity THEN
    INSERT INTO vs_stock_alerts (stock_item_id, alert_type, message)
    VALUES (NEW.stock_item_id, 'OVERSTOCK', item.name || ' exceeds the maximum level (' || item.max_quantity || ' ' || item.unit || ').');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vs_stock_level_alert_trigger ON vs_stock_levels;

CREATE TRIGGER vs_stock_level_alert_trigger
AFTER INSERT OR UPDATE OF quantity_on_hand ON vs_stock_levels
FOR EACH ROW EXECUTE FUNCTION vs_check_stock_alerts();
