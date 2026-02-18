/*
  # Add Claim Tracking Columns to Commercial Baseline Items

  1. Changes
    - Add `claimed_amount` column to track current period claim amount
    - Add `total_certified` column to track cumulative certified amounts
    - Add `last_claim_date` to track when last claim was made
    - Add `claim_history` JSONB column to store historical claim data

  2. Purpose
    - Enable Base Tracker import functionality to update claim progress
    - Support Commercial Control Dashboard reporting
    - Track certification progress against baseline
*/

-- Add claim tracking columns
ALTER TABLE commercial_baseline_items 
  ADD COLUMN IF NOT EXISTS claimed_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_certified numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_claim_date timestamptz,
  ADD COLUMN IF NOT EXISTS claim_history jsonb DEFAULT '[]'::jsonb;

-- Add helpful comment
COMMENT ON COLUMN commercial_baseline_items.claimed_amount IS 'Amount claimed in current period';
COMMENT ON COLUMN commercial_baseline_items.total_certified IS 'Cumulative total of all certified claims to date';
COMMENT ON COLUMN commercial_baseline_items.last_claim_date IS 'Date of most recent claim';
COMMENT ON COLUMN commercial_baseline_items.claim_history IS 'Historical record of all claims as JSON array';
