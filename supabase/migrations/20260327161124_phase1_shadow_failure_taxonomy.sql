/*
  # Phase 1 Shadow Intelligence: Failure Taxonomy

  Standardizes all parser/comparison failures into a reusable classification library.

  ## New Tables
  1. `shadow_failure_types` — Master failure type definitions
     - failure_code (unique), title, description, severity, business_impact_type, active
  2. `shadow_run_failures` — Per-run failure instances
     - run_id, failure_code, severity, confidence (0–1), financial_impact_estimate, notes

  ## Seeds
  14 seeded failure types covering all major parser failure modes.

  ## Notes
  - Does NOT modify shadow_runs or any production table
  - shadow_run_failures are attached to shadow runs only
  - Severity: info=1, low=2, medium=5, high=10, critical=20
*/

CREATE TABLE IF NOT EXISTS shadow_failure_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  failure_code text UNIQUE NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('info','low','medium','high','critical')),
  business_impact_type text NOT NULL DEFAULT 'accuracy',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shadow_run_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  failure_code text NOT NULL REFERENCES shadow_failure_types(failure_code) ON DELETE RESTRICT,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('info','low','medium','high','critical')),
  confidence numeric(4,3) NOT NULL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  financial_impact_estimate numeric(14,2),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shadow_failure_types_code ON shadow_failure_types(failure_code);
CREATE INDEX IF NOT EXISTS idx_shadow_run_failures_run_id ON shadow_run_failures(run_id);
CREATE INDEX IF NOT EXISTS idx_shadow_run_failures_code ON shadow_run_failures(failure_code);

ALTER TABLE shadow_failure_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE shadow_run_failures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Shadow failure types readable by authenticated"
  ON shadow_failure_types FOR SELECT TO authenticated USING (true);

CREATE POLICY "Shadow failure types writable by service role"
  ON shadow_failure_types FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "Shadow run failures readable by authenticated"
  ON shadow_run_failures FOR SELECT TO authenticated USING (true);

CREATE POLICY "Shadow run failures insertable by authenticated"
  ON shadow_run_failures FOR INSERT TO authenticated WITH CHECK (true);

INSERT INTO shadow_failure_types (failure_code, title, description, severity, business_impact_type) VALUES
  ('total_extraction_failure',          'Total Extraction Failure',         'Parser could not extract a document total with sufficient confidence.',                             'critical', 'completeness'),
  ('systemic_failure',                  'Systemic Parser Failure',          'Parser failed across a high proportion of items in a systematic pattern.',                         'critical', 'accuracy'),
  ('parser_disagreement',               'Live vs Shadow Disagreement',      'Live and shadow parsers produced materially different outputs.',                                    'high',     'reliability'),
  ('line_item_merge_failure',           'Line Item Merge Failure',          'Related line items were merged incorrectly, reducing the item count.',                             'medium',   'accuracy'),
  ('line_item_split_failure',           'Line Item Split Failure',          'A single line item was split into multiple items incorrectly.',                                     'medium',   'accuracy'),
  ('duplicate_line_extraction',         'Duplicate Line Extraction',        'The same physical line item was extracted more than once.',                                         'high',     'accuracy'),
  ('underparse',                        'Underparse',                       'Parser captured significantly fewer items or lower value than document total implies.',             'high',     'completeness'),
  ('overparse',                         'Overparse',                        'Parser captured more value than expected, likely including summary or total rows as items.',         'high',     'accuracy'),
  ('optional_item_inclusion_error',     'Optional Item Inclusion Error',    'An optional or provisional item was incorrectly included in or excluded from the parsed total.',    'medium',   'accuracy'),
  ('qualification_detection_failure',   'Qualification Detection Failure',  'A supplier qualification, exclusion, or condition was not detected or was misclassified.',         'medium',   'risk'),
  ('section_boundary_error',            'Section Boundary Error',           'Parser incorrectly determined where a section starts or ends, causing cross-section bleed.',        'medium',   'accuracy'),
  ('gst_misclassification',             'GST Misclassification',            'GST was included or excluded incorrectly, causing a pricing error.',                                'high',     'financial'),
  ('provisional_sum_misclassification', 'Provisional Sum Misclassification','A provisional sum was treated as a firm price item, or vice versa.',                               'medium',   'financial'),
  ('rate_vs_lump_sum_misread',          'Rate vs Lump Sum Misread',         'A rate-based item was read as a lump sum (or reverse), causing a total miscalculation.',           'high',     'financial')
ON CONFLICT (failure_code) DO NOTHING;
