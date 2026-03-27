/*
  # Phase 6 — Quote Intelligence Summary Engine

  Creates the `quote_intelligence_summaries` table which stores pre-computed,
  human-readable summaries per shadow run. Each record aggregates data from
  commercial_risk_profiles, shadow_revenue_leakage_events, and shadow_run_failures
  into a single plain-English summary with a risk badge, key issues, strengths,
  and a recommendation.

  ## New Tables
  - `quote_intelligence_summaries`
    - id (uuid, pk)
    - run_id (text) — shadow run this summary belongs to
    - module_key (text) — trade module (e.g. plumbing_parser)
    - overall_risk_score (int) — 0–100 from commercial risk engine
    - overall_risk_level (text) — low | medium | high | critical
    - key_issues_json (jsonb) — ordered list of issue objects {label, financial_impact, severity}
    - key_strengths_json (jsonb) — list of strength strings
    - recommendation_text (text) — plain-English award recommendation
    - confidence_score (numeric) — 0.0–1.0 aggregate confidence
    - created_at, updated_at

  ## Security
  - RLS enabled; only platform_admins can read/write
*/

CREATE TABLE IF NOT EXISTS quote_intelligence_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id text NOT NULL,
  module_key text NOT NULL,
  overall_risk_score integer NOT NULL DEFAULT 0,
  overall_risk_level text NOT NULL DEFAULT 'low',
  key_issues_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  key_strengths_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendation_text text NOT NULL DEFAULT '',
  confidence_score numeric(4,3) NOT NULL DEFAULT 0.0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qis_run_id ON quote_intelligence_summaries(run_id);
CREATE INDEX IF NOT EXISTS idx_qis_module_key ON quote_intelligence_summaries(module_key);
CREATE INDEX IF NOT EXISTS idx_qis_risk_level ON quote_intelligence_summaries(overall_risk_level);
CREATE INDEX IF NOT EXISTS idx_qis_created_at ON quote_intelligence_summaries(created_at DESC);

ALTER TABLE quote_intelligence_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can read quote intelligence summaries"
  ON quote_intelligence_summaries FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE platform_admins.user_id = auth.uid()
    )
  );

CREATE POLICY "Platform admins can insert quote intelligence summaries"
  ON quote_intelligence_summaries FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE platform_admins.user_id = auth.uid()
    )
  );

CREATE POLICY "Platform admins can update quote intelligence summaries"
  ON quote_intelligence_summaries FOR UPDATE
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
