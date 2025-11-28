/*
  # Multi-Trade Licensing System

  ## Overview
  Implements per-trade licensing model where each trade is a separate revenue line.
  Clients can be licensed for multiple trades simultaneously.

  ## Business Model
  - PassiveFire Verify+ = $299/month
  - Electrical Verify+ = $349/month
  - Plumbing Verify+ = $329/month
  - Mechanical Verify+ = $399/month
  - Bundle discounts: 2 trades = 15% off, 3 trades = 25% off, All = 35% off

  ## Migration Strategy
  - Additive only - zero breaking changes
  - Existing orgs auto-licensed for their current trade_type
*/

-- Add licensed_trades array column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organisations' AND column_name = 'licensed_trades'
  ) THEN
    ALTER TABLE organisations ADD COLUMN licensed_trades text[] DEFAULT ARRAY['passive_fire'];
  END IF;
END $$;

-- Backfill licensed_trades based on existing trade_type
UPDATE organisations
SET licensed_trades = ARRAY[COALESCE(trade_type, 'passive_fire')]
WHERE licensed_trades IS NULL OR licensed_trades = '{}' OR cardinality(licensed_trades) = 0;

-- Add per-trade pricing columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organisations' AND column_name = 'pricing_tier'
  ) THEN
    ALTER TABLE organisations ADD COLUMN pricing_tier text DEFAULT 'standard'
      CHECK (pricing_tier IN ('trial', 'standard', 'professional', 'enterprise'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organisations' AND column_name = 'monthly_quote_limit'
  ) THEN
    ALTER TABLE organisations ADD COLUMN monthly_quote_limit integer DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organisations' AND column_name = 'quotes_used_this_month'
  ) THEN
    ALTER TABLE organisations ADD COLUMN quotes_used_this_month integer DEFAULT 0;
  END IF;
END $$;

-- Add per-trade metadata to projects
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'project_trade'
  ) THEN
    ALTER TABLE projects ADD COLUMN project_trade text DEFAULT 'passive_fire'
      CHECK (project_trade IN ('passive_fire', 'electrical', 'plumbing', 'mechanical', 'other'));
  END IF;
END $$;

-- Backfill project_trade from organisation trade_type
UPDATE projects p
SET project_trade = COALESCE(o.trade_type, 'passive_fire')
FROM organisations o
WHERE p.organisation_id = o.id
AND (p.project_trade IS NULL OR p.project_trade = 'passive_fire');

-- Drop and recreate the view to add new columns
DROP VIEW IF EXISTS admin_organisations_dashboard CASCADE;

CREATE VIEW admin_organisations_dashboard AS
SELECT 
  o.id,
  o.name,
  o.trade_type,
  o.licensed_trades,
  o.subscription_status,
  o.pricing_tier,
  o.trial_end_date,
  o.monthly_quote_limit,
  o.quotes_used_this_month,
  o.last_active_at,
  o.created_at,
  (SELECT COUNT(*) FROM organisation_members WHERE organisation_id = o.id) as member_count,
  (SELECT COUNT(*) FROM projects WHERE organisation_id = o.id) as project_count,
  (SELECT COUNT(*) FROM quotes WHERE organisation_id = o.id) as quote_count,
  (SELECT email FROM organisation_members om 
   JOIN auth.users u ON u.id = om.user_id 
   WHERE om.organisation_id = o.id AND om.role = 'owner' 
   LIMIT 1) as owner_email
FROM organisations o
ORDER BY o.created_at DESC;

COMMENT ON VIEW admin_organisations_dashboard IS 'Super admin view with multi-trade licensing info';

-- Function to add trade license to organisation
CREATE OR REPLACE FUNCTION admin_add_trade_license(
  p_admin_email text,
  p_org_id uuid,
  p_trade text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_trades text[];
BEGIN
  SELECT licensed_trades INTO v_current_trades
  FROM organisations
  WHERE id = p_org_id;

  IF NOT (p_trade = ANY(v_current_trades)) THEN
    UPDATE organisations
    SET licensed_trades = array_append(licensed_trades, p_trade)
    WHERE id = p_org_id;

    PERFORM log_admin_action(
      p_admin_email,
      'add_trade_license',
      'organisation',
      p_org_id,
      jsonb_build_object('trade', p_trade)
    );

    RETURN jsonb_build_object(
      'success', true,
      'message', 'Trade license added: ' || p_trade,
      'licensed_trades', array_append(v_current_trades, p_trade)
    );
  ELSE
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Organisation already licensed for ' || p_trade,
      'licensed_trades', v_current_trades
    );
  END IF;
END;
$$;

-- Function to remove trade license
CREATE OR REPLACE FUNCTION admin_remove_trade_license(
  p_admin_email text,
  p_org_id uuid,
  p_trade text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_trades text[];
BEGIN
  SELECT licensed_trades INTO v_current_trades
  FROM organisations
  WHERE id = p_org_id;

  IF p_trade = ANY(v_current_trades) THEN
    UPDATE organisations
    SET licensed_trades = array_remove(licensed_trades, p_trade)
    WHERE id = p_org_id;

    PERFORM log_admin_action(
      p_admin_email,
      'remove_trade_license',
      'organisation',
      p_org_id,
      jsonb_build_object('trade', p_trade)
    );

    RETURN jsonb_build_object(
      'success', true,
      'message', 'Trade license removed: ' || p_trade,
      'licensed_trades', array_remove(v_current_trades, p_trade)
    );
  ELSE
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Organisation not licensed for ' || p_trade,
      'licensed_trades', v_current_trades
    );
  END IF;
END;
$$;

-- Function to check if organisation has trade license
CREATE OR REPLACE FUNCTION has_trade_license(
  p_org_id uuid,
  p_trade text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_licensed_trades text[];
  v_subscription_status text;
BEGIN
  SELECT licensed_trades, subscription_status
  INTO v_licensed_trades, v_subscription_status
  FROM organisations
  WHERE id = p_org_id;

  -- During trial, allow all trades
  IF v_subscription_status = 'trial' THEN
    RETURN true;
  END IF;

  -- For paid/active, check specific trade license
  RETURN p_trade = ANY(v_licensed_trades);
END;
$$;

-- Function to get trade pricing info
CREATE OR REPLACE FUNCTION get_trade_pricing()
RETURNS jsonb
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN jsonb_build_object(
    'trades', jsonb_build_object(
      'passive_fire', jsonb_build_object(
        'name', 'PassiveFire Verify+',
        'description', 'Passive fire protection quote analysis',
        'price_monthly', 299,
        'features', jsonb_build_array(
          'Unlimited quotes',
          'AI-powered extraction',
          'Scope matrix generation',
          'Award reports'
        )
      ),
      'electrical', jsonb_build_object(
        'name', 'Electrical Verify+',
        'description', 'Electrical quote analysis and verification',
        'price_monthly', 349,
        'features', jsonb_build_array(
          'Unlimited quotes',
          'Circuit analysis',
          'Load calculations',
          'Compliance checking'
        )
      ),
      'plumbing', jsonb_build_object(
        'name', 'Plumbing Verify+',
        'description', 'Plumbing and hydraulics quote verification',
        'price_monthly', 329,
        'features', jsonb_build_array(
          'Unlimited quotes',
          'Pipe sizing verification',
          'Fixture schedules',
          'Material takeoffs'
        )
      ),
      'mechanical', jsonb_build_object(
        'name', 'Mechanical Verify+',
        'description', 'HVAC and mechanical quote analysis',
        'price_monthly', 399,
        'features', jsonb_build_array(
          'Unlimited quotes',
          'Equipment schedules',
          'Ductwork analysis',
          'Load calculations'
        )
      )
    ),
    'bundles', jsonb_build_object(
      'dual_trade', jsonb_build_object(
        'name', '2-Trade Bundle',
        'discount_percent', 15,
        'description', 'Any 2 trades - 15% off'
      ),
      'triple_trade', jsonb_build_object(
        'name', '3-Trade Bundle',
        'discount_percent', 25,
        'description', 'Any 3 trades - 25% off'
      ),
      'all_trades', jsonb_build_object(
        'name', 'All-Trades Enterprise',
        'discount_percent', 35,
        'description', 'All trades - 35% off'
      )
    )
  );
END;
$$;

COMMENT ON FUNCTION get_trade_pricing IS 'Returns current pricing for all trade licenses and bundles';
COMMENT ON FUNCTION admin_add_trade_license IS 'Add a trade license to an organisation (admin only)';
COMMENT ON FUNCTION admin_remove_trade_license IS 'Remove a trade license from an organisation (admin only)';
COMMENT ON FUNCTION has_trade_license IS 'Check if organisation has license for specific trade';
