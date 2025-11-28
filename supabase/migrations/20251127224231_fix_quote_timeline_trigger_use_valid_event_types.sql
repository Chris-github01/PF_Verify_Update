/*
  # Fix quote timeline trigger to use valid event types

  1. Changes
    - Update `create_quote_timeline_event` function to use valid event_type values
    - Valid types: 'upload', 'rfi', 'price_change', 'modification', 'note'
    - Maps rfi_reference to 'rfi' type, otherwise 'upload'

  2. Notes
    - Fixes the "violates check constraint" error
*/

-- Drop and recreate the function with valid event types
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
      NEW.id,
      NEW.revision_number,
      CASE 
        WHEN NEW.rfi_reference IS NOT NULL THEN 'rfi'
        ELSE 'upload'
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