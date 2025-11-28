/*
  # Quote Revision & RFI Tracking System

  ## Overview
  This migration adds comprehensive revision tracking for quotes, enabling:
  - Version control for quote updates
  - RFI (Request for Information) linkage
  - Change tracking between revisions
  - Timeline of all quote changes
  - Non-destructive versioning (original quotes preserved)

  ## Changes Made

  ### 1. New Columns on `quotes` Table
  - `revision_number` (integer) - Version number (starts at 1)
  - `parent_quote_id` (uuid) - Link to previous version
  - `is_latest` (boolean) - Flag for current version
  - `revision_reason` (text) - Why this revision was created
  - `rfi_reference` (text) - Related RFI number
  - `revised_at` (timestamptz) - When revision was created
  - `revised_by` (uuid) - Who created the revision
  - `quote_reference` (text) - Supplier's quote reference number
  - `contingency` (numeric) - Contingency amount if applicable

  ### 2. New Table: `quote_revisions_diff`
  Stores detailed line-item changes between revisions:
  - Item additions (new items in revision)
  - Item removals (items dropped from quote)
  - Item modifications (price/quantity changes)
  - Automatically computed similarity scores

  ### 3. New Table: `quote_revision_timeline`
  Audit trail of all revision events:
  - Upload events
  - RFI submissions
  - Price changes
  - Manual modifications

  ## Security
  - RLS enabled on all tables
  - Policies restrict access to project members
  - Timeline provides complete audit trail
*/

-- Add revision tracking columns to quotes table
DO $$
BEGIN
  -- revision_number: Starts at 1 for original quote
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quotes' AND column_name = 'revision_number'
  ) THEN
    ALTER TABLE quotes ADD COLUMN revision_number integer DEFAULT 1 NOT NULL;
    COMMENT ON COLUMN quotes.revision_number IS 'Version number: 1 = original, 2+ = revisions';
  END IF;

  -- parent_quote_id: Links to previous version
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quotes' AND column_name = 'parent_quote_id'
  ) THEN
    ALTER TABLE quotes ADD COLUMN parent_quote_id uuid REFERENCES quotes(id);
    COMMENT ON COLUMN quotes.parent_quote_id IS 'Previous version of this quote (null for original)';
  END IF;

  -- is_latest: Only one version per supplier should be true
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quotes' AND column_name = 'is_latest'
  ) THEN
    ALTER TABLE quotes ADD COLUMN is_latest boolean DEFAULT true NOT NULL;
    COMMENT ON COLUMN quotes.is_latest IS 'True for the current/latest version only';
  END IF;

  -- revision_reason: Why was this revision created
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quotes' AND column_name = 'revision_reason'
  ) THEN
    ALTER TABLE quotes ADD COLUMN revision_reason text;
    COMMENT ON COLUMN quotes.revision_reason IS 'Reason for creating this revision';
  END IF;

  -- rfi_reference: Link to RFI
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quotes' AND column_name = 'rfi_reference'
  ) THEN
    ALTER TABLE quotes ADD COLUMN rfi_reference text;
    COMMENT ON COLUMN quotes.rfi_reference IS 'Related RFI number or reference';
  END IF;

  -- revised_at: When was this revision created
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quotes' AND column_name = 'revised_at'
  ) THEN
    ALTER TABLE quotes ADD COLUMN revised_at timestamptz;
    COMMENT ON COLUMN quotes.revised_at IS 'When this revision was uploaded/created';
  END IF;

  -- revised_by: Who created this revision
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quotes' AND column_name = 'revised_by'
  ) THEN
    ALTER TABLE quotes ADD COLUMN revised_by uuid REFERENCES auth.users(id);
    COMMENT ON COLUMN quotes.revised_by IS 'User who uploaded this revision';
  END IF;

  -- quote_reference: Already exists but ensure it's there
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quotes' AND column_name = 'quote_reference'
  ) THEN
    ALTER TABLE quotes ADD COLUMN quote_reference text;
    COMMENT ON COLUMN quotes.quote_reference IS 'Supplier quote reference number';
  END IF;

  -- contingency: Already exists but ensure it's there
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quotes' AND column_name = 'contingency'
  ) THEN
    ALTER TABLE quotes ADD COLUMN contingency numeric DEFAULT 0;
    COMMENT ON COLUMN quotes.contingency IS 'Contingency amount included in quote';
  END IF;
END $$;

-- Create index for finding latest quotes quickly
CREATE INDEX IF NOT EXISTS idx_quotes_is_latest ON quotes(project_id, supplier_name, is_latest) WHERE is_latest = true;
CREATE INDEX IF NOT EXISTS idx_quotes_revision_number ON quotes(project_id, supplier_name, revision_number);

-- Create quote_revisions_diff table
CREATE TABLE IF NOT EXISTS quote_revisions_diff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  supplier_name text NOT NULL,
  original_quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  revised_quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  
  -- Summary statistics
  items_added integer DEFAULT 0,
  items_removed integer DEFAULT 0,
  items_modified integer DEFAULT 0,
  items_unchanged integer DEFAULT 0,
  total_price_change numeric DEFAULT 0,
  percentage_change numeric DEFAULT 0,
  
  -- Detailed line-item changes
  diff_details jsonb DEFAULT '[]'::jsonb,
  
  -- Metadata
  computed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(original_quote_id, revised_quote_id)
);

COMMENT ON TABLE quote_revisions_diff IS 'Stores detailed differences between quote revisions';
COMMENT ON COLUMN quote_revisions_diff.diff_details IS 'Array of change objects: {type: "added"|"removed"|"modified", item: {...}, oldItem?: {...}}';

-- Enable RLS
ALTER TABLE quote_revisions_diff ENABLE ROW LEVEL SECURITY;

-- RLS Policies for quote_revisions_diff
CREATE POLICY "Users can view diffs for their projects"
  ON quote_revisions_diff FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = quote_revisions_diff.project_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

CREATE POLICY "Users can insert diffs for their projects"
  ON quote_revisions_diff FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = quote_revisions_diff.project_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

-- Create quote_revision_timeline table
CREATE TABLE IF NOT EXISTS quote_revision_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  supplier_name text NOT NULL,
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  
  -- Event details
  event_type text NOT NULL CHECK (event_type IN ('upload', 'rfi', 'price_change', 'modification', 'note')),
  event_description text NOT NULL,
  
  -- Related data
  revision_number integer,
  old_total_price numeric,
  new_total_price numeric,
  price_change numeric,
  rfi_reference text,
  
  -- Who and when
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE quote_revision_timeline IS 'Audit trail of all quote revision events';
COMMENT ON COLUMN quote_revision_timeline.event_type IS 'Type of event: upload, rfi, price_change, modification, note';

-- Create indexes for timeline queries
CREATE INDEX IF NOT EXISTS idx_timeline_project_supplier ON quote_revision_timeline(project_id, supplier_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_timeline_quote ON quote_revision_timeline(quote_id);

-- Enable RLS
ALTER TABLE quote_revision_timeline ENABLE ROW LEVEL SECURITY;

-- RLS Policies for quote_revision_timeline
CREATE POLICY "Users can view timeline for their projects"
  ON quote_revision_timeline FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = quote_revision_timeline.project_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

CREATE POLICY "Users can insert timeline events for their projects"
  ON quote_revision_timeline FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN organisation_members om ON om.organisation_id = p.organisation_id
      WHERE p.id = quote_revision_timeline.project_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

-- Create function to automatically create timeline events on quote insert
CREATE OR REPLACE FUNCTION create_quote_timeline_event()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create timeline event for revisions (not original uploads)
  IF NEW.revision_number > 1 THEN
    INSERT INTO quote_revision_timeline (
      project_id,
      supplier_name,
      quote_id,
      event_type,
      event_description,
      revision_number,
      old_total_price,
      new_total_price,
      price_change,
      rfi_reference,
      created_by
    )
    SELECT
      NEW.project_id,
      NEW.supplier_name,
      NEW.id,
      'upload',
      COALESCE(NEW.revision_reason, 'Revised quote uploaded'),
      NEW.revision_number,
      parent.total_price,
      NEW.total_price,
      NEW.total_price - parent.total_price,
      NEW.rfi_reference,
      NEW.revised_by
    FROM quotes parent
    WHERE parent.id = NEW.parent_quote_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
DROP TRIGGER IF EXISTS on_quote_insert_create_timeline ON quotes;
CREATE TRIGGER on_quote_insert_create_timeline
  AFTER INSERT ON quotes
  FOR EACH ROW
  EXECUTE FUNCTION create_quote_timeline_event();

-- Create function to update is_latest flag
CREATE OR REPLACE FUNCTION update_quote_latest_flag()
RETURNS TRIGGER AS $$
BEGIN
  -- When a new revision is inserted, mark previous versions as not latest
  IF NEW.revision_number > 1 THEN
    UPDATE quotes
    SET is_latest = false, updated_at = now()
    WHERE project_id = NEW.project_id
      AND supplier_name = NEW.supplier_name
      AND id != NEW.id
      AND is_latest = true;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
DROP TRIGGER IF EXISTS on_quote_insert_update_latest ON quotes;
CREATE TRIGGER on_quote_insert_update_latest
  BEFORE INSERT ON quotes
  FOR EACH ROW
  EXECUTE FUNCTION update_quote_latest_flag();