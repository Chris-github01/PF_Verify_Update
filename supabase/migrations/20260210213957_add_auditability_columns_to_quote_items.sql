/*
  # Add Auditability Columns to Quote Items

  1. New Columns
    - `raw_text` (text) - Original text from PDF/quote for audit trail
    - `confidence` (numeric) - Confidence score from parser (0.0 to 1.0)
    - `source` (text) - Parser source (e.g., 'pdfplumber', 'llm_normalize', 'manual')
    - `validation_flags` (jsonb) - Array of validation warnings/flags

  2. Purpose
    - Enable reprocessing with updated models
    - Provide audit trail for extracted data
    - Support confidence-based filtering and review workflows
    - Track data quality and parser performance

  3. Notes
    - Columns are nullable to support existing data
    - Confidence defaults to 1.0 for manually entered items
    - Source defaults to 'legacy' for existing items
*/

-- Add auditability columns to quote_items
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quote_items' AND column_name = 'raw_text'
  ) THEN
    ALTER TABLE quote_items ADD COLUMN raw_text text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quote_items' AND column_name = 'confidence'
  ) THEN
    ALTER TABLE quote_items ADD COLUMN confidence numeric(3,2) DEFAULT 1.0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quote_items' AND column_name = 'source'
  ) THEN
    ALTER TABLE quote_items ADD COLUMN source text DEFAULT 'legacy';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quote_items' AND column_name = 'validation_flags'
  ) THEN
    ALTER TABLE quote_items ADD COLUMN validation_flags jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Add index on confidence for filtering low-confidence items
CREATE INDEX IF NOT EXISTS idx_quote_items_confidence 
  ON quote_items(confidence) 
  WHERE confidence IS NOT NULL AND confidence < 0.8;

-- Add index on source for analytics
CREATE INDEX IF NOT EXISTS idx_quote_items_source 
  ON quote_items(source) 
  WHERE source IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN quote_items.raw_text IS 'Original text from PDF/quote for audit trail and reprocessing';
COMMENT ON COLUMN quote_items.confidence IS 'Parser confidence score (0.0 to 1.0). Items below 0.6 should be reviewed.';
COMMENT ON COLUMN quote_items.source IS 'Parser source: pdfplumber, pymupdf, llm_detect, llm_normalize, manual, legacy';
COMMENT ON COLUMN quote_items.validation_flags IS 'Array of validation warnings: CALCULATED_TOTAL, MISMATCH, MISSING_DESCRIPTION, INVALID_QTY, etc.';
