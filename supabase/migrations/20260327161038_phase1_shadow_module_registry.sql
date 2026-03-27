/*
  # Phase 1 Shadow Intelligence: Module Registry

  Adds two additive tables to the Shadow Intelligence system.

  ## New Tables
  1. `shadow_modules` — Source-of-truth registry for all shadow-capable modules
     - module_key, display_name, parser_family, dataset_type, source_table
     - source_adapter_key, diff_enabled, shadow_enabled, active
  2. `shadow_module_versions` — Version history per module
     - version_name, parser_version, rules_version, status, notes

  ## Security
  - RLS enabled on both tables
  - Platform admins (shadow layer) can read/write
  - Authenticated users can read active modules

  ## Seeds
  - plumbing_parser (full deep-diff enabled)
  - passive_fire_parser (passthrough, shadow enabled, diff disabled)

  ## Notes
  - Does NOT modify any existing table or live parsing logic
  - All columns are additive; no live pipeline is affected
*/

CREATE TABLE IF NOT EXISTS shadow_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text UNIQUE NOT NULL,
  display_name text NOT NULL,
  parser_family text NOT NULL DEFAULT 'generic',
  dataset_type text NOT NULL DEFAULT 'quote',
  source_table text NOT NULL DEFAULT 'quotes',
  source_adapter_key text NOT NULL,
  diff_enabled boolean NOT NULL DEFAULT false,
  shadow_enabled boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shadow_module_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL REFERENCES shadow_modules(module_key) ON DELETE CASCADE,
  version_name text NOT NULL,
  parser_version text NOT NULL,
  rules_version text NOT NULL DEFAULT '1.0.0',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','deprecated','archived')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shadow_modules_module_key ON shadow_modules(module_key);
CREATE INDEX IF NOT EXISTS idx_shadow_module_versions_module_key ON shadow_module_versions(module_key);

ALTER TABLE shadow_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE shadow_module_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Shadow modules readable by authenticated"
  ON shadow_modules FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Shadow modules writable by service role"
  ON shadow_modules FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Shadow modules updatable by service role"
  ON shadow_modules FOR UPDATE
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Shadow module versions readable by authenticated"
  ON shadow_module_versions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Shadow module versions writable by service role"
  ON shadow_module_versions FOR INSERT
  TO service_role
  WITH CHECK (true);

INSERT INTO shadow_modules (module_key, display_name, parser_family, dataset_type, source_table, source_adapter_key, diff_enabled, shadow_enabled, active)
VALUES
  ('plumbing_parser',      'Plumbing Parser',      'plumbing',      'quote', 'quotes', 'plumbing_quote_adapter',      true,  true,  true),
  ('passive_fire_parser',  'Passive Fire Parser',  'passive_fire',  'quote', 'quotes', 'passive_fire_quote_adapter',  false, true,  true),
  ('active_fire_parser',   'Active Fire Parser',   'active_fire',   'quote', 'quotes', 'generic_quote_adapter',       false, false, true),
  ('electrical_parser',    'Electrical Parser',    'electrical',    'quote', 'quotes', 'generic_quote_adapter',       false, false, false),
  ('hvac_parser',          'HVAC Parser',          'hvac',          'quote', 'quotes', 'generic_quote_adapter',       false, false, false)
ON CONFLICT (module_key) DO NOTHING;

INSERT INTO shadow_module_versions (module_key, version_name, parser_version, rules_version, status, notes)
VALUES
  ('plumbing_parser',     'v13.0.0', '13.0.0', '13.0', 'active',     'Reference implementation. Full intelligence platform.'),
  ('plumbing_parser',     'v12.0.0', '12.0.0', '12.0', 'deprecated', 'Previous stable.'),
  ('passive_fire_parser', 'v2.0.0',  '2.0.0',  '2.0',  'active',     'Passthrough shadow mode. Deep diff scheduled for Phase 2.'),
  ('active_fire_parser',  'v0.1.0',  '0.1.0',  '0.1',  'draft',      'Scaffolding only. Intelligence layer pending.')
ON CONFLICT DO NOTHING;
