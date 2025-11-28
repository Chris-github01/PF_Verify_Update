/*
  # Create parsing_chunks table
  
  This table stores chunks of parsed data from large PDF/Excel files for incremental processing.
  
  ## New Tables
  1. `parsing_chunks`
    - `id` (uuid, primary key)
    - `job_id` (uuid, foreign key to parsing_jobs)
    - `chunk_number` (integer) - sequential chunk number
    - `total_chunks` (integer) - total number of chunks for the job
    - `chunk_text` (text) - raw text content of this chunk
    - `parsed_items` (jsonb) - parsed line items from this chunk
    - `status` (text) - 'pending', 'processing', 'completed', 'failed'
    - `error_message` (text) - error details if failed
    - `metadata` (jsonb) - additional metadata from parsing
    - `created_at` (timestamptz)
    - `updated_at` (timestamptz)
  
  ## Security
  - Enable RLS on parsing_chunks
  - Users can view chunks for jobs in their organisation
  - Service role can manage all chunks
  
  ## Indexes
  - Index on job_id for efficient chunk lookup
  - Index on status for monitoring failed chunks
*/

-- Create parsing_chunks table
CREATE TABLE IF NOT EXISTS parsing_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES parsing_jobs(id) ON DELETE CASCADE,
  chunk_number integer NOT NULL,
  total_chunks integer NOT NULL,
  chunk_text text,
  parsed_items jsonb,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message text,
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(job_id, chunk_number)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_parsing_chunks_job_id ON parsing_chunks(job_id);
CREATE INDEX IF NOT EXISTS idx_parsing_chunks_status ON parsing_chunks(status);
CREATE INDEX IF NOT EXISTS idx_parsing_chunks_job_chunk ON parsing_chunks(job_id, chunk_number);

-- Enable RLS
ALTER TABLE parsing_chunks ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view chunks for jobs in their organisation"
  ON parsing_chunks FOR SELECT
  TO authenticated
  USING (
    job_id IN (
      SELECT pj.id FROM parsing_jobs pj
      JOIN projects p ON p.id = pj.project_id
      WHERE p.organisation_id IN (
        SELECT organisation_id FROM organisation_members
        WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  );

CREATE POLICY "Users can insert chunks for jobs in their organisation"
  ON parsing_chunks FOR INSERT
  TO authenticated
  WITH CHECK (
    job_id IN (
      SELECT pj.id FROM parsing_jobs pj
      JOIN projects p ON p.id = pj.project_id
      WHERE p.organisation_id IN (
        SELECT organisation_id FROM organisation_members
        WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  );

CREATE POLICY "Users can update chunks for jobs in their organisation"
  ON parsing_chunks FOR UPDATE
  TO authenticated
  USING (
    job_id IN (
      SELECT pj.id FROM parsing_jobs pj
      JOIN projects p ON p.id = pj.project_id
      WHERE p.organisation_id IN (
        SELECT organisation_id FROM organisation_members
        WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  );

COMMENT ON TABLE parsing_chunks IS 'Stores chunks of parsed data for incremental processing of large files';
