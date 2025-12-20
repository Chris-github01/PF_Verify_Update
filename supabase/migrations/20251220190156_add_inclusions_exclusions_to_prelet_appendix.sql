/*
  # Add Inclusions and Exclusions to Pre-let Appendix

  1. Changes
    - Add `inclusions` column (jsonb array) for explicit scope inclusions
    - Add `exclusions` column (jsonb array) for explicit scope exclusions
    
  2. Notes
    - These are separate from contract_inclusions_exclusions table
    - Captures subcontractor-specific clarifications for pre-let minutes
*/

-- Add inclusions and exclusions columns
ALTER TABLE prelet_appendix
ADD COLUMN IF NOT EXISTS inclusions jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS exclusions jsonb DEFAULT '[]'::jsonb;