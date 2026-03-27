/*
  # Phase 6 — AI Decision Copilot Outputs

  Creates the `decision_copilot_outputs` table which stores pre-generated
  AI-style explanations for three entity types:
  - run: explains why a shadow run has a given risk level
  - candidate_improvement: explains a Phase 5 candidate's expected benefit
  - version: explains a Phase 4 benchmark result and promotion recommendation

  Each record contains a summary_text (plain English), structured reasoning_json,
  a recommendation string, and a confidence_score.

  ## New Tables
  - `decision_copilot_outputs`
    - id (uuid, pk)
    - entity_type (text) — 'run' | 'candidate_improvement' | 'version'
    - entity_id (text) — the ID of the referenced entity
    - summary_text (text) — single paragraph plain-English explanation
    - reasoning_json (jsonb) — {what, why, next_step, data_points: [...]}
    - recommendation (text) — short action string
    - confidence_score (numeric) — 0.0–1.0
    - created_at, updated_at

  ## Security
  - RLS enabled; only platform_admins can read/write
*/

CREATE TABLE IF NOT EXISTS decision_copilot_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  summary_text text NOT NULL DEFAULT '',
  reasoning_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  recommendation text NOT NULL DEFAULT '',
  confidence_score numeric(4,3) NOT NULL DEFAULT 0.0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_dco_entity_type ON decision_copilot_outputs(entity_type);
CREATE INDEX IF NOT EXISTS idx_dco_entity_id ON decision_copilot_outputs(entity_id);
CREATE INDEX IF NOT EXISTS idx_dco_created_at ON decision_copilot_outputs(created_at DESC);

ALTER TABLE decision_copilot_outputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can read copilot outputs"
  ON decision_copilot_outputs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE platform_admins.user_id = auth.uid()
    )
  );

CREATE POLICY "Platform admins can insert copilot outputs"
  ON decision_copilot_outputs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE platform_admins.user_id = auth.uid()
    )
  );

CREATE POLICY "Platform admins can update copilot outputs"
  ON decision_copilot_outputs FOR UPDATE
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
