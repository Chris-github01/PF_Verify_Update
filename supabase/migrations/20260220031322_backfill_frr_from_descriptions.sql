
/*
  # Backfill FRR from existing quote item descriptions

  Extracts Fire Resistance Rating values already embedded in descriptions
  (e.g. "(60)/60/-", "(90)/90/-", "120/120/120", "-/60/60") and saves them
  to quote_items.frr, then propagates to boq_lines.frr_rating.
*/

UPDATE quote_items
SET frr = (
  regexp_match(
    description,
    '\(?\d+\)?/[\d-]+/[\d-]+'
  )
)[1]
WHERE frr IS NULL
  AND description ~ '\(?\d+\)?/[\d-]+/[\d-]+';

UPDATE boq_lines bl
SET frr_rating = (
  SELECT (regexp_match(qi.description, '\(?\d+\)?/[\d-]+/[\d-]+'))[1]
  FROM quote_items qi
  WHERE qi.frr IS NOT NULL
    AND (
      qi.description ILIKE '%' || bl.system_name || '%'
      OR bl.system_name ILIKE '%' || LEFT(qi.description, 40) || '%'
    )
  LIMIT 1
)
WHERE bl.frr_rating IS NULL
  AND EXISTS (
    SELECT 1 FROM quote_items qi
    WHERE qi.frr IS NOT NULL
  );
