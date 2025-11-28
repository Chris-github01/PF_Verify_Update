/*
  # Add Quote Totals Reconciliation Safety Net

  ## Overview
  Adds critical safety validation to prevent catastrophic pricing errors where extracted 
  line item totals don't match the PDF-stated quote total.

  ## New Columns on quotes table
  - `reconciliation_variance` (numeric) - Percentage difference between extracted sum and PDF total
  - `reconciliation_status` (text) - Status: pending, passed, failed, manual_override
  - `reconciliation_notes` (text) - Details about any discrepancies found
  - `reconciliation_checked_at` (timestamptz) - When the check was last run

  ## Business Rules
  - Variance >0.5% flags quote as 'failed' requiring manual review
  - Variance ≤0.5% auto-passes
  - Manual override available for justified differences

  ## Safety
  - Uses IF EXISTS patterns for idempotency
  - Includes CHECK constraints for data integrity
  - Sets sensible defaults
*/

-- Add reconciliation columns to quotes table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotes' AND column_name = 'reconciliation_variance'
  ) THEN
    ALTER TABLE quotes ADD COLUMN reconciliation_variance numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotes' AND column_name = 'reconciliation_status'
  ) THEN
    ALTER TABLE quotes ADD COLUMN reconciliation_status text DEFAULT 'pending'
      CHECK (reconciliation_status IN ('pending', 'passed', 'failed', 'manual_override'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotes' AND column_name = 'reconciliation_notes'
  ) THEN
    ALTER TABLE quotes ADD COLUMN reconciliation_notes text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotes' AND column_name = 'reconciliation_checked_at'
  ) THEN
    ALTER TABLE quotes ADD COLUMN reconciliation_checked_at timestamptz;
  END IF;
END $$;

-- Create index for querying failed reconciliations
CREATE INDEX IF NOT EXISTS idx_quotes_reconciliation_status 
  ON quotes(reconciliation_status) 
  WHERE reconciliation_status = 'failed';

-- Create function to calculate and check quote reconciliation
CREATE OR REPLACE FUNCTION check_quote_reconciliation(quote_id_param uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  extracted_total numeric;
  pdf_total numeric;
  variance_amount numeric;
  variance_percent numeric;
  result_status text;
  result_notes text;
  result jsonb;
BEGIN
  -- Get the PDF-stated total (from quoted_total column)
  SELECT quoted_total INTO pdf_total
  FROM quotes
  WHERE id = quote_id_param;

  -- Calculate sum of all extracted line items
  SELECT COALESCE(SUM(total_price), 0) INTO extracted_total
  FROM quote_items
  WHERE quote_id = quote_id_param
    AND is_excluded = false;

  -- Handle edge cases
  IF pdf_total IS NULL OR pdf_total = 0 THEN
    result_status := 'pending';
    result_notes := 'No PDF total available for comparison';
  ELSE
    -- Calculate variance
    variance_amount := extracted_total - pdf_total;
    variance_percent := ABS(variance_amount) / pdf_total;

    -- Determine status based on variance threshold (0.5%)
    IF variance_percent <= 0.005 THEN
      result_status := 'passed';
      result_notes := format('Reconciliation passed: %.2f%% variance', variance_percent * 100);
    ELSE
      result_status := 'failed';
      result_notes := format(
        'ALERT: %.2f%% variance detected. Extracted: £%s, PDF Total: £%s, Difference: £%s',
        variance_percent * 100,
        to_char(extracted_total, 'FM999,999,990.00'),
        to_char(pdf_total, 'FM999,999,990.00'),
        to_char(variance_amount, 'FM999,999,990.00')
      );
    END IF;

    -- Update the quote record
    UPDATE quotes
    SET 
      reconciliation_variance = variance_percent,
      reconciliation_status = result_status,
      reconciliation_notes = result_notes,
      reconciliation_checked_at = now()
    WHERE id = quote_id_param;
  END IF;

  -- Return result
  result := jsonb_build_object(
    'quote_id', quote_id_param,
    'extracted_total', extracted_total,
    'pdf_total', pdf_total,
    'variance_amount', variance_amount,
    'variance_percent', variance_percent,
    'status', result_status,
    'notes', result_notes
  );

  RETURN result;
END;
$$;

-- Create function to check all quotes in a project
CREATE OR REPLACE FUNCTION check_project_reconciliation(project_id_param uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  quote_record record;
  results jsonb := '[]'::jsonb;
  quote_result jsonb;
BEGIN
  FOR quote_record IN 
    SELECT id FROM quotes WHERE project_id = project_id_param
  LOOP
    quote_result := check_quote_reconciliation(quote_record.id);
    results := results || jsonb_build_array(quote_result);
  END LOOP;

  RETURN jsonb_build_object(
    'project_id', project_id_param,
    'quotes_checked', jsonb_array_length(results),
    'results', results
  );
END;
$$;

-- Create trigger to auto-check reconciliation when quote items change
CREATE OR REPLACE FUNCTION trigger_quote_reconciliation_check()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Run reconciliation check asynchronously (doesn't block the insert/update)
  PERFORM check_quote_reconciliation(
    CASE 
      WHEN TG_OP = 'DELETE' THEN OLD.quote_id
      ELSE NEW.quote_id
    END
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Attach trigger to quote_items table
DROP TRIGGER IF EXISTS quote_items_reconciliation_trigger ON quote_items;
CREATE TRIGGER quote_items_reconciliation_trigger
  AFTER INSERT OR UPDATE OR DELETE ON quote_items
  FOR EACH ROW
  EXECUTE FUNCTION trigger_quote_reconciliation_check();

-- Create view for quotes requiring review
CREATE OR REPLACE VIEW quotes_needing_review AS
SELECT 
  q.id,
  q.project_id,
  q.supplier_name,
  q.quote_reference,
  q.quoted_total,
  q.total_amount,
  q.reconciliation_variance,
  q.reconciliation_status,
  q.reconciliation_notes,
  q.reconciliation_checked_at,
  (SELECT SUM(total_price) FROM quote_items WHERE quote_id = q.id AND is_excluded = false) as extracted_total,
  p.name as project_name,
  p.organisation_id
FROM quotes q
JOIN projects p ON p.id = q.project_id
WHERE q.reconciliation_status = 'failed'
ORDER BY q.reconciliation_variance DESC;

COMMENT ON VIEW quotes_needing_review IS 'Quotes with failed reconciliation checks requiring manual review';
