/*
  # Add unique constraint to scc_quote_line_items

  ## Purpose
  Prevents duplicate line items from being inserted for the same import record.
  The audit identified that syncQuoteItemsToImport() could be called multiple times
  for the same (import_id, quoteId) pair (e.g. if polling completes twice, or if
  the user reopens a parsing-in-progress quote). Without a constraint, this would
  silently double all line items.

  ## Changes
  - Adds a unique index on (import_id, description) to prevent re-insertion of the
    same line items for a given import.
  - Uses a partial expression to handle the fact that some descriptions may be
    very long — truncates to 500 chars for the index key.

  ## Notes
  - Existing duplicates were already cleaned via direct SQL before this migration.
  - The application code in syncQuoteItemsToImport is also being updated to check
    for existing items before inserting (defence in depth).
  - ON CONFLICT DO NOTHING will be used in the application layer so that
    partial re-runs are safe.
*/

CREATE UNIQUE INDEX IF NOT EXISTS scc_quote_line_items_import_desc_unique
  ON scc_quote_line_items (import_id, left(description, 500));
