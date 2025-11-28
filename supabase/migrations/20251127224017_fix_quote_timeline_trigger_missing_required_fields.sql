/*
  # Fix quote timeline trigger to include required fields

  1. Changes
    - Update `create_quote_timeline_event` function to include:
      - `quote_id` (required NOT NULL field)
      - `event_description` (required NOT NULL field)
    - Ensures timeline events are properly created with all required data

  2. Notes
    - This fixes the "null value in column 'quote_id'" error
    - The trigger now properly populates all NOT NULL columns
*/

-- Drop and recreate the function with all required fields
CREATE OR REPLACE FUNCTION create_quote_timeline_event()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.revision_number > 1 THEN
    INSERT INTO public.quote_revision_timeline (
      project_id,
      supplier_name,
      quote_id,
      revision_number,
      event_type,
      event_description,
      created_by
    ) VALUES (
      NEW.project_id,
      NEW.supplier_name,
      NEW.id,  -- Include the new quote's ID
      NEW.revision_number,
      CASE 
        WHEN NEW.rfi_reference IS NOT NULL THEN 'rfi_response'
        ELSE 'revision_uploaded'
      END,
      COALESCE(
        NEW.revision_reason,
        'Revision ' || NEW.revision_number || ' uploaded'
      ),
      COALESCE(NEW.created_by, auth.uid())
    );
  END IF;

  RETURN NEW;
END;
$$;