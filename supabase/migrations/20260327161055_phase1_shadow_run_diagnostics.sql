/*
  # Phase 1 Shadow Intelligence: Run Diagnostics

  Adds structured diagnostic profiling to shadow comparison runs.

  ## New Tables
  1. `shadow_run_diagnostics` — Per-run document profile
     - supplier_name_normalized, template_family_id, document_format_family
     - table_style, total_style, gst_mode, page_count, line_item_count
     - section_count, confidence_score (0–100), anomaly_count, anomaly_flags_json
     - raw_diagnostics_json

  ## Notes
  - Linked to shadow_runs via run_id (text FK pattern matching existing shadow_runs.id)
  - Does NOT modify shadow_runs or any existing table
  - Diagnostics are built post-parse inside shadow execution path only
  - Live production parsing is never routed through this
*/

CREATE TABLE IF NOT EXISTS shadow_run_diagnostics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  supplier_name_normalized text,
  template_family_id text,
  document_format_family text,
  table_style text,
  total_style text,
  gst_mode text,
  page_count integer,
  line_item_count integer,
  section_count integer,
  confidence_score integer NOT NULL DEFAULT 100 CHECK (confidence_score >= 0 AND confidence_score <= 100),
  anomaly_count integer NOT NULL DEFAULT 0,
  anomaly_flags_json jsonb NOT NULL DEFAULT '[]',
  raw_diagnostics_json jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shadow_run_diagnostics_run_id ON shadow_run_diagnostics(run_id);

ALTER TABLE shadow_run_diagnostics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Shadow run diagnostics readable by authenticated"
  ON shadow_run_diagnostics FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Shadow run diagnostics insertable by authenticated"
  ON shadow_run_diagnostics FOR INSERT
  TO authenticated
  WITH CHECK (true);
