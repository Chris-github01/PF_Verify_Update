/*
  # Plant Hire Module — Table Schema (Phase 1 of 2)

  Creates all 9 tables for the Plant Hire module with RLS and indexes.
  The vs_plant_charge_events.claimed_in_period_id FK is added after
  vs_plant_claim_periods is created.

  Tables:
  1. vs_plant_settings
  2. vs_plant_categories
  3. vs_plant_assets
  4. vs_plant_rate_cards
  5. vs_plant_bookings
  6. vs_plant_movements
  7. vs_plant_claim_periods
  8. vs_plant_charge_events   (FK to claim_periods added here — tables in correct order)
  9. vs_plant_claim_lines
*/

-- ============================================================
-- 1. vs_plant_settings
-- ============================================================
CREATE TABLE IF NOT EXISTS vs_plant_settings (
  id                                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id                       uuid NOT NULL UNIQUE REFERENCES organisations(id) ON DELETE CASCADE,
  claim_period_end_day                  integer NOT NULL DEFAULT 25,
  default_currency                      text NOT NULL DEFAULT 'NZD',
  require_delivery_event_for_on_hire    boolean NOT NULL DEFAULT true,
  require_collection_event_for_off_hire boolean NOT NULL DEFAULT true,
  strict_full_period_only               boolean NOT NULL DEFAULT false,
  created_at                            timestamptz NOT NULL DEFAULT now(),
  created_by                            uuid REFERENCES auth.users(id),
  updated_at                            timestamptz NOT NULL DEFAULT now(),
  updated_by                            uuid REFERENCES auth.users(id),
  CONSTRAINT claim_period_end_day_range CHECK (claim_period_end_day BETWEEN 1 AND 31)
);

ALTER TABLE vs_plant_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select plant settings"
  ON vs_plant_settings FOR SELECT TO authenticated
  USING (is_vs_org_member(organisation_id));

CREATE POLICY "Org members can insert plant settings"
  ON vs_plant_settings FOR INSERT TO authenticated
  WITH CHECK (is_vs_org_member(organisation_id));

CREATE POLICY "Org members can update plant settings"
  ON vs_plant_settings FOR UPDATE TO authenticated
  USING (is_vs_org_member(organisation_id))
  WITH CHECK (is_vs_org_member(organisation_id));

-- ============================================================
-- 2. vs_plant_categories
-- ============================================================
CREATE TABLE IF NOT EXISTS vs_plant_categories (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES auth.users(id),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid REFERENCES auth.users(id)
);

ALTER TABLE vs_plant_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select plant categories"
  ON vs_plant_categories FOR SELECT TO authenticated
  USING (is_vs_org_member(organisation_id));

CREATE POLICY "Org members can insert plant categories"
  ON vs_plant_categories FOR INSERT TO authenticated
  WITH CHECK (is_vs_org_member(organisation_id));

CREATE POLICY "Org members can update plant categories"
  ON vs_plant_categories FOR UPDATE TO authenticated
  USING (is_vs_org_member(organisation_id))
  WITH CHECK (is_vs_org_member(organisation_id));

CREATE POLICY "Org members can delete plant categories"
  ON vs_plant_categories FOR DELETE TO authenticated
  USING (is_vs_org_member(organisation_id));

-- ============================================================
-- 3. vs_plant_assets
-- ============================================================
CREATE TABLE IF NOT EXISTS vs_plant_assets (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id       uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  asset_code            text NOT NULL,
  asset_name            text NOT NULL,
  category_id           uuid REFERENCES vs_plant_categories(id),
  description           text,
  make                  text,
  model                 text,
  serial_number         text,
  registration_number   text,
  size_capacity         text,
  default_hire_unit     text NOT NULL DEFAULT 'DAY' CHECK (default_hire_unit IN ('HOUR','DAY','WEEK','MONTH')),
  purchase_date         date,
  current_location_id   uuid REFERENCES vs_locations(id),
  current_status        text NOT NULL DEFAULT 'AVAILABLE'
    CHECK (current_status IN ('AVAILABLE','ON_HIRE','IN_MAINTENANCE','INACTIVE')),
  notes                 text,
  active                boolean NOT NULL DEFAULT true,
  external_hire_supplier  text,
  rechargeable_to_client  boolean NOT NULL DEFAULT false,
  internal_cost_centre    text,
  operator_required       boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid REFERENCES auth.users(id),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            uuid REFERENCES auth.users(id)
);

ALTER TABLE vs_plant_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select plant assets"
  ON vs_plant_assets FOR SELECT TO authenticated
  USING (is_vs_org_member(organisation_id));

CREATE POLICY "Org members can insert plant assets"
  ON vs_plant_assets FOR INSERT TO authenticated
  WITH CHECK (is_vs_org_member(organisation_id));

CREATE POLICY "Org members can update plant assets"
  ON vs_plant_assets FOR UPDATE TO authenticated
  USING (is_vs_org_member(organisation_id))
  WITH CHECK (is_vs_org_member(organisation_id));

CREATE POLICY "Org members can delete plant assets"
  ON vs_plant_assets FOR DELETE TO authenticated
  USING (is_vs_org_member(organisation_id));

-- ============================================================
-- 4. vs_plant_rate_cards
-- ============================================================
CREATE TABLE IF NOT EXISTS vs_plant_rate_cards (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  asset_id        uuid NOT NULL REFERENCES vs_plant_assets(id) ON DELETE CASCADE,
  currency        text NOT NULL DEFAULT 'NZD',
  on_hire_fixed   numeric(12,2),
  off_hire_fixed  numeric(12,2),
  hourly_rate     numeric(12,2),
  daily_rate      numeric(12,2),
  weekly_rate     numeric(12,2),
  monthly_rate    numeric(12,2),
  active          boolean NOT NULL DEFAULT true,
  effective_from  date,
  effective_to    date,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES auth.users(id),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid REFERENCES auth.users(id)
);

ALTER TABLE vs_plant_rate_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select plant rate cards"
  ON vs_plant_rate_cards FOR SELECT TO authenticated
  USING (is_vs_org_member(organisation_id));

CREATE POLICY "Org members can insert plant rate cards"
  ON vs_plant_rate_cards FOR INSERT TO authenticated
  WITH CHECK (is_vs_org_member(organisation_id));

CREATE POLICY "Org members can update plant rate cards"
  ON vs_plant_rate_cards FOR UPDATE TO authenticated
  USING (is_vs_org_member(organisation_id))
  WITH CHECK (is_vs_org_member(organisation_id));

CREATE POLICY "Org members can delete plant rate cards"
  ON vs_plant_rate_cards FOR DELETE TO authenticated
  USING (is_vs_org_member(organisation_id));

-- ============================================================
-- 5. vs_plant_bookings
-- ============================================================
CREATE TABLE IF NOT EXISTS vs_plant_bookings (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id      uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  asset_id             uuid NOT NULL REFERENCES vs_plant_assets(id),
  project_id           uuid REFERENCES vs_projects(id),
  site_location_id     uuid REFERENCES vs_locations(id),
  booking_reference    text,
  cost_code            text,
  charging_basis       text NOT NULL DEFAULT 'DAY'
    CHECK (charging_basis IN ('HOUR','DAY','WEEK','MONTH')),
  hire_start_date      date NOT NULL,
  planned_end_date     date,
  actual_off_hire_date date,
  delivery_required    boolean NOT NULL DEFAULT false,
  collection_required  boolean NOT NULL DEFAULT false,
  notes                text,
  internal_reference   text,
  status               text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','BOOKED','ON_HIRE','OFF_HIRED','CLOSED','CANCELLED')),
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid REFERENCES auth.users(id),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid REFERENCES auth.users(id)
);

ALTER TABLE vs_plant_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select plant bookings"
  ON vs_plant_bookings FOR SELECT TO authenticated
  USING (is_vs_org_member(organisation_id));

CREATE POLICY "Org members can insert plant bookings"
  ON vs_plant_bookings FOR INSERT TO authenticated
  WITH CHECK (is_vs_org_member(organisation_id));

CREATE POLICY "Org members can update plant bookings"
  ON vs_plant_bookings FOR UPDATE TO authenticated
  USING (is_vs_org_member(organisation_id))
  WITH CHECK (is_vs_org_member(organisation_id));

CREATE POLICY "Org members can delete plant bookings"
  ON vs_plant_bookings FOR DELETE TO authenticated
  USING (is_vs_org_member(organisation_id));

-- ============================================================
-- 6. vs_plant_movements  (immutable event log)
-- ============================================================
CREATE TABLE IF NOT EXISTS vs_plant_movements (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  booking_id       uuid NOT NULL REFERENCES vs_plant_bookings(id),
  asset_id         uuid NOT NULL REFERENCES vs_plant_assets(id),
  event_type       text NOT NULL CHECK (event_type IN (
    'DELIVERED_TO_SITE','COLLECTED_FROM_SITE','RETURNED_TO_YARD',
    'SWAPPED','EXTENDED','CANCELLED'
  )),
  event_date       date NOT NULL,
  from_location_id uuid REFERENCES vs_locations(id),
  to_location_id   uuid REFERENCES vs_locations(id),
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid REFERENCES auth.users(id)
);

ALTER TABLE vs_plant_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select plant movements"
  ON vs_plant_movements FOR SELECT TO authenticated
  USING (is_vs_org_member(organisation_id));

CREATE POLICY "Org members can insert plant movements"
  ON vs_plant_movements FOR INSERT TO authenticated
  WITH CHECK (is_vs_org_member(organisation_id));

-- ============================================================
-- 7. vs_plant_claim_periods  (must exist before charge_events FK)
-- ============================================================
CREATE TABLE IF NOT EXISTS vs_plant_claim_periods (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id   uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  period_name       text NOT NULL,
  period_start      date NOT NULL,
  period_end        date NOT NULL,
  period_end_day    integer NOT NULL,
  status            text NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN','LOCKED','FINALIZED')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES auth.users(id),
  UNIQUE (organisation_id, period_start, period_end)
);

ALTER TABLE vs_plant_claim_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select plant claim periods"
  ON vs_plant_claim_periods FOR SELECT TO authenticated
  USING (is_vs_org_member(organisation_id));

CREATE POLICY "Org members can insert plant claim periods"
  ON vs_plant_claim_periods FOR INSERT TO authenticated
  WITH CHECK (is_vs_org_member(organisation_id));

CREATE POLICY "Org members can update plant claim periods"
  ON vs_plant_claim_periods FOR UPDATE TO authenticated
  USING (is_vs_org_member(organisation_id))
  WITH CHECK (is_vs_org_member(organisation_id));

-- ============================================================
-- 8. vs_plant_charge_events  (anti-duplication ledger)
-- ============================================================
CREATE TABLE IF NOT EXISTS vs_plant_charge_events (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id      uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  booking_id           uuid NOT NULL REFERENCES vs_plant_bookings(id),
  asset_id             uuid NOT NULL REFERENCES vs_plant_assets(id),
  movement_id          uuid REFERENCES vs_plant_movements(id),
  charge_type          text NOT NULL
    CHECK (charge_type IN ('ON_HIRE_FIXED','OFF_HIRE_FIXED','TIME_HIRE')),
  charge_basis         text
    CHECK (charge_basis IN ('HOUR','DAY','WEEK','MONTH')),
  charge_date          date NOT NULL,
  period_start         date,
  period_end           date,
  quantity             numeric(12,4) NOT NULL DEFAULT 1,
  rate                 numeric(12,2),
  amount               numeric(12,2),
  source_reference     text,
  is_claimed           boolean NOT NULL DEFAULT false,
  claimed_in_period_id uuid REFERENCES vs_plant_claim_periods(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid REFERENCES auth.users(id)
);

ALTER TABLE vs_plant_charge_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select plant charge events"
  ON vs_plant_charge_events FOR SELECT TO authenticated
  USING (is_vs_org_member(organisation_id));

CREATE POLICY "Org members can insert plant charge events"
  ON vs_plant_charge_events FOR INSERT TO authenticated
  WITH CHECK (is_vs_org_member(organisation_id));

CREATE POLICY "Org members can update plant charge events"
  ON vs_plant_charge_events FOR UPDATE TO authenticated
  USING (is_vs_org_member(organisation_id))
  WITH CHECK (is_vs_org_member(organisation_id));

-- ============================================================
-- 9. vs_plant_claim_lines  (frozen snapshot per period)
-- ============================================================
CREATE TABLE IF NOT EXISTS vs_plant_claim_lines (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  claim_period_id  uuid NOT NULL REFERENCES vs_plant_claim_periods(id) ON DELETE CASCADE,
  booking_id       uuid REFERENCES vs_plant_bookings(id),
  asset_id         uuid REFERENCES vs_plant_assets(id),
  charge_event_id  uuid REFERENCES vs_plant_charge_events(id),
  project_id       uuid REFERENCES vs_projects(id),
  line_type        text NOT NULL,
  description      text,
  quantity         numeric(12,4) NOT NULL DEFAULT 1,
  rate             numeric(12,2),
  amount           numeric(12,2),
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid REFERENCES auth.users(id)
);

ALTER TABLE vs_plant_claim_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select plant claim lines"
  ON vs_plant_claim_lines FOR SELECT TO authenticated
  USING (is_vs_org_member(organisation_id));

CREATE POLICY "Org members can insert plant claim lines"
  ON vs_plant_claim_lines FOR INSERT TO authenticated
  WITH CHECK (is_vs_org_member(organisation_id));

CREATE POLICY "Org members can delete plant claim lines"
  ON vs_plant_claim_lines FOR DELETE TO authenticated
  USING (is_vs_org_member(organisation_id));

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_vs_plant_assets_org_active  ON vs_plant_assets(organisation_id, active);
CREATE INDEX IF NOT EXISTS idx_vs_plant_assets_category    ON vs_plant_assets(category_id);
CREATE INDEX IF NOT EXISTS idx_vs_plant_assets_status      ON vs_plant_assets(current_status);
CREATE INDEX IF NOT EXISTS idx_vs_plant_rate_cards_asset   ON vs_plant_rate_cards(asset_id);
CREATE INDEX IF NOT EXISTS idx_vs_plant_rate_cards_org     ON vs_plant_rate_cards(organisation_id, active);
CREATE INDEX IF NOT EXISTS idx_vs_plant_bookings_org       ON vs_plant_bookings(organisation_id);
CREATE INDEX IF NOT EXISTS idx_vs_plant_bookings_asset     ON vs_plant_bookings(asset_id);
CREATE INDEX IF NOT EXISTS idx_vs_plant_bookings_project   ON vs_plant_bookings(project_id);
CREATE INDEX IF NOT EXISTS idx_vs_plant_bookings_status    ON vs_plant_bookings(status);
CREATE INDEX IF NOT EXISTS idx_vs_plant_bookings_dates     ON vs_plant_bookings(hire_start_date, actual_off_hire_date);
CREATE INDEX IF NOT EXISTS idx_vs_plant_movements_booking  ON vs_plant_movements(booking_id);
CREATE INDEX IF NOT EXISTS idx_vs_plant_movements_asset    ON vs_plant_movements(asset_id);
CREATE INDEX IF NOT EXISTS idx_vs_plant_movements_org_date ON vs_plant_movements(organisation_id, event_date);
CREATE INDEX IF NOT EXISTS idx_vs_plant_charge_booking     ON vs_plant_charge_events(booking_id);
CREATE INDEX IF NOT EXISTS idx_vs_plant_charge_asset       ON vs_plant_charge_events(asset_id);
CREATE INDEX IF NOT EXISTS idx_vs_plant_charge_period      ON vs_plant_charge_events(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_vs_plant_charge_claimed     ON vs_plant_charge_events(is_claimed);
CREATE INDEX IF NOT EXISTS idx_vs_plant_claim_periods_org  ON vs_plant_claim_periods(organisation_id);
CREATE INDEX IF NOT EXISTS idx_vs_plant_claim_lines_period ON vs_plant_claim_lines(claim_period_id);
CREATE INDEX IF NOT EXISTS idx_vs_plant_claim_lines_asset  ON vs_plant_claim_lines(asset_id);
CREATE INDEX IF NOT EXISTS idx_vs_plant_claim_lines_proj   ON vs_plant_claim_lines(project_id);

-- ============================================================
-- AUTO-UPDATE updated_at TRIGGERS
-- ============================================================
CREATE OR REPLACE FUNCTION vs_plant_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_vs_plant_settings_updated_at
  BEFORE UPDATE ON vs_plant_settings
  FOR EACH ROW EXECUTE FUNCTION vs_plant_set_updated_at();

CREATE TRIGGER trg_vs_plant_categories_updated_at
  BEFORE UPDATE ON vs_plant_categories
  FOR EACH ROW EXECUTE FUNCTION vs_plant_set_updated_at();

CREATE TRIGGER trg_vs_plant_assets_updated_at
  BEFORE UPDATE ON vs_plant_assets
  FOR EACH ROW EXECUTE FUNCTION vs_plant_set_updated_at();

CREATE TRIGGER trg_vs_plant_rate_cards_updated_at
  BEFORE UPDATE ON vs_plant_rate_cards
  FOR EACH ROW EXECUTE FUNCTION vs_plant_set_updated_at();

CREATE TRIGGER trg_vs_plant_bookings_updated_at
  BEFORE UPDATE ON vs_plant_bookings
  FOR EACH ROW EXECUTE FUNCTION vs_plant_set_updated_at();
