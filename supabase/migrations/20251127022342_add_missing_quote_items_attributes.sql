/*
  # Add Missing Quote Items Attributes

  1. Changes
    - Add `canonical_unit` column for normalized unit values
    - Add `size` column for extracted size attribute
    - Add `frr` column for Fire Resistance Rating
    - Add `service` column for service type
    - Add `subclass` column for item subclass/type
    - Add `material` column for material type
    - Add `confidence` column for data quality confidence score
    - Add `issues` column for tracking data quality issues
    - Add `system_label` column for human-readable system name
    - Add `system_confidence` column for system mapping confidence
    - Add `system_needs_review` column for flagging items needing review
    - Add `system_manual_override` column for tracking manual overrides
    - Add `matched_factors` column for storing matching factors
    - Add `missed_factors` column for storing missed factors
    - Add `is_excluded` column for marking excluded items
    - Add `raw_description` column for storing original description
    - Add `raw_unit` column for storing original unit
    - Add `normalized_description` column for cleaned description
    - Add `normalized_unit` column for cleaned unit
    - Add `mapped_service_type` column for mapped service type
    - Add `mapped_system` column for mapped system
    - Add `mapped_penetration` column for mapped penetration type
    - Add `mapping_confidence` column for mapping confidence score

  2. Notes
    - All columns are nullable to support gradual data migration
    - Default values are set where appropriate
*/

-- Add normalization and attribute extraction columns
ALTER TABLE quote_items
  ADD COLUMN IF NOT EXISTS canonical_unit text,
  ADD COLUMN IF NOT EXISTS size text,
  ADD COLUMN IF NOT EXISTS frr text,
  ADD COLUMN IF NOT EXISTS service text,
  ADD COLUMN IF NOT EXISTS subclass text,
  ADD COLUMN IF NOT EXISTS material text,
  ADD COLUMN IF NOT EXISTS confidence numeric,
  ADD COLUMN IF NOT EXISTS issues jsonb;

-- Add system mapping columns
ALTER TABLE quote_items
  ADD COLUMN IF NOT EXISTS system_label text,
  ADD COLUMN IF NOT EXISTS system_confidence numeric,
  ADD COLUMN IF NOT EXISTS system_needs_review boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS system_manual_override boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS matched_factors jsonb,
  ADD COLUMN IF NOT EXISTS missed_factors jsonb;

-- Add exclusion and raw data columns
ALTER TABLE quote_items
  ADD COLUMN IF NOT EXISTS is_excluded boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS raw_description text,
  ADD COLUMN IF NOT EXISTS raw_unit text,
  ADD COLUMN IF NOT EXISTS normalized_description text,
  ADD COLUMN IF NOT EXISTS normalized_unit text;

-- Add additional mapping columns
ALTER TABLE quote_items
  ADD COLUMN IF NOT EXISTS mapped_service_type text,
  ADD COLUMN IF NOT EXISTS mapped_system text,
  ADD COLUMN IF NOT EXISTS mapped_penetration text,
  ADD COLUMN IF NOT EXISTS mapping_confidence numeric;

-- Create indexes for commonly queried columns
CREATE INDEX IF NOT EXISTS idx_quote_items_system_id ON quote_items(system_id);
CREATE INDEX IF NOT EXISTS idx_quote_items_confidence ON quote_items(confidence);
CREATE INDEX IF NOT EXISTS idx_quote_items_system_needs_review ON quote_items(system_needs_review);
CREATE INDEX IF NOT EXISTS idx_quote_items_is_excluded ON quote_items(is_excluded);
