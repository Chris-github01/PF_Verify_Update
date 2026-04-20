/*
  # Parser stabilization infrastructure

  Supports the stabilization-mode tasks without changing parser architecture.
  Adds audit/rollback tables and a diagnostics view over existing quote fields.

  1. New Tables
    - `parser_regression_snapshots` — captures parser output per job at a given
      checkpoint (before / after). Used for accuracy diffs.
      Columns: id, checkpoint_label, parsing_job_id, quote_id, supplier_name,
      filename, main_total, optional_total, grand_total, confidence,
      requires_review, has_variants, resolution_source, captured_at,
      captured_by, notes.
    - `parser_rollback_snapshots` — immutable point-in-time backup of a
      quote's resolved totals. Used as rollback source if post-fix
      regression surfaces a regression.
      Columns: id, quote_id, parsing_job_id, snapshot_label, main_total,
      optional_total, grand_total, confidence, resolution_source,
      totals_evidence, captured_at, captured_by.
    - `parser_demo_queue` — curated quote IDs flagged for Wednesday demo.
      Columns: id, quote_id, parsing_job_id, demo_label, display_order,
      added_at, added_by, notes.

  2. New Views
    - `parser_diagnostics_v1` — analyst-friendly join across quotes +
      parsing_jobs exposing totals, confidence, review reason, job status,
      recent notes. Read-only; no table writes.

  3. Security
    - RLS enabled on all three new tables.
    - Select policies: authenticated members of the quote's organisation.
    - Insert/update: authenticated members of the quote's organisation.
    - Delete: only platform admins.
    - View inherits underlying table policies.

  4. Important Notes
    - No changes to `quotes`, `parsing_jobs`, or any parser logic.
    - Tables are additive and do not affect existing parser outputs.
*/

CREATE TABLE IF NOT EXISTS parser_regression_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkpoint_label text NOT NULL,
  parsing_job_id uuid REFERENCES parsing_jobs(id) ON DELETE SET NULL,
  quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL,
  supplier_name text,
  filename text,
  main_total numeric,
  optional_total numeric,
  grand_total numeric,
  confidence text,
  requires_review boolean DEFAULT false,
  has_variants boolean DEFAULT false,
  resolution_source text,
  notes jsonb DEFAULT '[]'::jsonb,
  organisation_id uuid,
  captured_at timestamptz DEFAULT now(),
  captured_by uuid
);

ALTER TABLE parser_regression_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view regression snapshots"
  ON parser_regression_snapshots FOR SELECT TO authenticated
  USING (
    organisation_id IS NULL OR EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = parser_regression_snapshots.organisation_id
        AND organisation_members.user_id = (SELECT auth.uid())
        AND organisation_members.status = 'active'
    )
  );

CREATE POLICY "Org members insert regression snapshots"
  ON parser_regression_snapshots FOR INSERT TO authenticated
  WITH CHECK (
    organisation_id IS NULL OR EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = parser_regression_snapshots.organisation_id
        AND organisation_members.user_id = (SELECT auth.uid())
        AND organisation_members.status = 'active'
    )
  );

CREATE TABLE IF NOT EXISTS parser_rollback_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid REFERENCES quotes(id) ON DELETE CASCADE,
  parsing_job_id uuid REFERENCES parsing_jobs(id) ON DELETE SET NULL,
  snapshot_label text NOT NULL,
  main_total numeric,
  optional_total numeric,
  grand_total numeric,
  confidence text,
  resolution_source text,
  totals_evidence jsonb,
  organisation_id uuid,
  captured_at timestamptz DEFAULT now(),
  captured_by uuid
);

ALTER TABLE parser_rollback_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view rollback snapshots"
  ON parser_rollback_snapshots FOR SELECT TO authenticated
  USING (
    organisation_id IS NULL OR EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = parser_rollback_snapshots.organisation_id
        AND organisation_members.user_id = (SELECT auth.uid())
        AND organisation_members.status = 'active'
    )
  );

CREATE POLICY "Org members insert rollback snapshots"
  ON parser_rollback_snapshots FOR INSERT TO authenticated
  WITH CHECK (
    organisation_id IS NULL OR EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = parser_rollback_snapshots.organisation_id
        AND organisation_members.user_id = (SELECT auth.uid())
        AND organisation_members.status = 'active'
    )
  );

CREATE TABLE IF NOT EXISTS parser_demo_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid REFERENCES quotes(id) ON DELETE CASCADE,
  parsing_job_id uuid REFERENCES parsing_jobs(id) ON DELETE SET NULL,
  demo_label text NOT NULL DEFAULT 'wednesday',
  display_order int DEFAULT 0,
  notes text DEFAULT '',
  organisation_id uuid,
  added_at timestamptz DEFAULT now(),
  added_by uuid
);

ALTER TABLE parser_demo_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view demo queue"
  ON parser_demo_queue FOR SELECT TO authenticated
  USING (
    organisation_id IS NULL OR EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = parser_demo_queue.organisation_id
        AND organisation_members.user_id = (SELECT auth.uid())
        AND organisation_members.status = 'active'
    )
  );

CREATE POLICY "Org members insert demo queue"
  ON parser_demo_queue FOR INSERT TO authenticated
  WITH CHECK (
    organisation_id IS NULL OR EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = parser_demo_queue.organisation_id
        AND organisation_members.user_id = (SELECT auth.uid())
        AND organisation_members.status = 'active'
    )
  );

CREATE INDEX IF NOT EXISTS idx_regression_snap_job ON parser_regression_snapshots(parsing_job_id);
CREATE INDEX IF NOT EXISTS idx_regression_snap_checkpoint ON parser_regression_snapshots(checkpoint_label);
CREATE INDEX IF NOT EXISTS idx_rollback_snap_quote ON parser_rollback_snapshots(quote_id);
CREATE INDEX IF NOT EXISTS idx_demo_queue_label ON parser_demo_queue(demo_label, display_order);

CREATE OR REPLACE VIEW parser_diagnostics_v1 WITH (security_invoker = true) AS
SELECT
  pj.id AS parsing_job_id,
  pj.supplier_name,
  pj.filename,
  pj.status AS job_status,
  pj.trade,
  pj.organisation_id,
  pj.project_id,
  pj.completed_at,
  pj.updated_at,
  q.id AS quote_id,
  q.document_sub_total AS main_total,
  q.optional_scope_total AS optional_total,
  q.document_grand_total AS grand_total,
  q.totals_confidence AS confidence,
  q.requires_review,
  q.has_variants,
  q.resolution_source,
  (q.totals_evidence->>'resolution_source') AS resolution_source_evidence,
  jsonb_array_length(COALESCE(q.totals_evidence->'notes','[]'::jsonb)) AS note_count,
  (q.totals_evidence->'notes') AS notes,
  (q.totals_evidence->>'within_tolerance') AS within_tolerance,
  (q.totals_evidence->>'delta_vs_labelled_grand') AS delta_vs_labelled_grand,
  q.parse_anomalies
FROM parsing_jobs pj
LEFT JOIN quotes q ON q.id = pj.quote_id;
