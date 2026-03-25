/*
  # Remove Total Summary Row from Choice 7 Plumbing Quote

  ## Problem
  Choice 7 plumbing quote has a "Total" row parsed as a line item.
  This is a document summary row, not a real scope item.

  ## Changes
  1. Delete the "Total" row from quote_items for Choice 7
  2. Recalculate items_count on the affected quote
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
      'overall total', 'subtotal', 'sub-total', 'net total',
      'project total', 'tender total', 'tender sum', 'contract value'
    ])
);

UPDATE quotes q
SET
  items_count = sub.item_count
FROM (
  SELECT
    qi.quote_id,
    COUNT(qi.id) AS item_count
  FROM quote_items qi
  JOIN quotes q2 ON q2.id = qi.quote_id
  WHERE q2.trade = 'plumbing'
  GROUP BY qi.quote_id
) sub
WHERE q.id = sub.quote_id
  AND q.trade = 'plumbing';
