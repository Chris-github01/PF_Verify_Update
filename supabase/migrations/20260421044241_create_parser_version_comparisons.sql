/*
  # Parser Version Comparisons

  Stores side-by-side results for legacy (V1) parser vs parser_v2 during shadow
  rollout. Admin Console reads this table for the Version Comparison dashboard.

  1. New Tables
     - `parser_version_comparisons`
       - `id` (uuid, pk)
       - `created_at` (timestamptz)
       - `quote_id` (uuid, nullable, fk to quotes)
       - `supplier_name` (text)
       - `trade` (text)
       - `quote_type` (text) - itemized | lump_sum | hybrid | unknown
       - `v1_total` (numeric)
       - `v2_total` (numeric)
       - `actual_total` (numeric, nullable) - ground truth when known
       - `v1_runtime_ms` (integer)
       - `v2_runtime_ms` (integer)
       - `v1_requires_review` (boolean)
       - `v2_requires_review` (boolean)
       - `winner` (text) - 'v1' | 'v2' | 'equal'
       - `variance_pct` (numeric) - v2 vs actual when actual known, else v2 vs v1
       - `failure_cause` (text, nullable) - top-level failure category
       - `metadata` (jsonb) - free-form extras

  2. Security
     - Enable RLS
     - SELECT restricted to platform admins (is_platform_admin())
     - INSERT allowed to service role only (parser pipelines write through edge functions)
*/

CREATE TABLE IF NOT EXISTS parser_version_comparisons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL,
  supplier_name text DEFAULT '',
  trade text DEFAULT '',
  quote_type text DEFAULT 'unknown',
  v1_total numeric DEFAULT 0,
  v2_total numeric DEFAULT 0,
  actual_total numeric,
  v1_runtime_ms integer DEFAULT 0,
  v2_runtime_ms integer DEFAULT 0,
  v1_requires_review boolean DEFAULT false,
  v2_requires_review boolean DEFAULT false,
  winner text DEFAULT 'equal' CHECK (winner IN ('v1', 'v2', 'equal')),
  variance_pct numeric DEFAULT 0,
  failure_cause text,
  metadata jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS parser_version_comparisons_created_at_idx
  ON parser_version_comparisons (created_at DESC);
CREATE INDEX IF NOT EXISTS parser_version_comparisons_trade_idx
  ON parser_version_comparisons (trade);
CREATE INDEX IF NOT EXISTS parser_version_comparisons_winner_idx
  ON parser_version_comparisons (winner);
CREATE INDEX IF NOT EXISTS parser_version_comparisons_quote_id_idx
  ON parser_version_comparisons (quote_id);

ALTER TABLE parser_version_comparisons ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'parser_version_comparisons'
      AND policyname = 'Platform admins can view comparisons'
  ) THEN
    CREATE POLICY "Platform admins can view comparisons"
      ON parser_version_comparisons FOR SELECT
      TO authenticated
      USING (is_platform_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'parser_version_comparisons'
      AND policyname = 'Platform admins can insert comparisons'
  ) THEN
    CREATE POLICY "Platform admins can insert comparisons"
      ON parser_version_comparisons FOR INSERT
      TO authenticated
      WITH CHECK (is_platform_admin());
  END IF;
END $$;
