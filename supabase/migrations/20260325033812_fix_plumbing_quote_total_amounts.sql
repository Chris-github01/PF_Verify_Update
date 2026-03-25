
/*
  # Fix plumbing quote total_amount values

  The total_amount on several plumbing quotes was doubled because
  the "Total" rollup row was included in the sum when the quote was
  first parsed. This migration corrects total_amount to match the
  actual sum of line items in quote_items.
*/

UPDATE quotes q
SET total_amount = sub.items_sum
FROM (
  SELECT qi.quote_id, SUM(qi.total_price) AS items_sum
  FROM quote_items qi
  JOIN quotes q2 ON q2.id = qi.quote_id
  WHERE q2.trade = 'plumbing'
  GROUP BY qi.quote_id
) sub
WHERE q.id = sub.quote_id
  AND q.trade = 'plumbing'
  AND q.total_amount IS DISTINCT FROM sub.items_sum;
