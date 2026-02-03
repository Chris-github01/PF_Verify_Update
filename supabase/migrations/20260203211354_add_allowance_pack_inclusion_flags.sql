/*
  # Add Allowance Pack Inclusion Flags

  1. Changes to contract_allowances table
    - Add include_in_prelet_appendix (boolean, default true)
    - Add include_in_site_handover (boolean, default true)
    - Add include_in_senior_mgmt_pack (boolean, default true)

    These flags control whether each allowance appears in:
    - Prelet Appendix PDF
    - Site Handover PDF
    - Senior Management Pack PDF

  2. Migration Strategy
    - Add columns with default TRUE for backward compatibility
    - Backfill all existing records with TRUE (no regression)
    - This ensures existing allowances continue to appear in all packs

  3. Security
    - No RLS changes required (inherits from contract_allowances policies)

  4. Acceptance Criteria
    - Existing allowances default to included in all packs
    - New allowances default to included in all packs
    - Users can toggle individual checkboxes per allowance per pack
*/

-- Add inclusion flag columns (all default to TRUE for safe backward compatibility)
ALTER TABLE contract_allowances
ADD COLUMN IF NOT EXISTS include_in_prelet_appendix boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS include_in_site_handover boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS include_in_senior_mgmt_pack boolean NOT NULL DEFAULT true;

-- Backfill existing records to TRUE (ensure no regression)
UPDATE contract_allowances
SET
  include_in_prelet_appendix = true,
  include_in_site_handover = true,
  include_in_senior_mgmt_pack = true
WHERE
  include_in_prelet_appendix IS NULL
  OR include_in_site_handover IS NULL
  OR include_in_senior_mgmt_pack IS NULL;

-- Add index for faster PDF generation queries
CREATE INDEX IF NOT EXISTS idx_contract_allowances_prelet_inclusion
ON contract_allowances(project_id, include_in_prelet_appendix)
WHERE include_in_prelet_appendix = true;

CREATE INDEX IF NOT EXISTS idx_contract_allowances_handover_inclusion
ON contract_allowances(project_id, include_in_site_handover)
WHERE include_in_site_handover = true;

CREATE INDEX IF NOT EXISTS idx_contract_allowances_senior_inclusion
ON contract_allowances(project_id, include_in_senior_mgmt_pack)
WHERE include_in_senior_mgmt_pack = true;
