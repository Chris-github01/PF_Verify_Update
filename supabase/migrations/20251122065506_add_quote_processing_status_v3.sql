/*
  # Add Quote Processing Status Tracking

  1. Drop existing check constraint
  2. Add new columns for processing tracking
  3. Add updated check constraint with new status values
  4. Update existing data
*/

ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS quotes_status_check;

ALTER TABLE public.quotes 
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS processing_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS processing_error text;

ALTER TABLE public.quotes 
  ADD CONSTRAINT quotes_status_check 
  CHECK (status IN ('imported', 'processing', 'ready', 'error', 'pending', 'reviewed', 'accepted', 'rejected'));

UPDATE public.quotes 
SET status = 'imported' 
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_quotes_status_processing 
  ON public.quotes(status) 
  WHERE status IN ('imported', 'processing', 'error');
