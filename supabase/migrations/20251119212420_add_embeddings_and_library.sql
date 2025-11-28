/*
  # Add embeddings support and library items table

  1. New Tables
    - `library_items`
      - `id` (uuid, primary key)
      - `organisation_id` (uuid, foreign key)
      - `description` (text)
      - `system_code` (text)
      - `trade` (text)
      - `unit` (text)
      - `typical_rate` (numeric)
      - `embedding` (vector(1536))
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Extensions
    - Enable pgvector extension for embeddings

  3. Indexes
    - Create HNSW index on embeddings for fast similarity search

  4. Functions
    - `match_library_items` - Find similar items using vector similarity

  5. Security
    - Enable RLS on library_items
    - Add policies for authenticated users
*/

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS library_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  description text NOT NULL,
  system_code text,
  trade text,
  unit text,
  typical_rate numeric(15, 2),
  embedding vector(1536),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE library_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view library items in their organisation"
  ON library_items FOR SELECT
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM organisation_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can insert library items"
  ON library_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE user_id = auth.uid()
      AND organisation_id = library_items.organisation_id
      AND role IN ('admin', 'owner')
    )
  );

CREATE POLICY "Admins can update library items"
  ON library_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE user_id = auth.uid()
      AND organisation_id = library_items.organisation_id
      AND role IN ('admin', 'owner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE user_id = auth.uid()
      AND organisation_id = library_items.organisation_id
      AND role IN ('admin', 'owner')
    )
  );

CREATE POLICY "Admins can delete library items"
  ON library_items FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE user_id = auth.uid()
      AND organisation_id = library_items.organisation_id
      AND role IN ('admin', 'owner')
    )
  );

CREATE INDEX IF NOT EXISTS library_items_organisation_id_idx ON library_items(organisation_id);
CREATE INDEX IF NOT EXISTS library_items_trade_idx ON library_items(trade);
CREATE INDEX IF NOT EXISTS library_items_system_code_idx ON library_items(system_code);

CREATE INDEX IF NOT EXISTS library_items_embedding_idx ON library_items
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

CREATE OR REPLACE FUNCTION match_library_items(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5,
  org_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  description text,
  system_code text,
  trade text,
  unit text,
  typical_rate numeric,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    library_items.id,
    library_items.description,
    library_items.system_code,
    library_items.trade,
    library_items.unit,
    library_items.typical_rate,
    1 - (library_items.embedding <=> query_embedding) AS similarity
  FROM library_items
  WHERE
    (org_id IS NULL OR library_items.organisation_id = org_id)
    AND library_items.embedding IS NOT NULL
    AND 1 - (library_items.embedding <=> query_embedding) >= match_threshold
  ORDER BY library_items.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

CREATE OR REPLACE FUNCTION update_library_item_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_library_items_updated_at
  BEFORE UPDATE ON library_items
  FOR EACH ROW
  EXECUTE FUNCTION update_library_item_updated_at();

COMMENT ON TABLE library_items IS 'Reference library of standard items with embeddings for similarity matching';
COMMENT ON COLUMN library_items.embedding IS 'Vector embedding for semantic similarity search';
COMMENT ON FUNCTION match_library_items IS 'Find similar library items using cosine similarity on embeddings';
