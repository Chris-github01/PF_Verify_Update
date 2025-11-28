/*
  # Add quote_id to parsing_jobs table

  1. Changes
    - Add `quote_id` column to `parsing_jobs` table to link completed jobs to created quotes
    - Add foreign key constraint to `quotes` table
    - Add index for faster lookups
*/

-- Add quote_id column
ALTER TABLE parsing_jobs 
ADD COLUMN IF NOT EXISTS quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_parsing_jobs_quote_id ON parsing_jobs(quote_id);
