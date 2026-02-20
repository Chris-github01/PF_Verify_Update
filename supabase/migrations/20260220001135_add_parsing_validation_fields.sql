/*
  # Add Parsing Validation Fields
  
  1. Changes
    - Add `needs_review` boolean flag to quotes table
    - Add `missing_amount` decimal field to track parsing gaps
    - Add `document_total` field to store extracted Grand Total
    - Add `parsed_total` computed field for sum of items
    
  2. Purpose
    - Proper validation: show sum(items) as total, not fake it
    - If mismatch exists, mark needs_review = true
    - Expose parsing gaps instead of hiding them
*/

-- Add validation fields to quotes table
ALTER TABLE quotes 
  ADD COLUMN IF NOT EXISTS needs_review boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS missing_amount decimal(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS document_total decimal(15,2) DEFAULT NULL;

-- Add comment for clarity
COMMENT ON COLUMN quotes.needs_review IS 'True if sum(items) does not match document_total within tolerance';
COMMENT ON COLUMN quotes.missing_amount IS 'document_total - sum(items) when mismatch detected';
COMMENT ON COLUMN quotes.document_total IS 'Grand Total extracted from PDF (single source of truth for validation)';
