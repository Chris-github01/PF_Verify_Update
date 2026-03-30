/*
  # Add Carpentry Trade Module

  ## Summary
  Adds database support for the new Carpentry trade module, which handles a unique
  3-section quote structure: Carpentry, Plasterboard (GIB), and Insulation.

  ## New Tables

  ### carpentry_quote_summaries
  Stores the per-supplier quote summary for carpentry trade tenders.
  - Links to an existing quote via `quote_id`
  - Captures the three section subtotals (carpentry, plasterboard, insulation)
  - Records pricing model (lump_sum, unit_rate, hybrid)
  - Stores hourly rates and floor counts where applicable

  ### carpentry_line_items
  Stores individual line items from carpentry quotes broken into the three sections.
  - Each row belongs to a `carpentry_quote_summaries` entry
  - Records section (carpentry / plasterboard / insulation)
  - Supports wall type coding (W30–W36)
  - Supports GIB type (standard, aqualine, fyreline) and operation (supply, fixing, stopping)
  - Supports insulation type (pink_batts_wall, silencer_mid_floor, etc.)
  - Stores labour breakdown (rate, constant, hourly rate) alongside material and overall totals

  ## Security
  - RLS enabled on both tables
  - Access controlled via organisation_members join on the associated project's organisation
*/

CREATE TABLE IF NOT EXISTS carpentry_quote_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL,
  project_id uuid NOT NULL,
  organisation_id uuid NOT NULL,
  supplier_name text NOT NULL DEFAULT '',
  total_ex_gst numeric(14, 2) NOT NULL DEFAULT 0,
  total_inc_gst numeric(14, 2) NOT NULL DEFAULT 0,
  carpentry_subtotal numeric(14, 2) NOT NULL DEFAULT 0,
  plasterboard_subtotal numeric(14, 2) NOT NULL DEFAULT 0,
  insulation_subtotal numeric(14, 2) NOT NULL DEFAULT 0,
  pricing_model text NOT NULL DEFAULT 'lump_sum' CHECK (pricing_model IN ('lump_sum', 'unit_rate', 'hybrid')),
  hourly_rate_carpentry numeric(8, 2),
  hourly_rate_plasterboard numeric(8, 2),
  floor_count integer,
  wall_types_covered text[] NOT NULL DEFAULT '{}',
  raw_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE carpentry_quote_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view carpentry summaries in their org"
  ON carpentry_quote_summaries
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organisation_members om
      WHERE om.organisation_id = carpentry_quote_summaries.organisation_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

CREATE POLICY "Members can insert carpentry summaries in their org"
  ON carpentry_quote_summaries
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organisation_members om
      WHERE om.organisation_id = carpentry_quote_summaries.organisation_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

CREATE POLICY "Members can update carpentry summaries in their org"
  ON carpentry_quote_summaries
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organisation_members om
      WHERE om.organisation_id = carpentry_quote_summaries.organisation_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organisation_members om
      WHERE om.organisation_id = carpentry_quote_summaries.organisation_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

CREATE TABLE IF NOT EXISTS carpentry_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  summary_id uuid NOT NULL REFERENCES carpentry_quote_summaries(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL,
  project_id uuid NOT NULL,
  organisation_id uuid NOT NULL,
  section text NOT NULL CHECK (section IN ('carpentry', 'plasterboard', 'insulation')),
  description text NOT NULL DEFAULT '',
  wall_type text CHECK (wall_type IN ('W30','W31','W32','W33','W34','W35','W36','other')),
  gib_type text CHECK (gib_type IN ('standard','aqualine','fyreline','other')),
  gib_operation text CHECK (gib_operation IN ('supply','fixing','stopping')),
  insulation_type text CHECK (insulation_type IN ('pink_batts_wall','pink_batts_ceiling','silencer_mid_floor','polyester_wall','other')),
  quantity numeric(14, 4) NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT '',
  labour_rate numeric(10, 4),
  labour_constant numeric(10, 4),
  hourly_rate numeric(10, 2),
  labour_total numeric(14, 2),
  material_rate numeric(10, 4),
  material_total numeric(14, 2),
  overall_rate numeric(10, 4),
  overall_total numeric(14, 2) NOT NULL DEFAULT 0,
  level text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE carpentry_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view carpentry line items in their org"
  ON carpentry_line_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organisation_members om
      WHERE om.organisation_id = carpentry_line_items.organisation_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

CREATE POLICY "Members can insert carpentry line items in their org"
  ON carpentry_line_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organisation_members om
      WHERE om.organisation_id = carpentry_line_items.organisation_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

CREATE INDEX IF NOT EXISTS idx_carpentry_quote_summaries_quote_id
  ON carpentry_quote_summaries(quote_id);

CREATE INDEX IF NOT EXISTS idx_carpentry_quote_summaries_project_id
  ON carpentry_quote_summaries(project_id);

CREATE INDEX IF NOT EXISTS idx_carpentry_quote_summaries_organisation_id
  ON carpentry_quote_summaries(organisation_id);

CREATE INDEX IF NOT EXISTS idx_carpentry_line_items_summary_id
  ON carpentry_line_items(summary_id);

CREATE INDEX IF NOT EXISTS idx_carpentry_line_items_quote_id
  ON carpentry_line_items(quote_id);

CREATE INDEX IF NOT EXISTS idx_carpentry_line_items_project_id
  ON carpentry_line_items(project_id);

CREATE INDEX IF NOT EXISTS idx_carpentry_line_items_section
  ON carpentry_line_items(section);
