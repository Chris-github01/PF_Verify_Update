/*
  # Secure Views Exposing Auth Users (v2)

  1. Problem
    - Views expose auth.users data to authenticated/anon roles
    - SECURITY DEFINER views bypass RLS
    - Need to ensure views respect user permissions

  2. Solution
    - Remove SECURITY DEFINER and use SECURITY INVOKER
    - This makes views respect RLS of underlying tables
    - Views will only show data user has permission to see
    - More secure and respects row-level security

  3. Views Fixed
    - review_queue_with_details
    - admin_global_quotes
    - admin_organisations_dashboard
    - quotes_needing_review

  4. Important Notes
    - Views now inherit permissions from underlying tables
    - RLS on base tables controls access
    - No auth.users data directly exposed
*/

-- Drop existing views
DROP VIEW IF EXISTS review_queue_with_details CASCADE;
DROP VIEW IF EXISTS admin_global_quotes CASCADE;
DROP VIEW IF EXISTS admin_organisations_dashboard CASCADE;
DROP VIEW IF EXISTS quotes_needing_review CASCADE;

-- Recreate review_queue_with_details with SECURITY INVOKER
-- This respects RLS on underlying tables
CREATE VIEW review_queue_with_details
WITH (security_invoker = true) AS
SELECT 
  rq.id,
  rq.quote_item_id,
  rq.quote_id,
  rq.project_id,
  rq.organisation_id,
  rq.issue_type,
  rq.confidence,
  rq.priority,
  rq.status,
  rq.assigned_to,
  rq.assigned_at,
  rq.resolved_by,
  rq.resolved_at,
  rq.created_at,
  rq.updated_at,
  qi.description as item_description,
  qi.quantity,
  qi.unit_price,
  q.supplier_name,
  p.name as project_name
FROM review_queue rq
LEFT JOIN quote_items qi ON qi.id = rq.quote_item_id
LEFT JOIN quotes q ON q.id = rq.quote_id
LEFT JOIN projects p ON p.id = rq.project_id;

-- Recreate quotes_needing_review with SECURITY INVOKER
CREATE VIEW quotes_needing_review
WITH (security_invoker = true) AS
SELECT 
  q.id,
  q.project_id,
  q.supplier_name,
  q.organisation_id,
  COUNT(rq.id) as pending_reviews
FROM quotes q
LEFT JOIN review_queue rq ON rq.quote_id = q.id AND rq.status = 'pending'
WHERE q.status IN ('imported', 'processing', 'ready')
GROUP BY q.id, q.project_id, q.supplier_name, q.organisation_id
HAVING COUNT(rq.id) > 0;

-- Recreate admin_global_quotes with SECURITY INVOKER
-- Will only show quotes user has access to via RLS
CREATE VIEW admin_global_quotes
WITH (security_invoker = true) AS
SELECT 
  q.id,
  q.project_id,
  q.organisation_id,
  q.supplier_name,
  q.total_amount,
  q.status,
  q.created_at,
  p.name as project_name,
  o.name as organisation_name
FROM quotes q
LEFT JOIN projects p ON p.id = q.project_id
LEFT JOIN organisations o ON o.id = q.organisation_id;

-- Recreate admin_organisations_dashboard with SECURITY INVOKER
CREATE VIEW admin_organisations_dashboard
WITH (security_invoker = true) AS
SELECT 
  o.id,
  o.name,
  o.status,
  o.subscription_status,
  o.pricing_tier,
  o.created_at,
  o.trial_end_date,
  o.last_active_at,
  COUNT(DISTINCT om.user_id) as member_count,
  COUNT(DISTINCT p.id) as project_count,
  COUNT(DISTINCT q.id) as quote_count
FROM organisations o
LEFT JOIN organisation_members om ON om.organisation_id = o.id AND om.status = 'active'
LEFT JOIN projects p ON p.organisation_id = o.id
LEFT JOIN quotes q ON q.organisation_id = o.id
GROUP BY o.id, o.name, o.status, o.subscription_status, o.pricing_tier, 
         o.created_at, o.trial_end_date, o.last_active_at;
