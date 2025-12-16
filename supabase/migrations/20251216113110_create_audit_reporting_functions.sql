/*
  # Create Audit Reporting Database Functions
  
  1. Functions Created
    - calculate_quote_stats: Aggregate quote statistics with filters
    - calculate_audit_stats: Aggregate audit statistics with filters
    - get_risk_distribution: Get risk score distribution
    - get_top_gap_types: Get most common gap types
    - get_top_manufacturers: Get most detected manufacturers
  
  2. Purpose
    - Server-side aggregation for performance
    - Consistent calculation logic
    - Support for dynamic filtering
*/

-- ============================================================================
-- Calculate Quote Statistics
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_quote_stats(
  p_organisation_id uuid DEFAULT NULL,
  p_project_id uuid DEFAULT NULL,
  p_module text DEFAULT NULL,
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL
)
RETURNS TABLE (
  total_quotes bigint,
  success_quotes bigint,
  success_rate numeric,
  total_line_items bigint,
  avg_confidence numeric,
  top_manufacturers jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH filtered_quotes AS (
    SELECT q.id, q.parse_status, q.line_item_count
    FROM quotes q
    WHERE (p_organisation_id IS NULL OR q.organisation_id = p_organisation_id)
      AND (p_project_id IS NULL OR q.project_id = p_project_id)
      AND (p_module IS NULL OR q.module = p_module)
      AND (p_start_date IS NULL OR q.created_at >= p_start_date)
      AND (p_end_date IS NULL OR q.created_at <= p_end_date)
      AND q.is_latest = true
  ),
  quote_items_filtered AS (
    SELECT qi.*
    FROM quote_items qi
    INNER JOIN filtered_quotes fq ON qi.quote_id = fq.id
  ),
  manufacturers AS (
    SELECT 
      manufacturer_detected, 
      COUNT(*) as count
    FROM quote_items_filtered
    WHERE manufacturer_detected IS NOT NULL
    GROUP BY manufacturer_detected
    ORDER BY count DESC
    LIMIT 10
  )
  SELECT
    COUNT(*)::bigint as total_quotes,
    COUNT(*) FILTER (WHERE parse_status = 'success')::bigint as success_quotes,
    ROUND(
      (COUNT(*) FILTER (WHERE parse_status = 'success')::numeric / 
       NULLIF(COUNT(*), 0) * 100), 
      2
    ) as success_rate,
    COALESCE(SUM(line_item_count), 0)::bigint as total_line_items,
    ROUND(
      (SELECT AVG(confidence) FROM quote_items_filtered WHERE confidence IS NOT NULL),
      2
    ) as avg_confidence,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('manufacturer', manufacturer_detected, 'count', count))
       FROM manufacturers),
      '[]'::jsonb
    ) as top_manufacturers
  FROM filtered_quotes;
END;
$$;

-- ============================================================================
-- Calculate Audit Statistics
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_audit_stats(
  p_organisation_id uuid DEFAULT NULL,
  p_project_id uuid DEFAULT NULL,
  p_module text DEFAULT NULL,
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL
)
RETURNS TABLE (
  total_audits bigint,
  avg_duration_seconds numeric,
  avg_risk_score numeric,
  avg_coverage_score numeric,
  risk_distribution jsonb,
  top_gap_types jsonb,
  estimated_cost_avoided numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH filtered_audits AS (
    SELECT a.*
    FROM audits a
    WHERE (p_organisation_id IS NULL OR a.organisation_id = p_organisation_id)
      AND (p_project_id IS NULL OR a.project_id = p_project_id)
      AND (p_module IS NULL OR a.module = p_module)
      AND (p_start_date IS NULL OR a.created_at >= p_start_date)
      AND (p_end_date IS NULL OR a.created_at <= p_end_date)
      AND a.audit_status = 'complete'
  ),
  risk_buckets AS (
    SELECT
      COUNT(*) FILTER (WHERE overall_risk_score_0_100 < 40) as low,
      COUNT(*) FILTER (WHERE overall_risk_score_0_100 >= 40 AND overall_risk_score_0_100 < 70) as medium,
      COUNT(*) FILTER (WHERE overall_risk_score_0_100 >= 70 AND overall_risk_score_0_100 < 90) as high,
      COUNT(*) FILTER (WHERE overall_risk_score_0_100 >= 90) as critical
    FROM filtered_audits
  ),
  gap_types AS (
    SELECT 
      af.type,
      COUNT(*) as count
    FROM audit_findings af
    INNER JOIN filtered_audits fa ON af.audit_id = fa.id
    GROUP BY af.type
    ORDER BY count DESC
    LIMIT 10
  )
  SELECT
    COUNT(*)::bigint as total_audits,
    ROUND(AVG(duration_seconds), 0) as avg_duration_seconds,
    ROUND(AVG(overall_risk_score_0_100), 2) as avg_risk_score,
    ROUND(AVG(coverage_score_0_100), 2) as avg_coverage_score,
    (SELECT jsonb_build_object(
      'low', low,
      'medium', medium,
      'high', high,
      'critical', critical
    ) FROM risk_buckets) as risk_distribution,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('type', type, 'count', count))
       FROM gap_types),
      '[]'::jsonb
    ) as top_gap_types,
    COALESCE(
      (SELECT SUM(af.estimated_cost_impact)
       FROM audit_findings af
       INNER JOIN filtered_audits fa ON af.audit_id = fa.id
       WHERE af.estimated_cost_impact IS NOT NULL),
      0
    ) as estimated_cost_avoided
  FROM filtered_audits;
END;
$$;

-- ============================================================================
-- Get Quotes Over Time
-- ============================================================================

CREATE OR REPLACE FUNCTION get_quotes_over_time(
  p_organisation_id uuid DEFAULT NULL,
  p_interval text DEFAULT 'day',
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL
)
RETURNS TABLE (
  period text,
  quote_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    TO_CHAR(q.created_at, CASE
      WHEN p_interval = 'hour' THEN 'YYYY-MM-DD HH24:00'
      WHEN p_interval = 'day' THEN 'YYYY-MM-DD'
      WHEN p_interval = 'week' THEN 'IYYY-IW'
      WHEN p_interval = 'month' THEN 'YYYY-MM'
      ELSE 'YYYY-MM-DD'
    END) as period,
    COUNT(*)::bigint as quote_count
  FROM quotes q
  WHERE (p_organisation_id IS NULL OR q.organisation_id = p_organisation_id)
    AND (p_start_date IS NULL OR q.created_at >= p_start_date)
    AND (p_end_date IS NULL OR q.created_at <= p_end_date)
    AND q.is_latest = true
  GROUP BY period
  ORDER BY period;
END;
$$;

-- ============================================================================
-- Get Audits Over Time
-- ============================================================================

CREATE OR REPLACE FUNCTION get_audits_over_time(
  p_organisation_id uuid DEFAULT NULL,
  p_interval text DEFAULT 'day',
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL
)
RETURNS TABLE (
  period text,
  audit_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    TO_CHAR(a.created_at, CASE
      WHEN p_interval = 'hour' THEN 'YYYY-MM-DD HH24:00'
      WHEN p_interval = 'day' THEN 'YYYY-MM-DD'
      WHEN p_interval = 'week' THEN 'IYYY-IW'
      WHEN p_interval = 'month' THEN 'YYYY-MM'
      ELSE 'YYYY-MM-DD'
    END) as period,
    COUNT(*)::bigint as audit_count
  FROM audits a
  WHERE (p_organisation_id IS NULL OR a.organisation_id = p_organisation_id)
    AND (p_start_date IS NULL OR a.created_at >= p_start_date)
    AND (p_end_date IS NULL OR a.created_at <= p_end_date)
    AND a.audit_status = 'complete'
  GROUP BY period
  ORDER BY period;
END;
$$;

-- ============================================================================
-- Get Supplier Comparison
-- ============================================================================

CREATE OR REPLACE FUNCTION get_supplier_comparison(
  p_organisation_id uuid,
  p_project_id uuid DEFAULT NULL
)
RETURNS TABLE (
  supplier_id uuid,
  supplier_name text,
  quote_count bigint,
  avg_risk_score numeric,
  avg_total_value numeric,
  compliance_flags_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id as supplier_id,
    s.name as supplier_name,
    COUNT(DISTINCT q.id)::bigint as quote_count,
    ROUND(AVG(a.overall_risk_score_0_100), 2) as avg_risk_score,
    ROUND(AVG(q.total_amount), 2) as avg_total_value,
    SUM(a.compliance_flags_count)::bigint as compliance_flags_count
  FROM suppliers s
  LEFT JOIN quotes q ON q.supplier_id = s.id AND q.is_latest = true
  LEFT JOIN audits a ON a.project_id = q.project_id AND a.recommended_supplier_id = s.id
  WHERE s.organisation_id = p_organisation_id
    AND (p_project_id IS NULL OR q.project_id = p_project_id)
  GROUP BY s.id, s.name
  HAVING COUNT(DISTINCT q.id) > 0
  ORDER BY avg_risk_score ASC NULLS LAST;
END;
$$;

COMMENT ON FUNCTION calculate_quote_stats IS 'Calculate quote statistics with optional filters';
COMMENT ON FUNCTION calculate_audit_stats IS 'Calculate audit statistics with optional filters';
COMMENT ON FUNCTION get_quotes_over_time IS 'Get quote count over time periods';
COMMENT ON FUNCTION get_audits_over_time IS 'Get audit count over time periods';
COMMENT ON FUNCTION get_supplier_comparison IS 'Compare suppliers by risk score and compliance';
