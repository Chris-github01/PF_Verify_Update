/*
  # Fix pricing tier constraint

  ## Summary
  Updates the organisations pricing_tier check constraint to include all valid tier values.

  1. Changes
    - Drop old constraint that only allowed 'standard', 'professional', 'enterprise'
    - Update existing 'standard' values to 'starter' for consistency
    - Add new constraint allowing 'trial', 'starter', 'professional', 'enterprise'
    
  2. Security
    - Constraint ensures data integrity for pricing tiers
    - Matches values used in trial account system and admin functions

  3. Notes
    - 'starter' replaces 'standard' to align with pricing plans
    - 'trial' added for trial accounts
*/

-- First, drop the old constraint so we can update data
ALTER TABLE organisations
DROP CONSTRAINT IF EXISTS organisations_pricing_tier_check;

-- Now update any existing 'standard' values to 'starter'
UPDATE organisations
SET pricing_tier = 'starter'
WHERE pricing_tier = 'standard';

-- Add the new constraint with correct values
ALTER TABLE organisations
ADD CONSTRAINT organisations_pricing_tier_check
CHECK (pricing_tier IN ('trial', 'starter', 'professional', 'enterprise'));

-- Add helpful comment
COMMENT ON CONSTRAINT organisations_pricing_tier_check ON organisations IS 'Ensures pricing_tier is one of: trial, starter, professional, enterprise';
