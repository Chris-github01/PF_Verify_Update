-- Check quote totals for December Test project
SELECT 
  q.supplier_name,
  COUNT(qi.id) as item_count,
  SUM(qi.total_price) as total_price,
  q.id as quote_id
FROM quotes q
LEFT JOIN quote_items qi ON qi.quote_id = q.id AND qi.is_excluded = false
WHERE q.project_id IN (SELECT id FROM projects WHERE name = 'December Test')
  AND q.is_latest = true
GROUP BY q.id, q.supplier_name
ORDER BY q.supplier_name;
