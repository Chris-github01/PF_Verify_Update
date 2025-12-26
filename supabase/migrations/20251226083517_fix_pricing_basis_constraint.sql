/*
  # Fix Pricing Basis CHECK Constraint

  1. Problem
    - The CHECK constraint on `awarded_pricing_basis` only allowed old values:
      'lump_sum', 're_measurable', 'schedule_based', etc.
    - The UI sends new descriptive values:
      'fixed_price_lump_sum', 'hybrid_lump_sum_with_sor', etc.
    - This caused "Failed to finalise appendix" error

  2. Solution
    - Drop the restrictive CHECK constraint
    - Add new constraint that accepts all UI values
    - Allow flexibility for future pricing models

  3. Allowed Values
    - fixed_price_lump_sum
    - fixed_price_lump_sum_quoted_quantities
    - fixed_price_lump_sum_remeasurable
    - schedule_of_rates
    - hybrid_lump_sum_with_sor
    - provisional_quantities_fixed_rates
    - cost_reimbursable
*/

-- Drop the old restrictive constraint
ALTER TABLE prelet_appendix
DROP CONSTRAINT IF EXISTS prelet_appendix_pricing_basis_check;

-- Add new constraint with all valid UI values
ALTER TABLE prelet_appendix
ADD CONSTRAINT prelet_appendix_pricing_basis_check
CHECK (
  awarded_pricing_basis IS NULL OR
  awarded_pricing_basis IN (
    'fixed_price_lump_sum',
    'fixed_price_lump_sum_quoted_quantities',
    'fixed_price_lump_sum_remeasurable',
    'schedule_of_rates',
    'hybrid_lump_sum_with_sor',
    'provisional_quantities_fixed_rates',
    'cost_reimbursable'
  )
);

-- Also update the pricing_basis column constraint
ALTER TABLE prelet_appendix
DROP CONSTRAINT IF EXISTS prelet_appendix_pricing_basis_column_check;

ALTER TABLE prelet_appendix
ADD CONSTRAINT prelet_appendix_pricing_basis_column_check
CHECK (
  pricing_basis IS NULL OR
  pricing_basis IN (
    'fixed_price_lump_sum',
    'fixed_price_lump_sum_quoted_quantities',
    'fixed_price_lump_sum_remeasurable',
    'schedule_of_rates',
    'hybrid_lump_sum_with_sor',
    'provisional_quantities_fixed_rates',
    'cost_reimbursable'
  )
);

-- Add comments
COMMENT ON CONSTRAINT prelet_appendix_pricing_basis_check ON prelet_appendix IS
'Ensures awarded_pricing_basis matches UI dropdown values for contract pricing models';

COMMENT ON CONSTRAINT prelet_appendix_pricing_basis_column_check ON prelet_appendix IS
'Ensures pricing_basis matches UI dropdown values for contract pricing models';
