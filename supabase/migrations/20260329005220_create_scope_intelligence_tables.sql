/*
  # Scope Intelligence Engine Tables

  ## Summary
  Creates the core tables for the AI commercial adjudication scope intelligence layer.
  This is a safe, non-destructive addition that sits alongside existing parser outputs
  without modifying any live parser logic.

  ## New Tables

  ### 1. ci_scope_item_classifications
  Stores per-item scope classification results produced by the scope intelligence engine.
  Each row corresponds to one quote_item and records its commercial scope bucket,
  classification confidence, and reasoning text.

  Fields:
  - quote_item_id: FK to quote_items
  - quote_id: FK to quotes
  - project_id: context
  - scope_bucket: one of core_scope / secondary_scope / optional_scope /
                  excluded_scope / risk_scope / summary_only / unknown_scope
  - confidence: 0-100 integer
  - reasoning: free text explanation
  - anchor_phrases_matched: jsonb array of phrases that drove classification
  - commercial_weight: weighted value for coverage calculation
  - raw_text_snapshot: copy of description at classification time (no-modify reference)
  - classified_at: timestamp

  ### 2. ci_supplier_scope_summaries
  One row per supplier per project (latest run). Stores the aggregated scope coverage
  metrics computed from item-level classifications.

  Fields:
  - project_id, quote_id, supplier_name, organisation_id
  - core_scope_coverage_pct
  - secondary_scope_coverage_pct
  - excluded_scope_count, risk_scope_count, optional_scope_count, unknown_scope_count
  - summary_only_count
  - scope_confidence_score: overall confidence in this classification run
  - likely_variation_exposure_score: 0-100
  - scope_summary_text: human-readable summary string
  - classification_version: semver of classifier used
  - computed_at

  ## Security
  - RLS enabled on all tables
  - Authenticated users can read/write their own organisation's data
*/

CREATE TABLE IF NOT EXISTS ci_scope_item_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  quote_item_id uuid REFERENCES quote_items(id) ON DELETE SET NULL,
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  supplier_name text NOT NULL DEFAULT '',
  scope_bucket text NOT NULL DEFAULT 'unknown_scope'
    CHECK (scope_bucket IN ('core_scope','secondary_scope','optional_scope','excluded_scope','risk_scope','summary_only','unknown_scope')),
  confidence integer NOT NULL DEFAULT 50 CHECK (confidence >= 0 AND confidence <= 100),
  reasoning text NOT NULL DEFAULT '',
  anchor_phrases_matched jsonb NOT NULL DEFAULT '[]'::jsonb,
  commercial_weight numeric NOT NULL DEFAULT 1.0,
  raw_text_snapshot text NOT NULL DEFAULT '',
  section_context text,
  classified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ci_scope_item_classifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read their org scope classifications"
  ON ci_scope_item_classifications FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = ci_scope_item_classifications.organisation_id
      AND organisation_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can insert their org scope classifications"
  ON ci_scope_item_classifications FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = ci_scope_item_classifications.organisation_id
      AND organisation_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can update their org scope classifications"
  ON ci_scope_item_classifications FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = ci_scope_item_classifications.organisation_id
      AND organisation_members.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = ci_scope_item_classifications.organisation_id
      AND organisation_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can delete their org scope classifications"
  ON ci_scope_item_classifications FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = ci_scope_item_classifications.organisation_id
      AND organisation_members.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_ci_scope_item_class_project ON ci_scope_item_classifications(project_id);
CREATE INDEX IF NOT EXISTS idx_ci_scope_item_class_quote ON ci_scope_item_classifications(quote_id);

-- Supplier-level scope summary aggregation

CREATE TABLE IF NOT EXISTS ci_supplier_scope_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  supplier_name text NOT NULL,
  core_scope_coverage_pct numeric NOT NULL DEFAULT 0,
  secondary_scope_coverage_pct numeric NOT NULL DEFAULT 0,
  excluded_scope_count integer NOT NULL DEFAULT 0,
  risk_scope_count integer NOT NULL DEFAULT 0,
  optional_scope_count integer NOT NULL DEFAULT 0,
  unknown_scope_count integer NOT NULL DEFAULT 0,
  summary_only_count integer NOT NULL DEFAULT 0,
  total_classified_items integer NOT NULL DEFAULT 0,
  scope_confidence_score numeric NOT NULL DEFAULT 0,
  likely_variation_exposure_score numeric NOT NULL DEFAULT 0,
  scope_summary_text text NOT NULL DEFAULT '',
  classification_version text NOT NULL DEFAULT '1.0',
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ci_supplier_scope_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read their org scope summaries"
  ON ci_supplier_scope_summaries FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = ci_supplier_scope_summaries.organisation_id
      AND organisation_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can insert their org scope summaries"
  ON ci_supplier_scope_summaries FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = ci_supplier_scope_summaries.organisation_id
      AND organisation_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can update their org scope summaries"
  ON ci_supplier_scope_summaries FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = ci_supplier_scope_summaries.organisation_id
      AND organisation_members.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = ci_supplier_scope_summaries.organisation_id
      AND organisation_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can delete their org scope summaries"
  ON ci_supplier_scope_summaries FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = ci_supplier_scope_summaries.organisation_id
      AND organisation_members.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_ci_scope_summaries_project ON ci_supplier_scope_summaries(project_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci_scope_summaries_quote_unique ON ci_supplier_scope_summaries(quote_id);
