/*
  # Fix Function Search Path Mutable and Security Definer Views

  1. Fix update_updated_at_column trigger function - add SET search_path
  2. Fix update_contract_workflow_updated_at trigger function - add SET search_path  
  3. Recreate security_dashboard view as SECURITY INVOKER (not SECURITY DEFINER)
  4. Recreate stock_search_view as SECURITY INVOKER (not SECURITY DEFINER)
*/

-- Fix update_updated_at_column function search path
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Fix update_contract_workflow_updated_at function search path
CREATE OR REPLACE FUNCTION public.update_contract_workflow_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Recreate security_dashboard view without SECURITY DEFINER
-- (standard views default to SECURITY INVOKER - caller's permissions apply)
DROP VIEW IF EXISTS public.security_dashboard;
CREATE VIEW public.security_dashboard
WITH (security_invoker = true)
AS
SELECT
  (SELECT count(*) FROM security_audit_log WHERE created_at > (now() - interval '24 hours')) AS events_24h,
  (SELECT count(*) FROM security_audit_log WHERE severity = 'critical' AND created_at > (now() - interval '24 hours')) AS critical_events_24h,
  (SELECT count(*) FROM security_audit_log WHERE severity = 'error' AND created_at > (now() - interval '24 hours')) AS error_events_24h,
  (SELECT count(*) FROM platform_admins WHERE is_active = true) AS active_admin_count,
  (SELECT count(*) FROM security_audit_log WHERE event_type = 'admin_action' AND created_at > (now() - interval '24 hours')) AS admin_actions_24h,
  (SELECT count(*) FROM organisations) AS total_organisations,
  (SELECT count(*) FROM organisation_members WHERE status = 'active') AS active_members,
  (SELECT count(*) FROM rate_limit_log WHERE blocked = true AND created_at > (now() - interval '1 hour')) AS blocked_requests_1h,
  (SELECT created_at FROM security_audit_log ORDER BY created_at DESC LIMIT 1) AS last_security_event;

-- Recreate stock_search_view without SECURITY DEFINER
DROP VIEW IF EXISTS public.stock_search_view;
CREATE VIEW public.stock_search_view
WITH (security_invoker = true)
AS
SELECT
  m.id AS material_id,
  m.name AS material_name,
  m.type AS material_type,
  m.unit,
  m.sku,
  m.organisation_id,
  s.id AS supplier_id,
  s.name AS supplier_name,
  l.id AS location_id,
  l.name AS location_name,
  l.type AS location_type,
  COALESCE(b.quantity, 0::numeric) AS quantity
FROM vs_materials m
LEFT JOIN vs_suppliers s ON s.id = m.supplier_id
LEFT JOIN vs_stock_balances b ON b.material_id = m.id
LEFT JOIN vs_locations l ON l.id = b.location_id
WHERE m.active = true;
