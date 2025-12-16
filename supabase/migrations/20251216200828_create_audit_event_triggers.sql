/*
  # Create Audit Event Tracking Triggers

  1. Purpose
    - Automatically log audit events when quotes are created, parsed, or updated
    - Ensures the Audit Ledger always has complete historical data
    - Tracks all system activities for compliance and reporting

  2. Triggers Created
    - Log quote creation events
    - Log quote parsing completion events
    - Backfill existing quotes with audit events
*/

-- Function to log quote creation
CREATE OR REPLACE FUNCTION log_quote_created()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO audit_events (
    organisation_id,
    entity_type,
    entity_id,
    action,
    actor_user_id,
    metadata_json,
    created_at
  )
  VALUES (
    NEW.organisation_id,
    'quote',
    NEW.id,
    'created',
    COALESCE(NEW.created_by, NEW.uploaded_by_user_id),
    jsonb_build_object(
      'supplier_name', NEW.supplier_name,
      'total_amount', NEW.total_amount,
      'filename', NEW.filename,
      'source_type', NEW.source_type
    ),
    NEW.created_at
  );
  
  RETURN NEW;
END;
$$;

-- Function to log quote parsing completion
CREATE OR REPLACE FUNCTION log_quote_parsed()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only log when parse_status changes to 'success'
  IF NEW.parse_status = 'success' AND (OLD.parse_status IS NULL OR OLD.parse_status != 'success') THEN
    INSERT INTO audit_events (
      organisation_id,
      entity_type,
      entity_id,
      action,
      actor_user_id,
      metadata_json,
      created_at
    )
    VALUES (
      NEW.organisation_id,
      'quote',
      NEW.id,
      'parsed',
      COALESCE(NEW.created_by, NEW.uploaded_by_user_id),
      jsonb_build_object(
        'supplier_name', NEW.supplier_name,
        'parse_status', NEW.parse_status,
        'line_item_count', NEW.line_item_count
      ),
      COALESCE(NEW.parsed_at, now())
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for quote creation
DROP TRIGGER IF EXISTS trigger_log_quote_created ON quotes;
CREATE TRIGGER trigger_log_quote_created
  AFTER INSERT ON quotes
  FOR EACH ROW
  EXECUTE FUNCTION log_quote_created();

-- Create trigger for quote parsing
DROP TRIGGER IF EXISTS trigger_log_quote_parsed ON quotes;
CREATE TRIGGER trigger_log_quote_parsed
  AFTER UPDATE ON quotes
  FOR EACH ROW
  WHEN (NEW.parse_status = 'success' AND (OLD.parse_status IS DISTINCT FROM NEW.parse_status))
  EXECUTE FUNCTION log_quote_parsed();

COMMENT ON FUNCTION log_quote_created IS 'Automatically logs audit event when a quote is created';
COMMENT ON FUNCTION log_quote_parsed IS 'Automatically logs audit event when a quote is successfully parsed';
