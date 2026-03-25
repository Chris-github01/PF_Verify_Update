/*
  # Remove Total Summary Rows from All Plumbing Quotes

  ## Problem
  The external PDF extractor was including "Total" summary rows as line items
  before the filtering logic could catch them. Choice 8 (and any others) still
  have this bad row in the database.

  ## Changes
  1. Delete all "Total" summary rows from plumbing quote_items
  2. Recalculate items_count on affected quotes
*/

DELETE FROM quote_items qi
WHERE qi.id IN (
  SELECT qi2.id
  FROM quote_items qi2
  JOIN quotes q ON q.id = qi2.quote_id
  WHERE q.trade = 'plumbing'
    AND LOWER(TRIM(REGEXP_REPLACE(qi2.description, '[:\s]+$', ''))) = ANY(ARRAY[
      'total', 'totals', 'grand total', 'grandtotal',
      'quote total', 'contract sum', 'lump sum total', 'overall total',
      'subtotal', 'sub-total', 'sub total', 'net total', 'project total',
      'tender total', 'tender sum', 'contract value', 'total price',
      'total cost', 'total amount', 'total sum', 'contract total',
      'contract price', 'price total'
    ])
);

UPDATE quotes q
SET items_count = sub.item_count
FROM (
  SELECT qi.quote_id, COUNT(qi.id) AS item_count
  FROM quote_items qi
  JOIN quotes q2 ON q2.id = qi.quote_id
  WHERE q2.trade = 'plumbing'
  GROUP BY qi.quote_id
) sub
WHERE q.id = sub.quote_id
  AND q.trade = 'plumbing';
