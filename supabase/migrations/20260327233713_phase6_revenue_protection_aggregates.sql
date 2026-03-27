/*
  # Phase 6 — Revenue Protection Aggregates

  Creates the `revenue_protection_aggregates` table which stores pre-computed
  financial risk aggregations per module and time window. These records power
  the Revenue Protection Dashboard — showing total revenue at risk, average
  risk scores, high-risk quote counts, and top leakage categories.

  ## New Tables
  - `revenue_protection_aggregates`
    - id (uuid, pk)
    - module_key (text) — trade module key, 'all' for cross-module
    - time_window (text) — '7d' | '30d' | '90d' | 'all_time'
    - total_quotes (int) — total runs in window
    - total_estimated_leakage (numeric) — sum of all leakage event values
    - avg_risk_score (numeric) — mean risk score across runs
    - high_risk_quote_count (int) — count of runs with risk level high or critical
    - top_leakage_categories_json (jsonb) — [{type, total_value, count}] sorted desc
    - computed_at (timestamptz) — when this aggregate was last computed
    - created_at (timestamptz)

  ## Security
  - RLS enabled; only platform_admins can read/write
*/

CREATE TABLE IF NOT EXISTS revenue_protection_aggregates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL,
  time_window text NOT NULL DEFAULT '30d',
  total_quotes integer NOT NULL DEFAULT 0,
  total_estimated_leakage numeric(14,2) NOT NULL DEFAULT 0,
  avg_risk_score numeric(5,2) NOT NULL DEFAULT 0,
  high_risk_quote_count integer NOT NULL DEFAULT 0,
  top_leakage_categories_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(module_key, time_window)
);

CREATE INDEX IF NOT EXISTS idx_rpa_module_key ON revenue_protection_aggregates(module_key);
CREATE INDEX IF NOT EXISTS idx_rpa_time_window ON revenue_protection_aggregates(time_window);
CREATE INDEX IF NOT EXISTS idx_rpa_computed_at ON revenue_protection_aggregates(computed_at DESC);

ALTER TABLE revenue_protection_aggregates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can read revenue protection aggregates"
  ON revenue_protection_aggregates FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE platform_admins.user_id = auth.uid()
    )
  );

CREATE POLICY "Platform admins can insert revenue protection aggregates"
  ON revenue_protection_aggregates FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE platform_admins.user_id = auth.uid()
    )
  );

CREATE POLICY "Platform admins can update revenue protection aggregates"
  ON revenue_protection_aggregates FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE platform_admins.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE platform_admins.user_id = auth.uid()
    )
  );
