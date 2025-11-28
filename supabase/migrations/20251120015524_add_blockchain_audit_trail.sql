/*
  # Blockchain Audit Trail System

  ## Overview
  Adds immutable audit trail for quotes and reports using blockchain/ICP integration.

  ## New Tables
  
  ### `blockchain_records`
  Stores cryptographic hashes and blockchain references for immutable audit trail:
  - `id` (uuid, primary key) - Unique record identifier
  - `entity_type` (text) - Type of entity (quote_upload, quote_finalized, report_generated, award_decision)
  - `entity_id` (uuid) - ID of the entity being recorded
  - `content_hash` (text) - SHA-256 hash of the content
  - `blockchain_tx_id` (text, nullable) - Blockchain/ICP transaction ID
  - `blockchain_status` (text) - Status: pending, confirmed, failed
  - `metadata` (jsonb) - Additional metadata (file_name, user_id, organisation_id, etc.)
  - `created_at` (timestamptz) - When record was created
  - `confirmed_at` (timestamptz, nullable) - When blockchain confirmation received

  ## Security
  - RLS enabled on all tables
  - Users can only view records for their organisation
  - Only authenticated users can create records
  - Records are immutable (no updates or deletes allowed)

  ## Indexes
  - Index on entity_type and entity_id for fast lookups
  - Index on content_hash for verification
  - Index on blockchain_tx_id for blockchain queries
*/

-- Create blockchain_records table
CREATE TABLE IF NOT EXISTS blockchain_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('quote_upload', 'quote_finalized', 'report_generated', 'award_decision', 'contract_signed')),
  entity_id uuid NOT NULL,
  content_hash text NOT NULL,
  blockchain_tx_id text,
  blockchain_status text NOT NULL DEFAULT 'pending' CHECK (blockchain_status IN ('pending', 'confirmed', 'failed')),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  confirmed_at timestamptz
);

-- Add comment
COMMENT ON TABLE blockchain_records IS 'Immutable audit trail with blockchain verification for quotes and reports';
COMMENT ON COLUMN blockchain_records.content_hash IS 'SHA-256 hash of the entity content for verification';
COMMENT ON COLUMN blockchain_records.blockchain_tx_id IS 'Transaction ID on blockchain/ICP for immutable proof';
COMMENT ON COLUMN blockchain_records.metadata IS 'Additional context: file_name, user_id, organisation_id, project_id';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_blockchain_records_entity ON blockchain_records(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_blockchain_records_hash ON blockchain_records(content_hash);
CREATE INDEX IF NOT EXISTS idx_blockchain_records_tx_id ON blockchain_records(blockchain_tx_id) WHERE blockchain_tx_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_blockchain_records_created_at ON blockchain_records(created_at DESC);

-- Enable RLS
ALTER TABLE blockchain_records ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view blockchain records for their organisation"
  ON blockchain_records
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.user_id = auth.uid()
      AND organisation_members.organisation_id::text = (metadata->>'organisation_id')
      AND organisation_members.status = 'active'
    )
  );

CREATE POLICY "Authenticated users can insert blockchain records"
  ON blockchain_records
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.user_id = auth.uid()
      AND organisation_members.organisation_id::text = (metadata->>'organisation_id')
      AND organisation_members.status = 'active'
    )
  );

-- No update or delete policies - records are immutable

-- Add blockchain_record_id to quotes table for easy reference
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotes' AND column_name = 'blockchain_record_id'
  ) THEN
    ALTER TABLE quotes ADD COLUMN blockchain_record_id uuid REFERENCES blockchain_records(id);
    COMMENT ON COLUMN quotes.blockchain_record_id IS 'Reference to blockchain audit record for this quote';
  END IF;
END $$;

-- Add blockchain_record_id to award_reports table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'award_reports' AND column_name = 'blockchain_record_id'
  ) THEN
    ALTER TABLE award_reports ADD COLUMN blockchain_record_id uuid REFERENCES blockchain_records(id);
    COMMENT ON COLUMN award_reports.blockchain_record_id IS 'Reference to blockchain audit record for this report';
  END IF;
END $$;

-- Create function to generate content hash
CREATE OR REPLACE FUNCTION generate_content_hash(content jsonb)
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN encode(digest(content::text, 'sha256'), 'hex');
END;
$$;

-- Create function to get blockchain verification status
CREATE OR REPLACE FUNCTION get_blockchain_verification(entity_type_param text, entity_id_param uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'is_verified', blockchain_status = 'confirmed',
    'hash', content_hash,
    'tx_id', blockchain_tx_id,
    'status', blockchain_status,
    'created_at', created_at,
    'confirmed_at', confirmed_at
  ) INTO result
  FROM blockchain_records
  WHERE entity_type = entity_type_param
  AND entity_id = entity_id_param
  ORDER BY created_at DESC
  LIMIT 1;

  RETURN COALESCE(result, '{"is_verified": false}'::jsonb);
END;
$$;
