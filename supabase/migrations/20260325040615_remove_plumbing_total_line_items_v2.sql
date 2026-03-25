/*
  # Remove Plumbing Total Line Items (v2)

  ## Problem
  The plumbing quote parser was incorrectly including the "Total" summary row
  as a line item in quote_items. This affected 3 quotes (Choice 4, 5, 6).

  ## Changes
  1. Delete total/summary rows from quote_items for plumbing quotes
  2. Recalculate and update total_amount and items_count on affected quotes
     to reflect only the real line items (not the total row)

  ## Safety
  - Only targets plumbing trade quotes via JOIN to quotes table
  - Only removes rows where TRIM(LOWER(description)) exactly matches known total labels
  - Recalculates totals from remaining items after deletion
*/

DELETE FROM quote_items qi
WHERE qi.id IN (
  SELECT qi2.id
  FROM quote_items qi2
  JOIN quotes q ON q.id = qi2.quote_id
  WHERE q.trade = 'plumbing'
    AND LOWER(TRIM(qi2.description)) = ANY(ARRAY[
      'total', 'totals', 'total:', 'grand total',
      'quote total', 'contract sum', 'lump sum total',
      'overall total', 'subtotal', 'sub-total'
    ])
);

UPDATE quotes q
SET
  total_amount = sub.items_sum,
  total_price  = sub.items_sum,
  items_count  = sub.item_count
FROM (
  SELECT
    qi.quote_id,
    SUM(qi.total_price)  AS items_sum,
    COUNT(qi.id)         AS item_count
  FROM quote_items qi
  JOIN quotes q2 ON q2.id = qi.quote_id
  WHERE q2.trade = 'plumbing'
  GROUP BY qi.quote_id
) sub
WHERE q.id = sub.quote_id
  AND q.trade = 'plumbing';
