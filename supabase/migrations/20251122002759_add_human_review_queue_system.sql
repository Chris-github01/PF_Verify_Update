/*
  # Add Human Review Queue System

  ## Overview
  Creates a review queue system for routing low-confidence quote items to human reviewers.
  Items with confidence <75% or other quality issues are automatically flagged for review.

  ## New Table: review_queue
  Tracks all items requiring human review with assignment and resolution tracking.

  ## Features
  - Auto-population from confidence scores
  - Assignment to reviewers
  - Resolution tracking with before/after values
  - Multiple issue type support
  - Workflow status management

  ## Security
  - RLS enabled for organisation-level isolation
  - Only organisation members can view their queue
  - Audit trail of corrections
*/

-- Create review_queue table
CREATE TABLE IF NOT EXISTS review_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_item_id uuid NOT NULL REFERENCES quote_items(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  
  -- Issue classification
  issue_type text NOT NULL CHECK (issue_type IN (
    'low_confidence',
    'missing_quantity',
    'missing_unit',
    'invalid_unit',
    'unclear_description',
    'arithmetic_error',
    'system_match_unclear',
    'duplicate_suspected',
    'outlier_price'
  )),
  confidence numeric,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  
  -- Workflow
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_review', 'resolved', 'skipped')),
  assigned_to uuid REFERENCES auth.users(id),
  assigned_at timestamptz,
  
  -- Resolution data
  original_value jsonb,
  corrected_value jsonb,
  correction_notes text,
  resolved_by uuid REFERENCES auth.users(id),
  resolved_at timestamptz,
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE review_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view review queue for their organisation"
  ON review_queue FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = review_queue.organisation_id
      AND organisation_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update review queue for their organisation"
  ON review_queue FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = review_queue.organisation_id
      AND organisation_members.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = review_queue.organisation_id
      AND organisation_members.user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert into review queue"
  ON review_queue FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = review_queue.organisation_id
      AND organisation_members.user_id = auth.uid()
    )
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_review_queue_status ON review_queue(status) WHERE status IN ('pending', 'in_review');
CREATE INDEX IF NOT EXISTS idx_review_queue_organisation ON review_queue(organisation_id, status);
CREATE INDEX IF NOT EXISTS idx_review_queue_assigned_to ON review_queue(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_review_queue_priority ON review_queue(priority, status);
CREATE INDEX IF NOT EXISTS idx_review_queue_quote_item ON review_queue(quote_item_id);

-- Function to auto-populate review queue from quote items
CREATE OR REPLACE FUNCTION auto_populate_review_queue()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_quote_id uuid;
  v_project_id uuid;
  v_organisation_id uuid;
  v_issue_type text;
  v_priority text := 'medium';
BEGIN
  -- Get quote, project, and organisation info
  SELECT 
    q.id, 
    q.project_id,
    q.organisation_id
  INTO v_quote_id, v_project_id, v_organisation_id
  FROM quotes q
  WHERE q.id = NEW.quote_id;

  -- Determine issue type and priority
  IF NEW.confidence IS NOT NULL AND NEW.confidence < 0.75 THEN
    v_issue_type := 'low_confidence';
    IF NEW.confidence < 0.5 THEN
      v_priority := 'high';
    END IF;
    IF NEW.confidence < 0.3 THEN
      v_priority := 'critical';
    END IF;
  ELSIF NEW.quantity IS NULL OR NEW.quantity <= 0 THEN
    v_issue_type := 'missing_quantity';
    v_priority := 'high';
  ELSIF NEW.unit IS NULL OR NEW.unit = '' THEN
    v_issue_type := 'missing_unit';
    v_priority := 'medium';
  ELSIF NEW.system_needs_review = true THEN
    v_issue_type := 'system_match_unclear';
    v_priority := 'medium';
  ELSE
    -- No issues detected
    RETURN NEW;
  END IF;

  -- Check if already in queue
  IF NOT EXISTS (
    SELECT 1 FROM review_queue
    WHERE quote_item_id = NEW.id
    AND status IN ('pending', 'in_review')
  ) THEN
    -- Insert into review queue
    INSERT INTO review_queue (
      quote_item_id,
      quote_id,
      project_id,
      organisation_id,
      issue_type,
      confidence,
      priority,
      original_value
    ) VALUES (
      NEW.id,
      v_quote_id,
      v_project_id,
      v_organisation_id,
      v_issue_type,
      NEW.confidence,
      v_priority,
      jsonb_build_object(
        'description', NEW.description,
        'quantity', NEW.quantity,
        'unit', NEW.unit,
        'unit_price', NEW.unit_price,
        'total_price', NEW.total_price,
        'confidence', NEW.confidence,
        'system_label', NEW.system_label
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger to auto-populate review queue
DROP TRIGGER IF EXISTS trigger_auto_populate_review_queue ON quote_items;
CREATE TRIGGER trigger_auto_populate_review_queue
  AFTER INSERT OR UPDATE ON quote_items
  FOR EACH ROW
  EXECUTE FUNCTION auto_populate_review_queue();

-- Function to resolve review queue item
CREATE OR REPLACE FUNCTION resolve_review_queue_item(
  review_id uuid,
  corrected_data jsonb,
  notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_quote_item_id uuid;
BEGIN
  -- Get quote_item_id
  SELECT quote_item_id INTO v_quote_item_id
  FROM review_queue
  WHERE id = review_id;

  -- Update the quote_item with corrected data
  IF corrected_data ? 'description' THEN
    UPDATE quote_items SET description = corrected_data->>'description' WHERE id = v_quote_item_id;
  END IF;
  IF corrected_data ? 'quantity' THEN
    UPDATE quote_items SET quantity = (corrected_data->>'quantity')::numeric WHERE id = v_quote_item_id;
  END IF;
  IF corrected_data ? 'unit' THEN
    UPDATE quote_items SET unit = corrected_data->>'unit' WHERE id = v_quote_item_id;
  END IF;
  IF corrected_data ? 'unit_price' THEN
    UPDATE quote_items SET unit_price = (corrected_data->>'unit_price')::numeric WHERE id = v_quote_item_id;
  END IF;
  IF corrected_data ? 'total_price' THEN
    UPDATE quote_items SET total_price = (corrected_data->>'total_price')::numeric WHERE id = v_quote_item_id;
  END IF;
  IF corrected_data ? 'system_label' THEN
    UPDATE quote_items SET system_label = corrected_data->>'system_label' WHERE id = v_quote_item_id;
  END IF;

  -- Mark review queue item as resolved
  UPDATE review_queue
  SET 
    status = 'resolved',
    corrected_value = corrected_data,
    correction_notes = notes,
    resolved_by = auth.uid(),
    resolved_at = now(),
    updated_at = now()
  WHERE id = review_id;
END;
$$;

-- View for pending reviews with quote details
CREATE OR REPLACE VIEW review_queue_with_details AS
SELECT 
  rq.*,
  qi.description,
  qi.quantity,
  qi.unit,
  qi.unit_price,
  qi.total_price,
  qi.system_label,
  q.supplier_name,
  q.quote_reference,
  p.name as project_name,
  u.email as assigned_to_email
FROM review_queue rq
JOIN quote_items qi ON qi.id = rq.quote_item_id
JOIN quotes q ON q.id = rq.quote_id
JOIN projects p ON p.id = rq.project_id
LEFT JOIN auth.users u ON u.id = rq.assigned_to
ORDER BY 
  CASE rq.priority
    WHEN 'critical' THEN 1
    WHEN 'high' THEN 2
    WHEN 'medium' THEN 3
    WHEN 'low' THEN 4
  END,
  rq.created_at ASC;

COMMENT ON VIEW review_queue_with_details IS 'Review queue items with full context for human reviewers';

-- Function to get review queue stats
CREATE OR REPLACE FUNCTION get_review_queue_stats(org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_pending', COUNT(*) FILTER (WHERE status = 'pending'),
    'in_review', COUNT(*) FILTER (WHERE status = 'in_review'),
    'resolved_today', COUNT(*) FILTER (WHERE status = 'resolved' AND resolved_at > CURRENT_DATE),
    'critical', COUNT(*) FILTER (WHERE priority = 'critical' AND status IN ('pending', 'in_review')),
    'high', COUNT(*) FILTER (WHERE priority = 'high' AND status IN ('pending', 'in_review')),
    'by_issue_type', jsonb_object_agg(
      issue_type,
      COUNT(*) FILTER (WHERE status IN ('pending', 'in_review'))
    )
  )
  INTO result
  FROM review_queue
  WHERE organisation_id = org_id;

  RETURN result;
END;
$$;
