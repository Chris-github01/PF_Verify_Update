/*
  # Add carpentry to quotes trade check constraint

  ## Changes
  - Drops the existing `quotes_trade_check` constraint
  - Re-creates it to include 'carpentry' as a valid trade value

  ## Reason
  The carpentry trade module was added but the CHECK constraint on the quotes table
  was never updated to allow 'carpentry' as a valid value. This caused all carpentry
  quote inserts to silently fail with a constraint violation, resulting in parsing jobs
  completing with quote_id = null.
*/

ALTER TABLE quotes
  DROP CONSTRAINT IF EXISTS quotes_trade_check;

ALTER TABLE quotes
  ADD CONSTRAINT quotes_trade_check
  CHECK (trade = ANY (ARRAY[
    'passive_fire'::text,
    'electrical'::text,
    'plumbing'::text,
    'hvac'::text,
    'active_fire'::text,
    'carpentry'::text
  ]));
