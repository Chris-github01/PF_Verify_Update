/*
  # Add Missing Organisations Columns for Admin Dashboard

  1. Changes
    - Add trade_type column (primary trade category)
    - Add pricing_tier column (standard, professional, enterprise)
    - Add trial_end_date column (when trial expires)
    - Add monthly_quote_limit column (quota for quotes)
    - Add quotes_used_this_month column (current usage)
    - Add last_active_at column (last activity timestamp)

  2. Notes
    - Sets sensible defaults for existing organisations
    - trade_type will be derived from licensed_trades array
    - Organizations with demo accounts get trial status
*/

-- Add missing columns to organisations table
ALTER TABLE organisations 
  ADD COLUMN IF NOT EXISTS trade_type text DEFAULT 'passive_fire',
  ADD COLUMN IF NOT EXISTS pricing_tier text DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS trial_end_date timestamptz,
  ADD COLUMN IF NOT EXISTS monthly_quote_limit integer DEFAULT 100,
  ADD COLUMN IF NOT EXISTS quotes_used_this_month integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_active_at timestamptz DEFAULT now();

-- Set trade_type from licensed_trades for existing records
UPDATE organisations
SET trade_type = COALESCE(licensed_trades[1], 'passive_fire')
WHERE trade_type = 'passive_fire' OR trade_type IS NULL;

-- Set trial end date for demo organizations (30 days from creation)
UPDATE organisations
SET trial_end_date = created_at + interval '30 days'
WHERE is_demo = true AND trial_end_date IS NULL;

-- Add check constraint for pricing_tier
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'organisations_pricing_tier_check'
  ) THEN
    ALTER TABLE organisations
    ADD CONSTRAINT organisations_pricing_tier_check
    CHECK (pricing_tier IN ('standard', 'professional', 'enterprise'));
  END IF;
END $$;

-- Add check constraint for subscription_status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'organisations_subscription_status_check'
  ) THEN
    ALTER TABLE organisations
    ADD CONSTRAINT organisations_subscription_status_check
    CHECK (subscription_status IN ('trial', 'active', 'expired', 'suspended', 'cancelled'));
  END IF;
END $$;

-- Create index for filtering by subscription status
CREATE INDEX IF NOT EXISTS idx_organisations_subscription_status 
  ON organisations(subscription_status);

-- Create index for filtering by trial end date
CREATE INDEX IF NOT EXISTS idx_organisations_trial_end_date 
  ON organisations(trial_end_date) WHERE trial_end_date IS NOT NULL;

COMMENT ON COLUMN organisations.trade_type IS 'Primary trade category for this organisation';
COMMENT ON COLUMN organisations.pricing_tier IS 'Subscription pricing tier: standard, professional, or enterprise';
COMMENT ON COLUMN organisations.trial_end_date IS 'Date when trial period ends (NULL if not on trial)';
COMMENT ON COLUMN organisations.monthly_quote_limit IS 'Maximum number of quotes allowed per month';
COMMENT ON COLUMN organisations.quotes_used_this_month IS 'Number of quotes used in current billing period';
COMMENT ON COLUMN organisations.last_active_at IS 'Timestamp of last activity in this organisation';
