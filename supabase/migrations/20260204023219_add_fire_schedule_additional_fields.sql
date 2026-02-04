/*
  # Add Additional Fields to Fire Schedule Rows

  1. New Columns
    - fire_stop_products: List of acceptable fire stopping products
    - substrate_requirements: Specific requirements for substrate preparation
    - build_up: Details about wall/floor build-up

  These fields capture the additional information found in Beca-style fire schedules
  where each substrate column contains:
  - Fire Stop Reference (already stored in test_reference)
  - Fire Stop Products (NEW - list of approved products)
  - Substrate Requirements (NEW - installation requirements)
*/

-- Add new fields to fire_engineer_schedule_rows
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fire_engineer_schedule_rows' AND column_name = 'fire_stop_products'
  ) THEN
    ALTER TABLE fire_engineer_schedule_rows ADD COLUMN fire_stop_products text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fire_engineer_schedule_rows' AND column_name = 'substrate_requirements'
  ) THEN
    ALTER TABLE fire_engineer_schedule_rows ADD COLUMN substrate_requirements text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fire_engineer_schedule_rows' AND column_name = 'build_up'
  ) THEN
    ALTER TABLE fire_engineer_schedule_rows ADD COLUMN build_up text;
  END IF;
END $$;
