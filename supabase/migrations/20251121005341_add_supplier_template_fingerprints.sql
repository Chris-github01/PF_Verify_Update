/*
  # Supplier Template Fingerprinting System
  
  1. New Tables
    - `supplier_template_fingerprints`
      - `id` (uuid, primary key)
      - `supplier_name` (text) - Name of the supplier/contractor
      - `template_hash` (text) - SHA-256 hash of first 2 pages
      - `template_name` (text) - Human-readable name
      - `column_positions` (jsonb) - Column positions {desc: 0, qty: 1, unit: 2, rate: 3, total: 4}
      - `header_patterns` (jsonb) - Known header text patterns
      - `footer_patterns` (jsonb) - Known footer/exclusion patterns
      - `page_structure` (jsonb) - Layout info (table regions, footer height, etc)
      - `confidence` (numeric) - How confident we are in this template
      - `usage_count` (integer) - How many times this template matched
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
      - `organisation_id` (uuid, FK) - Which org this template belongs to
      
  2. Security
    - Enable RLS on `supplier_template_fingerprints`
    - Users can read templates from their organization
    - Only authenticated users can add/update templates
*/

CREATE TABLE IF NOT EXISTS supplier_template_fingerprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_name text NOT NULL,
  template_hash text NOT NULL,
  template_name text,
  column_positions jsonb DEFAULT '{}'::jsonb,
  header_patterns jsonb DEFAULT '[]'::jsonb,
  footer_patterns jsonb DEFAULT '[]'::jsonb,
  page_structure jsonb DEFAULT '{}'::jsonb,
  confidence numeric DEFAULT 0.8,
  usage_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  organisation_id uuid REFERENCES organisations(id) ON DELETE CASCADE,
  
  UNIQUE(template_hash, organisation_id)
);

ALTER TABLE supplier_template_fingerprints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read templates from their org"
  ON supplier_template_fingerprints
  FOR SELECT
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert templates for their org"
  ON supplier_template_fingerprints
  FOR INSERT
  TO authenticated
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update templates from their org"
  ON supplier_template_fingerprints
  FOR UPDATE
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members WHERE user_id = auth.uid()
    )
  );

CREATE INDEX idx_supplier_template_hash ON supplier_template_fingerprints(template_hash);
CREATE INDEX idx_supplier_template_org ON supplier_template_fingerprints(organisation_id);
CREATE INDEX idx_supplier_template_name ON supplier_template_fingerprints(supplier_name);
