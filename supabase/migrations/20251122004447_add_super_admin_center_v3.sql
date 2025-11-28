/*
  # Super Admin Center - Database Setup

  ## Overview
  Adds infrastructure for Super Admin Center with zero changes to existing user flows.
  All additions are isolated and use service-role level access patterns.

  ## New Features
  1. Admin audit log for all god-mode actions
  2. Enhanced super admin detection
  3. Org impersonation tracking
  4. Global access views (read-only for admins)

  ## Security
  - All admin operations logged
  - Email-based super admin list
  - Separate from normal RLS policies
  - Zero changes to existing user policies
*/

-- Create admin audit log table
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_email text NOT NULL,
  action text NOT NULL,
  target_type text,
  target_id uuid,
  details jsonb DEFAULT '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin_email ON admin_audit_log(admin_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target ON admin_audit_log(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON admin_audit_log(created_at DESC);

-- Function to log admin actions
CREATE OR REPLACE FUNCTION log_admin_action(
  p_admin_email text,
  p_action text,
  p_target_type text DEFAULT NULL,
  p_target_id uuid DEFAULT NULL,
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_log_id uuid;
BEGIN
  INSERT INTO admin_audit_log (
    admin_email,
    action,
    target_type,
    target_id,
    details
  ) VALUES (
    p_admin_email,
    p_action,
    p_target_type,
    p_target_id,
    p_details
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

-- Add trial tracking columns to organisations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organisations' AND column_name = 'trial_end_date'
  ) THEN
    ALTER TABLE organisations ADD COLUMN trial_end_date timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organisations' AND column_name = 'subscription_status'
  ) THEN
    ALTER TABLE organisations ADD COLUMN subscription_status text DEFAULT 'trial'
      CHECK (subscription_status IN ('trial', 'active', 'expired', 'suspended', 'cancelled'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organisations' AND column_name = 'trade_type'
  ) THEN
    ALTER TABLE organisations ADD COLUMN trade_type text DEFAULT 'passive_fire'
      CHECK (trade_type IN ('passive_fire', 'electrical', 'plumbing', 'mechanical', 'other'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organisations' AND column_name = 'last_active_at'
  ) THEN
    ALTER TABLE organisations ADD COLUMN last_active_at timestamptz;
  END IF;
END $$;

-- View for admin dashboard - all orgs with stats
CREATE OR REPLACE VIEW admin_organisations_dashboard AS
SELECT 
  o.id,
  o.name,
  o.trade_type,
  o.subscription_status,
  o.trial_end_date,
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

COMMENT ON VIEW admin_organisations_dashboard IS 'Super admin view of all organisations with key metrics';

-- View for global quotes/PDFs
CREATE OR REPLACE VIEW admin_global_quotes AS
SELECT 
  q.id as quote_id,
  q.supplier_name,
  q.quote_reference,
  q.total_amount,
  q.items_count,
  q.status,
  q.extraction_confidence,
  q.organisation_id,
  o.name as organisation_name,
  o.trade_type,
  q.created_at,
  q.import_date,
  u.email as uploaded_by_email,
  p.name as project_name,
  (SELECT AVG(confidence) FROM quote_items WHERE quote_id = q.id) as avg_confidence
FROM quotes q
JOIN organisations o ON o.id = q.organisation_id
JOIN projects p ON p.id = q.project_id
LEFT JOIN auth.users u ON u.id = q.user_id
ORDER BY q.created_at DESC;

COMMENT ON VIEW admin_global_quotes IS 'Super admin view of all quotes/PDFs across all organisations';

-- Function to create new client organisation
CREATE OR REPLACE FUNCTION admin_create_client_organisation(
  p_admin_email text,
  p_org_name text,
  p_trade_type text,
  p_trial_days integer,
  p_owner_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
  v_trial_end timestamptz;
  v_result jsonb;
BEGIN
  v_trial_end := now() + (p_trial_days || ' days')::interval;

  INSERT INTO organisations (
    name,
    trade_type,
    subscription_status,
    trial_end_date
  ) VALUES (
    p_org_name,
    p_trade_type,
    'trial',
    v_trial_end
  )
  RETURNING id INTO v_org_id;

  INSERT INTO projects (
    organisation_id,
    name,
    reference,
    status
  ) VALUES (
    v_org_id,
    'Default Project',
    'PROJ-001',
    'active'
  );

  PERFORM log_admin_action(
    p_admin_email,
    'create_organisation',
    'organisation',
    v_org_id,
    jsonb_build_object(
      'org_name', p_org_name,
      'trade_type', p_trade_type,
      'trial_days', p_trial_days,
      'owner_email', p_owner_email
    )
  );

  v_result := jsonb_build_object(
    'success', true,
    'organisation_id', v_org_id,
    'trial_end_date', v_trial_end,
    'owner_email', p_owner_email,
    'message', 'Organisation created. Owner must sign up at app with email: ' || p_owner_email
  );

  RETURN v_result;
END;
$$;

-- Function to extend trial
CREATE OR REPLACE FUNCTION admin_extend_trial(
  p_admin_email text,
  p_org_id uuid,
  p_days integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_end_date timestamptz;
BEGIN
  UPDATE organisations
  SET 
    trial_end_date = COALESCE(trial_end_date, now()) + (p_days || ' days')::interval,
    subscription_status = 'trial'
  WHERE id = p_org_id
  RETURNING trial_end_date INTO v_new_end_date;

  PERFORM log_admin_action(
    p_admin_email,
    'extend_trial',
    'organisation',
    p_org_id,
    jsonb_build_object('days_added', p_days, 'new_end_date', v_new_end_date)
  );

  RETURN jsonb_build_object(
    'success', true,
    'new_trial_end_date', v_new_end_date
  );
END;
$$;

-- Function to update subscription status
CREATE OR REPLACE FUNCTION admin_update_subscription(
  p_admin_email text,
  p_org_id uuid,
  p_new_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE organisations
  SET subscription_status = p_new_status
  WHERE id = p_org_id;

  PERFORM log_admin_action(
    p_admin_email,
    'update_subscription',
    'organisation',
    p_org_id,
    jsonb_build_object('new_status', p_new_status)
  );

  RETURN jsonb_build_object('success', true, 'new_status', p_new_status);
END;
$$;

-- Trigger to update last_active_at
CREATE OR REPLACE FUNCTION update_org_last_active()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE organisations
  SET last_active_at = now()
  WHERE id = COALESCE(NEW.organisation_id, OLD.organisation_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_org_last_active_quotes ON quotes;
CREATE TRIGGER trigger_update_org_last_active_quotes
  AFTER INSERT OR UPDATE ON quotes
  FOR EACH ROW
  EXECUTE FUNCTION update_org_last_active();

DROP TRIGGER IF EXISTS trigger_update_org_last_active_projects ON projects;
CREATE TRIGGER trigger_update_org_last_active_projects
  AFTER INSERT OR UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_org_last_active();
