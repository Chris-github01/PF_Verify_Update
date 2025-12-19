/*
  # Add Admin Subscription Management

  ## Summary
  Adds ability for god mode admins to manage client subscription tiers and statuses.

  1. New Functions
    - `admin_update_subscription` - Allows admins to upgrade/downgrade subscriptions
    - Updates subscription_status and pricing_tier
    - Can remove trial status and set to active

  2. Security
    - Function requires platform admin role
    - Validates subscription status values
    - Logs changes for audit trail

  3. Notes
    - Admins can upgrade trials to paid plans
    - Can change between starter, professional, enterprise tiers
    - Can activate expired trials
*/

-- Create function for admins to update subscription
CREATE OR REPLACE FUNCTION admin_update_subscription(
  p_organisation_id uuid,
  p_pricing_tier text,
  p_subscription_status text,
  p_trial_end_date timestamptz DEFAULT NULL,
  p_monthly_quote_limit integer DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_old_status text;
  v_old_tier text;
BEGIN
  -- Check if user is a platform admin
  SELECT is_active_platform_admin(auth.uid()) INTO v_is_admin;
  
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only platform administrators can update subscriptions';
  END IF;

  -- Validate subscription status
  IF p_subscription_status NOT IN ('trial', 'active', 'expired', 'suspended', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid subscription status';
  END IF;

  -- Validate pricing tier
  IF p_pricing_tier NOT IN ('trial', 'starter', 'professional', 'enterprise') THEN
    RAISE EXCEPTION 'Invalid pricing tier';
  END IF;

  -- Get old values for audit
  SELECT subscription_status, pricing_tier
  INTO v_old_status, v_old_tier
  FROM organisations
  WHERE id = p_organisation_id;

  -- Update organisation
  UPDATE organisations
  SET
    pricing_tier = p_pricing_tier,
    subscription_status = p_subscription_status,
    trial_end_date = CASE 
      WHEN p_subscription_status != 'trial' THEN NULL
      ELSE COALESCE(p_trial_end_date, trial_end_date)
    END,
    monthly_quote_limit = COALESCE(p_monthly_quote_limit, monthly_quote_limit),
    updated_at = now()
  WHERE id = p_organisation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organisation not found';
  END IF;

  -- Log the change in admin audit (if table exists)
  BEGIN
    INSERT INTO admin_audit_log (
      admin_user_id,
      action_type,
      target_type,
      target_id,
      details,
      created_at
    ) VALUES (
      auth.uid(),
      'subscription_updated',
      'organisation',
      p_organisation_id,
      json_build_object(
        'old_status', v_old_status,
        'new_status', p_subscription_status,
        'old_tier', v_old_tier,
        'new_tier', p_pricing_tier
      ),
      now()
    );
  EXCEPTION
    WHEN undefined_table THEN
      -- Audit table doesn't exist, skip logging
      NULL;
  END;

  RETURN json_build_object(
    'success', true,
    'organisation_id', p_organisation_id,
    'new_status', p_subscription_status,
    'new_tier', p_pricing_tier
  );
END;
$$;

-- Grant execute permission to authenticated users (function checks admin internally)
GRANT EXECUTE ON FUNCTION admin_update_subscription(uuid, text, text, timestamptz, integer) TO authenticated;

-- Add helpful comment
COMMENT ON FUNCTION admin_update_subscription IS 'Allows platform admins to update organisation subscription tier and status';
