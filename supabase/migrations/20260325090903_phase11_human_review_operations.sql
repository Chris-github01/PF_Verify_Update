/*
  # Phase 11 – Human-in-the-Loop Review Operations

  ## Summary
  Six additive tables enabling a structured review workflow for plumbing_parser.
  Cases enter from predictive scoring, anomaly detection, regression failures, or
  manual admin action. Reviewers are assigned, record structured decisions, leave
  comments, and generate feedback that flows back into learning, regression, and
  predictive systems. Everything is audited. No live parser data is modified.

  ## New Tables

  ### parser_review_cases
  Core case entity. Linked to source document, optional anomaly, regression result,
  and risk profile. Carries priority, SLA deadline, and status through a controlled
  state machine (new → queued → assigned → in_review → awaiting_approval → completed
  or dismissed at any open state).

  ### parser_review_assignments
  One-per-case active assignment plus full history (active = false for past entries).
  Supports assign / reassign / unassign. All changes produce SLA events.

  ### parser_review_decisions
  Immutable decision records. Strict decision_type enum keeps decisions structured.
  Includes optional correction_payload_json and reviewer confidence score.

  ### parser_review_comments
  Flat chronological comments. Internal only. One author per comment.

  ### parser_review_sla_events
  Immutable log of SLA lifecycle events (created, assigned, reassigned, overdue,
  completed). Computed on-read for overdue state; events logged on assignment changes.

  ### parser_review_feedback
  Structured feedback candidates (rule_training, pattern_training,
  regression_case_candidate, routing_policy_candidate) generated from review
  decisions. Not auto-applied to production systems.

  ## Security
  - RLS enabled on all tables
  - Platform admins only (extensible to reviewer role later)

  ## Notes
  1. All additive — no existing tables modified
  2. IF NOT EXISTS / IF NOT EXISTS guards throughout
  3. Foreign key indexes included
*/

-- ─── parser_review_cases ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS parser_review_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL DEFAULT 'plumbing_parser',
  source_type text NOT NULL,
  source_id text NOT NULL,
  org_id text,
  run_id text,
  anomaly_id text,
  regression_case_result_id text,
  risk_profile_id uuid,
  case_origin text NOT NULL CHECK (case_origin IN ('predictive', 'anomaly', 'regression', 'manual')),
  case_status text NOT NULL DEFAULT 'new' CHECK (case_status IN ('new', 'queued', 'assigned', 'in_review', 'awaiting_approval', 'completed', 'dismissed')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  priority_explanation text NOT NULL DEFAULT '',
  sla_due_at timestamptz,
  context_summary text NOT NULL DEFAULT '',
  context_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  release_impact_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE parser_review_cases ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_prc_module_key   ON parser_review_cases(module_key);
CREATE INDEX IF NOT EXISTS idx_prc_case_status  ON parser_review_cases(case_status);
CREATE INDEX IF NOT EXISTS idx_prc_priority     ON parser_review_cases(priority);
CREATE INDEX IF NOT EXISTS idx_prc_org_id       ON parser_review_cases(org_id);
CREATE INDEX IF NOT EXISTS idx_prc_case_origin  ON parser_review_cases(case_origin);
CREATE INDEX IF NOT EXISTS idx_prc_sla_due_at   ON parser_review_cases(sla_due_at);
CREATE INDEX IF NOT EXISTS idx_prc_created_at   ON parser_review_cases(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prc_source_id    ON parser_review_cases(source_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_review_cases' AND policyname = 'Platform admins can select review cases') THEN
    CREATE POLICY "Platform admins can select review cases"
      ON parser_review_cases FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_review_cases' AND policyname = 'Platform admins can insert review cases') THEN
    CREATE POLICY "Platform admins can insert review cases"
      ON parser_review_cases FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_review_cases' AND policyname = 'Platform admins can update review cases') THEN
    CREATE POLICY "Platform admins can update review cases"
      ON parser_review_cases FOR UPDATE TO authenticated
      USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true))
      WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;

-- ─── parser_review_assignments ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS parser_review_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_case_id uuid NOT NULL REFERENCES parser_review_cases(id) ON DELETE CASCADE,
  assigned_to uuid NOT NULL REFERENCES auth.users(id),
  assigned_by uuid NOT NULL REFERENCES auth.users(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  unassigned_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  notes text NOT NULL DEFAULT ''
);

ALTER TABLE parser_review_assignments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pra_review_case_id ON parser_review_assignments(review_case_id);
CREATE INDEX IF NOT EXISTS idx_pra_assigned_to    ON parser_review_assignments(assigned_to);
CREATE INDEX IF NOT EXISTS idx_pra_active         ON parser_review_assignments(active);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_review_assignments' AND policyname = 'Platform admins can select review assignments') THEN
    CREATE POLICY "Platform admins can select review assignments"
      ON parser_review_assignments FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_review_assignments' AND policyname = 'Platform admins can insert review assignments') THEN
    CREATE POLICY "Platform admins can insert review assignments"
      ON parser_review_assignments FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_review_assignments' AND policyname = 'Platform admins can update review assignments') THEN
    CREATE POLICY "Platform admins can update review assignments"
      ON parser_review_assignments FOR UPDATE TO authenticated
      USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true))
      WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;

-- ─── parser_review_decisions ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS parser_review_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_case_id uuid NOT NULL REFERENCES parser_review_cases(id) ON DELETE CASCADE,
  decided_by uuid NOT NULL REFERENCES auth.users(id),
  decision_type text NOT NULL CHECK (decision_type IN (
    'confirm_shadow_better',
    'confirm_live_better',
    'needs_rule_change',
    'needs_manual_correction_pattern',
    'false_positive_alert',
    'false_negative_alert',
    'escalate',
    'dismiss'
  )),
  decision_summary text NOT NULL,
  decision_details_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  correction_payload_json jsonb,
  confidence_score numeric(3,1) CHECK (confidence_score >= 0 AND confidence_score <= 10),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE parser_review_decisions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_prd_review_case_id ON parser_review_decisions(review_case_id);
CREATE INDEX IF NOT EXISTS idx_prd_decided_by     ON parser_review_decisions(decided_by);
CREATE INDEX IF NOT EXISTS idx_prd_decision_type  ON parser_review_decisions(decision_type);
CREATE INDEX IF NOT EXISTS idx_prd_created_at     ON parser_review_decisions(created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_review_decisions' AND policyname = 'Platform admins can select review decisions') THEN
    CREATE POLICY "Platform admins can select review decisions"
      ON parser_review_decisions FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_review_decisions' AND policyname = 'Platform admins can insert review decisions') THEN
    CREATE POLICY "Platform admins can insert review decisions"
      ON parser_review_decisions FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;

-- ─── parser_review_comments ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS parser_review_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_case_id uuid NOT NULL REFERENCES parser_review_cases(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id),
  comment_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE parser_review_comments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_prcomm_review_case_id ON parser_review_comments(review_case_id);
CREATE INDEX IF NOT EXISTS idx_prcomm_author_id      ON parser_review_comments(author_id);
CREATE INDEX IF NOT EXISTS idx_prcomm_created_at     ON parser_review_comments(created_at ASC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_review_comments' AND policyname = 'Platform admins can select review comments') THEN
    CREATE POLICY "Platform admins can select review comments"
      ON parser_review_comments FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_review_comments' AND policyname = 'Platform admins can insert review comments') THEN
    CREATE POLICY "Platform admins can insert review comments"
      ON parser_review_comments FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;

-- ─── parser_review_sla_events ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS parser_review_sla_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_case_id uuid NOT NULL REFERENCES parser_review_cases(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('created', 'assigned', 'reassigned', 'overdue', 'completed')),
  event_time timestamptz NOT NULL DEFAULT now(),
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE parser_review_sla_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_prsla_review_case_id ON parser_review_sla_events(review_case_id);
CREATE INDEX IF NOT EXISTS idx_prsla_event_type     ON parser_review_sla_events(event_type);
CREATE INDEX IF NOT EXISTS idx_prsla_event_time     ON parser_review_sla_events(event_time DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_review_sla_events' AND policyname = 'Platform admins can select sla events') THEN
    CREATE POLICY "Platform admins can select sla events"
      ON parser_review_sla_events FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_review_sla_events' AND policyname = 'Platform admins can insert sla events') THEN
    CREATE POLICY "Platform admins can insert sla events"
      ON parser_review_sla_events FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;

-- ─── parser_review_feedback ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS parser_review_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_case_id uuid NOT NULL REFERENCES parser_review_cases(id) ON DELETE CASCADE,
  module_key text NOT NULL DEFAULT 'plumbing_parser',
  feedback_type text NOT NULL CHECK (feedback_type IN (
    'rule_training',
    'pattern_training',
    'regression_case_candidate',
    'routing_policy_candidate'
  )),
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  applied boolean NOT NULL DEFAULT false,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE parser_review_feedback ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_prf_review_case_id ON parser_review_feedback(review_case_id);
CREATE INDEX IF NOT EXISTS idx_prf_feedback_type  ON parser_review_feedback(feedback_type);
CREATE INDEX IF NOT EXISTS idx_prf_applied        ON parser_review_feedback(applied);
CREATE INDEX IF NOT EXISTS idx_prf_created_at     ON parser_review_feedback(created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_review_feedback' AND policyname = 'Platform admins can select review feedback') THEN
    CREATE POLICY "Platform admins can select review feedback"
      ON parser_review_feedback FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_review_feedback' AND policyname = 'Platform admins can insert review feedback') THEN
    CREATE POLICY "Platform admins can insert review feedback"
      ON parser_review_feedback FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parser_review_feedback' AND policyname = 'Platform admins can update review feedback') THEN
    CREATE POLICY "Platform admins can update review feedback"
      ON parser_review_feedback FOR UPDATE TO authenticated
      USING (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true))
      WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid() AND platform_admins.is_active = true));
  END IF;
END $$;
