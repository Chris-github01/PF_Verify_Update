/*
  # Phase 1 Shadow Intelligence: Document Truth Validation

  Creates the post-parse financial truth engine tables.

  ## New Tables
  1. `document_total_candidates` — All extracted total candidates from a run
     - value, anchor_type, source_text, normalized_source_text
     - confidence (0-1), ranking_score, selected, rejected_reason
     - page, line_index
  2. `document_truth_validations` — Resolved truth per run
     - detected_document_total, validated_document_total
     - selected_anchor_type, extraction_mismatch, mismatch_reason
     - true_missing_value, extraction_failure

  ## Notes
  - Shadow-only: never routes through live parser
  - Anchor priority is enforced in code (see shadowDocumentTruth.ts)
  - Does NOT modify shadow_runs or any production table
*/

CREATE TABLE IF NOT EXISTS document_total_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  value numeric(16,2) NOT NULL,
  anchor_type text NOT NULL,
  source_text text,
  normalized_source_text text,
  confidence numeric(4,3) NOT NULL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  ranking_score integer NOT NULL DEFAULT 0,
  selected boolean NOT NULL DEFAULT false,
  rejected_reason text,
  page integer,
  line_index integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS document_truth_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL UNIQUE,
  detected_document_total numeric(16,2),
  validated_document_total numeric(16,2),
  selected_anchor_type text,
  extraction_mismatch boolean NOT NULL DEFAULT false,
  mismatch_reason text,
  true_missing_value numeric(16,2),
  extraction_failure boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_total_candidates_run_id ON document_total_candidates(run_id);
CREATE INDEX IF NOT EXISTS idx_document_truth_validations_run_id ON document_truth_validations(run_id);

ALTER TABLE document_total_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_truth_validations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Document total candidates readable by authenticated"
  ON document_total_candidates FOR SELECT TO authenticated USING (true);

CREATE POLICY "Document total candidates insertable by authenticated"
  ON document_total_candidates FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Document truth validations readable by authenticated"
  ON document_truth_validations FOR SELECT TO authenticated USING (true);

CREATE POLICY "Document truth validations insertable by authenticated"
  ON document_truth_validations FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Document truth validations updatable by authenticated"
  ON document_truth_validations FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);
