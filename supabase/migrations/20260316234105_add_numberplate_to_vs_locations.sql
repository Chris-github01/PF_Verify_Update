/*
  # Add numberplate column to vs_locations

  ## Changes
  - Adds `numberplate` (text, nullable) to vs_locations
  - Used for Van-type locations to store the vehicle registration plate
  - Only relevant when type = 'van'
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vs_locations' AND column_name = 'numberplate'
  ) THEN
    ALTER TABLE vs_locations ADD COLUMN numberplate text DEFAULT NULL;
  END IF;
END $$;
