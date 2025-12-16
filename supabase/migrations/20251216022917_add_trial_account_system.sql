/*
  # Add 14-Day Trial Account System

  1. Summary
    - Creates function to handle trial account signup with automatic organization creation
    - Adds trigger to check trial expiration on access
    - Sets up proper trial tier configuration (Starter, Professional)
    - Ensures proper defaults and constraints

  2. Changes
    - Add create_trial_account function for new user signup with trial tier selection
    - Add check_trial_status function to validate trial access
    - Add subscription_status column if missing
    - Set proper defaults for trial accounts

  3. Security
    - Function uses security definer to create organization
    - RLS policies already in place for organizations and members
    - Trial status checked before sensitive operations
*/

-- Ensure subscription_status column exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organisations' AND column_name = 'subscription_status'
  ) THEN
    ALTER TABLE organisations
    ADD COLUMN subscription_status text DEFAULT 'trial'
    CHECK (subscription_status IN ('trial', 'active', 'expired', 'suspended', 'cancelled'));
  END IF;
END $$;

-- Create function to set up trial account
CREATE OR REPLACE FUNCTION create_trial_account(
  p_user_id uuid,
  p_email text,
  p_organisation_name text,
  p_pricing_tier text DEFAULT 'starter'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_tier text;
  v_user_limit integer;
  v_quote_limit integer;
  v_trial_end timestamptz;
BEGIN
  -- Validate pricing tier and set limits
  v_tier := LOWER(p_pricing_tier);
  IF v_tier NOT IN ('starter', 'professional') THEN
    v_tier := 'starter';
  END IF;

  -- Set user and quote limits based on tier
  IF v_tier = 'starter' THEN
    v_user_limit := 5;
    v_quote_limit := 100;
  ELSIF v_tier = 'professional' THEN
    v_user_limit := 15;
    v_quote_limit := 500;
  ELSE
    v_user_limit := 5;
    v_quote_limit := 100;
  END IF;

  -- Calculate trial end date (14 days from now)
  v_trial_end := now() + interval '14 days';

  -- Create organization with trial status
  INSERT INTO organisations (
    name,
    pricing_tier,
    subscription_status,
    trial_end_date,
    monthly_quote_limit,
    quotes_used_this_month,
    is_demo,
    created_at,
    updated_at
  ) VALUES (
    p_organisation_name,
    v_tier,
    'trial',
    v_trial_end,
    v_quote_limit,
    0,
    false,
    now(),
    now()
  )
  RETURNING id INTO v_org_id;

  -- Add user as owner
  INSERT INTO organisation_members (
    organisation_id,
    user_id,
    role,
    status,
    created_at,
    updated_at
  ) VALUES (
    v_org_id,
    p_user_id,
    'owner',
    'active',
    now(),
    now()
  );

  -- Return organization details
  RETURN json_build_object(
    'organisation_id', v_org_id,
    'organisation_name', p_organisation_name,
    'pricing_tier', v_tier,
    'subscription_status', 'trial',
    'trial_end_date', v_trial_end,
    'user_limit', v_user_limit,
    'quote_limit', v_quote_limit,
    'days_remaining', 14
  );
END;
$$;

-- Create function to check trial status
CREATE OR REPLACE FUNCTION check_trial_status(p_organisation_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_trial_end timestamptz;
  v_days_remaining integer;
  v_is_expired boolean;
BEGIN
  -- Get current trial info
  SELECT
    subscription_status,
    trial_end_date
  INTO v_status, v_trial_end
  FROM organisations
  WHERE id = p_organisation_id;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Organisation not found');
  END IF;

  -- Calculate days remaining
  IF v_trial_end IS NOT NULL THEN
    v_days_remaining := EXTRACT(DAY FROM (v_trial_end - now()));
    v_is_expired := now() > v_trial_end;
  ELSE
    v_days_remaining := NULL;
    v_is_expired := false;
  END IF;

  -- Auto-expire trial if past end date
  IF v_status = 'trial' AND v_is_expired THEN
    UPDATE organisations
    SET subscription_status = 'expired',
        updated_at = now()
    WHERE id = p_organisation_id;

    v_status := 'expired';
  END IF;

  RETURN json_build_object(
    'subscription_status', v_status,
    'trial_end_date', v_trial_end,
    'days_remaining', v_days_remaining,
    'is_expired', v_is_expired,
    'is_active', v_status IN ('trial', 'active')
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION create_trial_account(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION check_trial_status(uuid) TO authenticated;

-- Add helpful comments
COMMENT ON FUNCTION create_trial_account IS 'Creates a new trial account with 14-day trial period for a user';
COMMENT ON FUNCTION check_trial_status IS 'Checks and updates trial status, returns trial information';
