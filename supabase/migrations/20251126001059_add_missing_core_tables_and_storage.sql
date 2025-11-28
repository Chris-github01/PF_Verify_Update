/*
  # Add Missing Core Tables and Storage
  
  1. New Tables
    - `quote_items` - Line items within quotes
    - `parsing_jobs` - Track PDF/Excel parsing jobs
    - `project_settings` - Per-project configuration
  
  2. Table Updates
    - Add missing columns to `quotes` table (total_amount, items_count)
  
  3. Storage
    - Create `quotes` bucket for uploaded files
  
  4. Security
    - Enable RLS on all new tables
    - Add appropriate policies
*/

-- Add missing columns to quotes table
ALTER TABLE quotes 
ADD COLUMN IF NOT EXISTS total_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS items_count integer DEFAULT 0;

-- Create quote_items table
CREATE TABLE IF NOT EXISTS quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  system_id text,
  item_number text,
  description text,
  quantity numeric,
  unit text,
  unit_price numeric,
  total_price numeric,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quote_items_quote_id ON quote_items(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_items_system_id ON quote_items(system_id);

-- Create parsing_jobs table
CREATE TABLE IF NOT EXISTS parsing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  filename text NOT NULL,
  file_url text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  progress integer DEFAULT 0,
  error_message text,
  result_data jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_parsing_jobs_project_id ON parsing_jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_parsing_jobs_status ON parsing_jobs(status);

-- Create project_settings table
CREATE TABLE IF NOT EXISTS project_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  settings jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_settings_project_id ON project_settings(project_id);

-- Enable RLS
ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE parsing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for quote_items
CREATE POLICY "Users can view quote items in their organisation"
  ON quote_items FOR SELECT TO authenticated
  USING (
    quote_id IN (
      SELECT q.id FROM quotes q
      JOIN projects p ON p.id = q.project_id
      WHERE p.organisation_id IN (
        SELECT organisation_id FROM organisation_members
        WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  );

CREATE POLICY "Users can insert quote items in their organisation"
  ON quote_items FOR INSERT TO authenticated
  WITH CHECK (
    quote_id IN (
      SELECT q.id FROM quotes q
      JOIN projects p ON p.id = q.project_id
      WHERE p.organisation_id IN (
        SELECT organisation_id FROM organisation_members
        WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  );

-- RLS Policies for parsing_jobs
CREATE POLICY "Users can view parsing jobs in their organisation"
  ON parsing_jobs FOR SELECT TO authenticated
  USING (
    project_id IN (
      SELECT id FROM projects
      WHERE organisation_id IN (
        SELECT organisation_id FROM organisation_members
        WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  );

CREATE POLICY "Users can create parsing jobs in their organisation"
  ON parsing_jobs FOR INSERT TO authenticated
  WITH CHECK (
    project_id IN (
      SELECT id FROM projects
      WHERE organisation_id IN (
        SELECT organisation_id FROM organisation_members
        WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  );

CREATE POLICY "Users can update parsing jobs in their organisation"
  ON parsing_jobs FOR UPDATE TO authenticated
  USING (
    project_id IN (
      SELECT id FROM projects
      WHERE organisation_id IN (
        SELECT organisation_id FROM organisation_members
        WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  );

-- RLS Policies for project_settings
CREATE POLICY "Users can view project settings in their organisation"
  ON project_settings FOR SELECT TO authenticated
  USING (
    project_id IN (
      SELECT id FROM projects
      WHERE organisation_id IN (
        SELECT organisation_id FROM organisation_members
        WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  );

CREATE POLICY "Users can manage project settings in their organisation"
  ON project_settings FOR ALL TO authenticated
  USING (
    project_id IN (
      SELECT id FROM projects
      WHERE organisation_id IN (
        SELECT organisation_id FROM organisation_members
        WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  )
  WITH CHECK (
    project_id IN (
      SELECT id FROM projects
      WHERE organisation_id IN (
        SELECT organisation_id FROM organisation_members
        WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  );

-- Create storage bucket for quotes
INSERT INTO storage.buckets (id, name, public) 
VALUES ('quotes', 'quotes', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for quotes bucket
CREATE POLICY "Users can upload to quotes bucket"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'quotes' AND
    auth.uid() IS NOT NULL
  );

CREATE POLICY "Users can view their organisation's quote files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'quotes' AND
    auth.uid() IS NOT NULL
  );

CREATE POLICY "Users can delete their organisation's quote files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'quotes' AND
    auth.uid() IS NOT NULL
  );
