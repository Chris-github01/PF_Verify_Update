/*
  # Add Retention Method Feature (Flat vs Sliding Scale)
  
  1. New Columns
    - `projects.retention_method` (text)
      - Values: 'flat' | 'sliding_scale'
      - Default: 'flat' (backward compatible)
    - `projects.retention_tiers` (jsonb)
      - Stores threshold bands for sliding scale
      - Format: [{ threshold_nzd: number, rate_percent: number }]
      - NULL when using flat method
  
  2. Changes
    - Adds retention method selection layer
    - Preserves all existing retention_percentage logic
    - Zero breaking changes - all existing projects default to flat
  
  3. Security
    - No RLS changes needed (projects table already secured)
    - Field validation in application layer
  
  4. Notes
    - Feature flag: retention_method_flat_vs_sliding_scale_v1
    - Sliding scale uses marginal calculation (not retrospective)
    - Threshold table must be ascending order
*/

-- Add retention method column with backward-compatible default
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'retention_method'
  ) THEN
    ALTER TABLE projects ADD COLUMN retention_method text DEFAULT 'flat' NOT NULL;
    
    -- Add constraint to ensure valid values
    ALTER TABLE projects ADD CONSTRAINT check_retention_method 
      CHECK (retention_method IN ('flat', 'sliding_scale'));
  END IF;
END $$;

-- Add retention tiers column for sliding scale configuration
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'retention_tiers'
  ) THEN
    ALTER TABLE projects ADD COLUMN retention_tiers jsonb DEFAULT NULL;
  END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN projects.retention_method IS 
  'Retention calculation method: flat (single rate) or sliding_scale (value thresholds)';

COMMENT ON COLUMN projects.retention_tiers IS 
  'Sliding scale thresholds as array: [{ threshold_nzd: number, rate_percent: number }]. NULL for flat method.';
