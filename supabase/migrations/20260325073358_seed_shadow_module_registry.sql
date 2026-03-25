/*
  # Seed Shadow Admin Module Registry

  Seeds the module_registry and module_versions tables with all core platform modules
  that are candidates for shadow testing and versioned rollout.

  1. New Rows
    - module_registry: 12 core modules covering parsers, classifiers, scoring, exports, and workflow
    - module_versions: one version row per module, all starting at v1 / live_only status

  2. Module List
    - passive_fire_parser   — Passive fire quote PDF/XLSX parser
    - plumbing_parser       — Plumbing trade quote parser
    - hvac_parser           — HVAC trade quote parser
    - electrical_parser     — Electrical trade quote parser
    - fire_schedule_parser  — Fire engineer schedule extractor
    - scope_classifier      — Scope item classifier / service-type tagger
    - award_scoring         — Award report weighted scoring engine
    - equalisation_engine   — Quote equalisation and consensus quantity logic
    - boq_generator         — BOQ generation from scope matrix
    - contract_export       — Contract Manager PDF export pipeline
    - comparison_engine     — Multi-quote item comparison engine
    - frr_classifier        — FRR compliance classification rules

  3. Notes
    - All modules start as live_only with live_version = 'v1'
    - is_shadow_enabled = true means shadow routing is available but not yet active
    - No RLS changes — tables already have RLS configured from prior migration
*/

INSERT INTO module_registry (id, module_key, module_name, module_type, description, is_shadow_enabled)
VALUES
  (gen_random_uuid(), 'passive_fire_parser',  'Passive Fire Parser',          'parser',     'Parses passive fire trade quotes from PDF and XLSX. Applies FRR/substrate/service signal detection.', true),
  (gen_random_uuid(), 'plumbing_parser',      'Plumbing Parser',              'parser',     'Parses plumbing trade quotes. Handles level-based lump sum and itemised rate formats.',               true),
  (gen_random_uuid(), 'hvac_parser',          'HVAC Parser',                  'parser',     'Parses HVAC/mechanical trade quotes across multiple sub-trade formats.',                              true),
  (gen_random_uuid(), 'electrical_parser',    'Electrical Parser',            'parser',     'Parses electrical trade quotes including high/low voltage and data.',                                 true),
  (gen_random_uuid(), 'fire_schedule_parser', 'Fire Schedule Parser',         'parser',     'Extracts structured items from fire engineer passive fire schedules (PDF/table format).',            true),
  (gen_random_uuid(), 'scope_classifier',     'Scope Classifier',             'classifier', 'Classifies parsed quote items into scope systems and service types.',                                 true),
  (gen_random_uuid(), 'award_scoring',        'Award Scoring Engine',         'scoring',    'Computes weighted scores for award report supplier ranking across coverage, price, and quality.',     true),
  (gen_random_uuid(), 'equalisation_engine',  'Equalisation Engine',          'workflow',   'Consensus quantity calculation and quote equalisation across multiple tenderers.',                    true),
  (gen_random_uuid(), 'boq_generator',        'BOQ Generator',                'workflow',   'Generates Bill of Quantities from scope matrix mappings and equalised quantities.',                   true),
  (gen_random_uuid(), 'contract_export',      'Contract Export Pipeline',     'export',     'Generates Contract Manager PDF including prelet appendix, inclusions/exclusions, and allowances.',    true),
  (gen_random_uuid(), 'comparison_engine',    'Comparison Engine',            'scoring',    'Multi-quote line-item comparison against model rates with variance flagging.',                        true),
  (gen_random_uuid(), 'frr_classifier',       'FRR Compliance Classifier',    'classifier', 'Classifies quote items against FRR compliance rules. Populates frr_compliant and frr_rating fields.',true)
ON CONFLICT DO NOTHING;

INSERT INTO module_versions (id, module_key, live_version, shadow_version, promoted_candidate_version, rollback_version, rollout_status, updated_at)
SELECT
  gen_random_uuid(),
  module_key,
  'v1',
  null,
  null,
  null,
  'live_only',
  now()
FROM module_registry
ON CONFLICT DO NOTHING;
