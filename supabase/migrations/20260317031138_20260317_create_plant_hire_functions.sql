/*
  # Plant Hire Module — SQL Functions (Phase 2 of 2)

  Creates the 5 core RPCs for claim period management and charge generation.

  Functions:
  1. vs_create_plant_claim_period()      — Create/return claim period by end date
  2. vs_record_plant_movement()          — Record event + auto-create fixed charges
  3. vs_generate_time_hire_charges()     — Idempotent time-based charge generator
  4. vs_generate_plant_claim_lines()     — Assemble claim snapshot
  5. vs_finalize_plant_claim_period()    — Lock period + mark charges claimed
*/

-- ============================================================
-- 1. vs_create_plant_claim_period
-- ============================================================
CREATE OR REPLACE FUNCTION vs_create_plant_claim_period(
  p_org_id          uuid,
  p_period_end_date date
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_end_day      integer;
  v_period_start date;
  v_period_end   date;
  v_period_name  text;
  v_existing_id  uuid;
  v_new_id       uuid;
BEGIN
  SELECT COALESCE(claim_period_end_day, 25)
  INTO v_end_day
  FROM vs_plant_settings
  WHERE organisation_id = p_org_id;

  IF v_end_day IS NULL THEN v_end_day := 25; END IF;

  -- Normalise period_end to the configured end day of the given month
  -- e.g. if end_day=25 and month is April → 25 April
  v_period_end := (date_trunc('month', p_period_end_date) + (v_end_day - 1) * interval '1 day')::date;

  -- period_start = end_day+1 of previous month
  -- e.g. 25 Apr → start = 26 Mar
  v_period_start := (date_trunc('month', p_period_end_date - interval '1 month') + (v_end_day) * interval '1 day')::date;

  v_period_name := to_char(v_period_start, 'DD Mon YYYY') || ' – ' || to_char(v_period_end, 'DD Mon YYYY');

  SELECT id INTO v_existing_id
  FROM vs_plant_claim_periods
  WHERE organisation_id = p_org_id
    AND period_start = v_period_start
    AND period_end   = v_period_end;

  IF v_existing_id IS NOT NULL THEN RETURN v_existing_id; END IF;

  INSERT INTO vs_plant_claim_periods (
    organisation_id, period_name, period_start, period_end, period_end_day, status
  )
  VALUES (
    p_org_id, v_period_name, v_period_start, v_period_end, v_end_day, 'OPEN'
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

-- ============================================================
-- 2. vs_record_plant_movement
-- ============================================================
CREATE OR REPLACE FUNCTION vs_record_plant_movement(
  p_org_id        uuid,
  p_booking_id    uuid,
  p_asset_id      uuid,
  p_event_type    text,
  p_event_date    date,
  p_from_location uuid DEFAULT NULL,
  p_to_location   uuid DEFAULT NULL,
  p_notes         text DEFAULT NULL,
  p_created_by    uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_movement_id     uuid;
  v_rate_card       vs_plant_rate_cards%ROWTYPE;
  v_already_charged integer;
BEGIN
  INSERT INTO vs_plant_movements (
    organisation_id, booking_id, asset_id, event_type, event_date,
    from_location_id, to_location_id, notes, created_by
  )
  VALUES (
    p_org_id, p_booking_id, p_asset_id, p_event_type, p_event_date,
    p_from_location, p_to_location, p_notes, p_created_by
  )
  RETURNING id INTO v_movement_id;

  -- Update booking + asset status
  IF p_event_type = 'DELIVERED_TO_SITE' THEN
    UPDATE vs_plant_bookings SET status = 'ON_HIRE', updated_at = now()
    WHERE id = p_booking_id AND status NOT IN ('CLOSED','CANCELLED');
    UPDATE vs_plant_assets SET current_status = 'ON_HIRE', updated_at = now()
    WHERE id = p_asset_id;

  ELSIF p_event_type = 'COLLECTED_FROM_SITE' THEN
    UPDATE vs_plant_bookings
    SET status = 'OFF_HIRED', actual_off_hire_date = p_event_date, updated_at = now()
    WHERE id = p_booking_id AND status NOT IN ('CLOSED','CANCELLED');
    UPDATE vs_plant_assets SET current_status = 'AVAILABLE', updated_at = now()
    WHERE id = p_asset_id;

  ELSIF p_event_type = 'RETURNED_TO_YARD' THEN
    UPDATE vs_plant_bookings SET status = 'CLOSED', updated_at = now()
    WHERE id = p_booking_id AND status NOT IN ('CLOSED','CANCELLED');
    UPDATE vs_plant_assets SET current_status = 'AVAILABLE', updated_at = now()
    WHERE id = p_asset_id;

  ELSIF p_event_type = 'CANCELLED' THEN
    UPDATE vs_plant_bookings SET status = 'CANCELLED', updated_at = now()
    WHERE id = p_booking_id;
    UPDATE vs_plant_assets SET current_status = 'AVAILABLE', updated_at = now()
    WHERE id = p_asset_id;
  END IF;

  -- Fetch active rate card
  SELECT * INTO v_rate_card
  FROM vs_plant_rate_cards
  WHERE asset_id = p_asset_id AND active = true
  ORDER BY COALESCE(effective_from, '1900-01-01') DESC
  LIMIT 1;

  -- Auto ON_HIRE_FIXED — deduplicated: only one per booking
  IF p_event_type = 'DELIVERED_TO_SITE' AND v_rate_card.on_hire_fixed IS NOT NULL THEN
    SELECT COUNT(*) INTO v_already_charged
    FROM vs_plant_charge_events
    WHERE booking_id = p_booking_id AND charge_type = 'ON_HIRE_FIXED';

    IF v_already_charged = 0 THEN
      INSERT INTO vs_plant_charge_events (
        organisation_id, booking_id, asset_id, movement_id,
        charge_type, charge_date, quantity, rate, amount, created_by
      ) VALUES (
        p_org_id, p_booking_id, p_asset_id, v_movement_id,
        'ON_HIRE_FIXED', p_event_date, 1,
        v_rate_card.on_hire_fixed, v_rate_card.on_hire_fixed, p_created_by
      );
    END IF;
  END IF;

  -- Auto OFF_HIRE_FIXED — deduplicated: only one per booking
  IF p_event_type = 'COLLECTED_FROM_SITE' AND v_rate_card.off_hire_fixed IS NOT NULL THEN
    SELECT COUNT(*) INTO v_already_charged
    FROM vs_plant_charge_events
    WHERE booking_id = p_booking_id AND charge_type = 'OFF_HIRE_FIXED';

    IF v_already_charged = 0 THEN
      INSERT INTO vs_plant_charge_events (
        organisation_id, booking_id, asset_id, movement_id,
        charge_type, charge_date, quantity, rate, amount, created_by
      ) VALUES (
        p_org_id, p_booking_id, p_asset_id, v_movement_id,
        'OFF_HIRE_FIXED', p_event_date, 1,
        v_rate_card.off_hire_fixed, v_rate_card.off_hire_fixed, p_created_by
      );
    END IF;
  END IF;

  RETURN v_movement_id;
END;
$$;

-- ============================================================
-- 3. vs_generate_time_hire_charges (idempotent)
-- ============================================================
CREATE OR REPLACE FUNCTION vs_generate_time_hire_charges(
  p_claim_period_id uuid
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_period        vs_plant_claim_periods%ROWTYPE;
  v_booking       RECORD;
  v_rate_card     vs_plant_rate_cards%ROWTYPE;
  v_overlap_start date;
  v_overlap_end   date;
  v_overlap_days  integer;
  v_quantity      numeric(12,4);
  v_rate          numeric(12,2);
  v_amount        numeric(12,2);
  v_exists        integer;
  v_count         integer := 0;
  v_days_in_month numeric;
BEGIN
  SELECT * INTO v_period FROM vs_plant_claim_periods WHERE id = p_claim_period_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Claim period not found: %', p_claim_period_id; END IF;
  IF v_period.status = 'FINALIZED' THEN RAISE EXCEPTION 'Cannot regenerate a finalized period'; END IF;

  FOR v_booking IN
    SELECT b.*
    FROM vs_plant_bookings b
    JOIN vs_plant_assets a ON a.id = b.asset_id
    WHERE a.organisation_id = v_period.organisation_id
      AND b.status IN ('BOOKED','ON_HIRE','OFF_HIRED','CLOSED')
      AND b.hire_start_date <= v_period.period_end
      AND COALESCE(b.actual_off_hire_date, b.planned_end_date, v_period.period_end + 1) >= v_period.period_start
  LOOP
    v_overlap_start := GREATEST(v_booking.hire_start_date, v_period.period_start);
    v_overlap_end   := LEAST(
      COALESCE(v_booking.actual_off_hire_date, v_booking.planned_end_date, v_period.period_end),
      v_period.period_end
    );
    IF v_overlap_end < v_overlap_start THEN CONTINUE; END IF;

    v_overlap_days := (v_overlap_end - v_overlap_start) + 1;

    SELECT * INTO v_rate_card
    FROM vs_plant_rate_cards
    WHERE asset_id = v_booking.asset_id AND active = true
    ORDER BY COALESCE(effective_from, '1900-01-01') DESC
    LIMIT 1;
    IF NOT FOUND THEN CONTINUE; END IF;

    -- Days in period month for MONTH pro-rata
    v_days_in_month := EXTRACT(DAY FROM
      date_trunc('month', v_period.period_end) + interval '1 month' -
      date_trunc('month', v_period.period_end)
    );

    CASE v_booking.charging_basis
      WHEN 'DAY'   THEN v_quantity := v_overlap_days;                             v_rate := v_rate_card.daily_rate;
      WHEN 'WEEK'  THEN v_quantity := ROUND(v_overlap_days::numeric / 7, 4);      v_rate := v_rate_card.weekly_rate;
      WHEN 'MONTH' THEN v_quantity := ROUND(v_overlap_days::numeric / v_days_in_month, 4); v_rate := v_rate_card.monthly_rate;
      WHEN 'HOUR'  THEN v_quantity := v_overlap_days * 8;                         v_rate := v_rate_card.hourly_rate;
      ELSE              v_quantity := v_overlap_days;                             v_rate := v_rate_card.daily_rate;
    END CASE;

    IF v_rate IS NULL OR v_rate = 0 THEN CONTINUE; END IF;
    v_amount := ROUND(v_quantity * v_rate, 2);

    SELECT COUNT(*) INTO v_exists
    FROM vs_plant_charge_events
    WHERE booking_id   = v_booking.id
      AND charge_type  = 'TIME_HIRE'
      AND period_start = v_period.period_start
      AND period_end   = v_period.period_end;

    IF v_exists = 0 THEN
      INSERT INTO vs_plant_charge_events (
        organisation_id, booking_id, asset_id,
        charge_type, charge_basis, charge_date,
        period_start, period_end, quantity, rate, amount
      ) VALUES (
        v_period.organisation_id, v_booking.id, v_booking.asset_id,
        'TIME_HIRE', v_booking.charging_basis, v_period.period_end,
        v_period.period_start, v_period.period_end,
        v_quantity, v_rate, v_amount
      );
      v_count := v_count + 1;
    ELSE
      UPDATE vs_plant_charge_events
      SET quantity = v_quantity, rate = v_rate, amount = v_amount,
          charge_basis = v_booking.charging_basis
      WHERE booking_id   = v_booking.id
        AND charge_type  = 'TIME_HIRE'
        AND period_start = v_period.period_start
        AND period_end   = v_period.period_end
        AND is_claimed   = false;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ============================================================
-- 4. vs_generate_plant_claim_lines
-- ============================================================
CREATE OR REPLACE FUNCTION vs_generate_plant_claim_lines(
  p_claim_period_id uuid
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_period  vs_plant_claim_periods%ROWTYPE;
  v_charge  RECORD;
  v_asset   vs_plant_assets%ROWTYPE;
  v_booking vs_plant_bookings%ROWTYPE;
  v_count   integer := 0;
BEGIN
  SELECT * INTO v_period FROM vs_plant_claim_periods WHERE id = p_claim_period_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Claim period not found: %', p_claim_period_id; END IF;
  IF v_period.status = 'FINALIZED' THEN RAISE EXCEPTION 'Period is already finalized'; END IF;

  DELETE FROM vs_plant_claim_lines WHERE claim_period_id = p_claim_period_id;

  FOR v_charge IN
    SELECT ce.*
    FROM vs_plant_charge_events ce
    WHERE ce.organisation_id = v_period.organisation_id
      AND (
        (ce.charge_type IN ('ON_HIRE_FIXED','OFF_HIRE_FIXED')
          AND ce.charge_date BETWEEN v_period.period_start AND v_period.period_end)
        OR
        (ce.charge_type = 'TIME_HIRE'
          AND ce.period_start = v_period.period_start
          AND ce.period_end   = v_period.period_end)
      )
    ORDER BY ce.booking_id, ce.charge_type, ce.charge_date
  LOOP
    SELECT * INTO v_asset   FROM vs_plant_assets   WHERE id = v_charge.asset_id;
    SELECT * INTO v_booking FROM vs_plant_bookings WHERE id = v_charge.booking_id;

    INSERT INTO vs_plant_claim_lines (
      organisation_id, claim_period_id, booking_id, asset_id,
      charge_event_id, project_id, line_type, description,
      quantity, rate, amount
    ) VALUES (
      v_period.organisation_id, p_claim_period_id,
      v_charge.booking_id, v_charge.asset_id,
      v_charge.id, v_booking.project_id,
      v_charge.charge_type,
      CASE v_charge.charge_type
        WHEN 'ON_HIRE_FIXED'  THEN v_asset.asset_name || ' — On-Hire Charge'
        WHEN 'OFF_HIRE_FIXED' THEN v_asset.asset_name || ' — Off-Hire Charge'
        WHEN 'TIME_HIRE'      THEN v_asset.asset_name || ' — ' ||
          v_charge.quantity::text || ' ' || LOWER(COALESCE(v_charge.charge_basis,'day')) || '(s) hire'
      END,
      v_charge.quantity, v_charge.rate, v_charge.amount
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ============================================================
-- 5. vs_finalize_plant_claim_period
-- ============================================================
CREATE OR REPLACE FUNCTION vs_finalize_plant_claim_period(
  p_claim_period_id uuid
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_period vs_plant_claim_periods%ROWTYPE;
BEGIN
  SELECT * INTO v_period FROM vs_plant_claim_periods WHERE id = p_claim_period_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Claim period not found: %', p_claim_period_id; END IF;
  IF v_period.status = 'FINALIZED' THEN RETURN false; END IF;

  UPDATE vs_plant_charge_events
  SET is_claimed = true, claimed_in_period_id = p_claim_period_id
  WHERE id IN (
    SELECT DISTINCT charge_event_id
    FROM vs_plant_claim_lines
    WHERE claim_period_id = p_claim_period_id AND charge_event_id IS NOT NULL
  );

  UPDATE vs_plant_claim_periods SET status = 'FINALIZED' WHERE id = p_claim_period_id;
  RETURN true;
END;
$$;
