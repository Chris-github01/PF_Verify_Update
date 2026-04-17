/*
  # Add parser_validation_runs table

  ## Purpose
  Stores results of parser test matrix runs — used by the Phase 3 ParserValidationDashboard
  to track accuracy across all 5 commercial families (hybrid, lump_sum, itemized, spreadsheet, scanned_ocr).

  ## New Tables
  - `parser_validation_runs`
    - `id` (uuid, pk)
    - `run_at` (timestamptz) — when the test was submitted
    - `filename` (text) — uploaded file name
    - `file_extension` (text) — pdf, xlsx, csv
    - `expected_family` (text) — what the tester declared
    - `expected_total` (numeric) — what the tester declared as the correct total
    - `detected_family` (text) — what commercialFamily the classifier returned
    - `detected_document_class` (text) — raw documentClass
    - `detected_parser_used` (text) — which parser handled it
    - `parsed_total` (numeric) — grand total the parser returned
    - `optional_total` (numeric)
    - `item_count` (int)
    - `confidence` (numeric)
    - `total_source` (text) — row_sum / summary_page / spreadsheet
    - `warnings` (jsonb) — array of warning strings
    - `validation_risk` (text) — OK / MEDIUM / HIGH
    - `variance` (numeric, generated) — abs(parsed_total - expected_total)
    - `variance_pct` (numeric, generated) — variance / expected_total * 100
    - `pass` (boolean, generated) — variance_pct < 1%
    - `organisation_id` (uuid, fk → organisations)
    - `user_id` (uuid, fk → auth.users)
    - `raw_diagnostics` (jsonb) — full parser output for debugging

  ## Security
  - RLS enabled
  - Platform admins and org members can insert
  - Users can only read their own org's runs
*/

CREATE TABLE IF NOT EXISTS parser_validation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at timestamptz DEFAULT now(),
  filename text NOT NULL DEFAULT '',
  file_extension text NOT NULL DEFAULT '',
  expected_family text NOT NULL DEFAULT '',
  expected_total numeric NOT NULL DEFAULT 0,
  detected_family text NOT NULL DEFAULT '',
  detected_document_class text NOT NULL DEFAULT '',
  detected_parser_used text NOT NULL DEFAULT '',
  parsed_total numeric NOT NULL DEFAULT 0,
  optional_total numeric NOT NULL DEFAULT 0,
  item_count integer NOT NULL DEFAULT 0,
  confidence numeric NOT NULL DEFAULT 0,
  total_source text NOT NULL DEFAULT '',
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  validation_risk text NOT NULL DEFAULT 'UNKNOWN',
  variance numeric GENERATED ALWAYS AS (abs(parsed_total - expected_total)) STORED,
  variance_pct numeric GENERATED ALWAYS AS (
    CASE WHEN expected_total > 0 THEN round((abs(parsed_total - expected_total) / expected_total) * 100, 2) ELSE NULL END
  ) STORED,
  pass boolean GENERATED ALWAYS AS (
    CASE WHEN expected_total > 0 THEN abs(parsed_total - expected_total) / expected_total < 0.01 ELSE NULL END
  ) STORED,
  organisation_id uuid REFERENCES organisations(id),
  user_id uuid REFERENCES auth.users(id),
  raw_diagnostics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pvr_organisation_id ON parser_validation_runs(organisation_id);
CREATE INDEX IF NOT EXISTS idx_pvr_run_at ON parser_validation_runs(run_at DESC);
CREATE INDEX IF NOT EXISTS idx_pvr_expected_family ON parser_validation_runs(expected_family);
CREATE INDEX IF NOT EXISTS idx_pvr_detected_family ON parser_validation_runs(detected_family);

ALTER TABLE parser_validation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can insert validation runs"
  ON parser_validation_runs FOR INSERT
  TO authenticated
  WITH CHECK (
    organisation_id IS NULL OR
    EXISTS (
      SELECT 1 FROM organisation_members om
      WHERE om.organisation_id = parser_validation_runs.organisation_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

CREATE POLICY "Org members can view their validation runs"
  ON parser_validation_runs FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM organisation_members om
      WHERE om.organisation_id = parser_validation_runs.organisation_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );
