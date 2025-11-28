/*
  # Add metadata column to parsing_chunks

  1. Changes
    - Add `metadata` JSONB column to `parsing_chunks` table
    - This will store LLM parsing metadata like quote totals, structure info, etc.

  2. Notes
    - Nullable column, defaults to null
    - No RLS changes needed (inherits from table)
*/

ALTER TABLE parsing_chunks 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;

COMMENT ON COLUMN parsing_chunks.metadata IS 'Metadata from LLM parsing (e.g., quoteTotalAmount, structure)';
