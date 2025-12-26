/*
  # Add Pricing Basis & Pre-Let Appendix Feature

  1. New Fields
    - `projects.pricing_basis` (enum, nullable) - Pricing basis selection for contract structure
    - `projects.ps_pc_validation_warnings` (jsonb, nullable) - Advisory warnings for PS/PC tagging

  2. Feature Flags
    - `system_config.pricing_basis_prelet_v1` (boolean) - Feature flag for Pricing Basis functionality

  3. Non-Disruptive Design
    - All fields are NULLABLE - no impact on existing data
    - No changes to existing calculations or risk models
    - Additive only - no modifications to existing columns or functions
    - Feature-flagged for safe rollout and rollback

  4. Security
    - RLS policies inherited from existing projects table
    - No new security exposure
*/

-- Create enum type for Pricing Basis options
DO $$ BEGIN
  CREATE TYPE pricing_basis_type AS ENUM (
    'fixed_price_lump_sum',
    'fixed_price_lump_sum_quoted_quantities',
    'fixed_price_lump_sum_remeasurable',
    'schedule_of_rates',
    'hybrid_lump_sum_with_sor',
    'provisional_quantities_fixed_rates',
    'cost_reimbursable'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Add pricing_basis field to projects table (additive, nullable, non-blocking)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'pricing_basis'
  ) THEN
    ALTER TABLE projects ADD COLUMN pricing_basis pricing_basis_type DEFAULT NULL;
  END IF;
END $$;

-- Add PS/PC validation warnings field (advisory only, non-blocking)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'ps_pc_validation_warnings'
  ) THEN
    ALTER TABLE projects ADD COLUMN ps_pc_validation_warnings jsonb DEFAULT NULL;
  END IF;
END $$;

-- Add feature flag to system_config table
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'system_config') THEN
    INSERT INTO system_config (key, value, description, updated_at)
    VALUES (
      'pricing_basis_prelet_v1',
      'false'::jsonb,
      'Enable Pricing Basis selection and Pre-Let Appendix clause injection feature'::text,
      now()
    )
    ON CONFLICT (key) DO NOTHING;
  END IF;
END $$;

-- Add index for pricing_basis queries (performance optimization)
CREATE INDEX IF NOT EXISTS idx_projects_pricing_basis
  ON projects(pricing_basis)
  WHERE pricing_basis IS NOT NULL;

-- Add helpful comment
COMMENT ON COLUMN projects.pricing_basis IS
  'Pricing basis selection for contract structure. Nullable - only set when explicitly selected. No impact on existing calculations or risk models.';

COMMENT ON COLUMN projects.ps_pc_validation_warnings IS
  'Advisory warnings for PS/PC tagging logic. UI-level soft validation only - does not block workflows.';