/*
  # Parser Bulk Runs

  Tracks bulk Version Comparison runs that re-parse PDFs from the
  Admin PDF Vault and compare Legacy (V1) against Parser V2 results.

  1. New Tables
    - `parser_bulk_runs`
      - `id` (uuid, primary key)
      - `started_at` (timestamptz)
      - `completed_at` (timestamptz, nullable)
      - `total_files` (integer)         -- every file discovered in vault
      - `duplicates_skipped` (integer)
      - `queued_unique` (integer)
      - `processed_count` (integer)
      - `failed_count` (integer)
      - `v2_better_count` (integer)
      - `equal_count` (integer)
      - `v1_better_count` (integer)
      - `avg_v1_runtime_ms` (integer)
      - `avg_v2_runtime_ms` (integer)
      - `status` (text) running | completed | failed | cancelled
      - `current_file` (text, nullable)
      - `progress_percent` (integer)
      - `error_message` (text, nullable)
      - `started_by` (uuid, nullable)
      - `metadata` (jsonb)

  2. Security
    - Enable RLS
    - Platform admins SELECT/INSERT/UPDATE
    - Service role bypass INSERT/UPDATE for the edge function
*/

CREATE TABLE IF NOT EXISTS parser_bulk_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  total_files integer NOT NULL DEFAULT 0,
  duplicates_skipped integer NOT NULL DEFAULT 0,
  queued_unique integer NOT NULL DEFAULT 0,
  processed_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  v2_better_count integer NOT NULL DEFAULT 0,
  equal_count integer NOT NULL DEFAULT 0,
  v1_better_count integer NOT NULL DEFAULT 0,
  avg_v1_runtime_ms integer NOT NULL DEFAULT 0,
  avg_v2_runtime_ms integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'running',
  current_file text,
  progress_percent integer NOT NULL DEFAULT 0,
  error_message text,
  started_by uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS parser_bulk_runs_started_at_idx
  ON parser_bulk_runs (started_at DESC);

CREATE INDEX IF NOT EXISTS parser_bulk_runs_status_idx
  ON parser_bulk_runs (status);

ALTER TABLE parser_bulk_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admins can view bulk runs" ON parser_bulk_runs;
CREATE POLICY "Platform admins can view bulk runs"
  ON parser_bulk_runs FOR SELECT
  TO authenticated
  USING (is_platform_admin());

DROP POLICY IF EXISTS "Platform admins can insert bulk runs" ON parser_bulk_runs;
CREATE POLICY "Platform admins can insert bulk runs"
  ON parser_bulk_runs FOR INSERT
  TO authenticated
  WITH CHECK (is_platform_admin());

DROP POLICY IF EXISTS "Platform admins can update bulk runs" ON parser_bulk_runs;
CREATE POLICY "Platform admins can update bulk runs"
  ON parser_bulk_runs FOR UPDATE
  TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

DROP POLICY IF EXISTS "Service role inserts bulk runs" ON parser_bulk_runs;
CREATE POLICY "Service role inserts bulk runs"
  ON parser_bulk_runs FOR INSERT
  TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role updates bulk runs" ON parser_bulk_runs;
CREATE POLICY "Service role updates bulk runs"
  ON parser_bulk_runs FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);
