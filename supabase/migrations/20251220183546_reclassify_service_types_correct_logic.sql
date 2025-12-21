/*
  # Reclassify Service Types with Correct Trade Logic
  
  1. Purpose
    - Fix incorrect service type classifications in existing quote items
    - Apply correct trade-based logic to determine service types
  
  2. Correct Classification Rules
    - Electrical: Cable bundles, Cable trays, Bus ducts
    - Fire: Steel pipes, Sprinkler pipes, Alarm cables
    - Plumbing: Fire collars, Rokwrap, Mastic, PVC/Pex/HDPE pipes
    - Mechanical: Mechanical ducts, Ducts
  
  3. Changes
    - Updates service field for all quote_items based on description
    - Preserves original data (non-destructive)
*/

-- 1. ELECTRICAL - Cable bundles, Cable trays, Bus ducts, Flush Boxes
UPDATE quote_items
SET service = 'Electrical'
WHERE (
  LOWER(description) LIKE '%cable bundle%' OR
  LOWER(description) LIKE '%cable tray%' OR
  LOWER(description) LIKE '%bus duct%' OR
  LOWER(description) LIKE '%electrical conduit%' OR
  LOWER(description) LIKE '%fire box%' OR
  LOWER(description) LIKE '%flush box%' OR
  LOWER(description) LIKE '%acoustic putty pad%' OR
  LOWER(description) LIKE '%powerpad%' OR
  LOWER(description) LIKE '%power pad%'
);

-- 2. FIRE - Steel pipes, Sprinkler pipes, Alarm cables
UPDATE quote_items
SET service = 'Fire'
WHERE (
  LOWER(description) LIKE '%steel pipe%' OR
  LOWER(description) LIKE '%sprinkler pipe%' OR
  LOWER(description) LIKE '%alarm cable%'
)
AND NOT (
  -- Don't override if already correctly classified as Electrical, Plumbing, or Mechanical
  LOWER(description) LIKE '%cable bundle%' OR
  LOWER(description) LIKE '%cable tray%' OR
  LOWER(description) LIKE '%bus duct%'
);

-- 3. PLUMBING - Fire collars, Rokwrap, Mastic, PVC/Pex/HDPE pipes
UPDATE quote_items
SET service = 'Plumbing'
WHERE (
  LOWER(description) LIKE '%fire collar%' OR
  LOWER(description) LIKE '%rokwrap%' OR
  LOWER(description) LIKE '%mastic%' OR
  LOWER(description) LIKE '%pvc pipe%' OR
  LOWER(description) LIKE '%pex pipe%' OR
  LOWER(description) LIKE '%hdpe pipe%'
)
AND NOT (
  -- Don't override if already correctly classified
  LOWER(description) LIKE '%cable bundle%' OR
  LOWER(description) LIKE '%cable tray%' OR
  LOWER(description) LIKE '%bus duct%' OR
  LOWER(description) LIKE '%steel pipe%' OR
  LOWER(description) LIKE '%sprinkler pipe%' OR
  LOWER(description) LIKE '%alarm cable%'
);

-- 4. MECHANICAL - Ducts (but not cable ducts or bus ducts)
UPDATE quote_items
SET service = 'Mechanical'
WHERE (
  LOWER(description) LIKE '%mechanical duct%' OR
  (LOWER(description) LIKE '%duct%' AND 
   NOT LOWER(description) LIKE '%cable%' AND
   NOT LOWER(description) LIKE '%bus%')
)
AND NOT (
  -- Don't override if already correctly classified
  LOWER(description) LIKE '%cable bundle%' OR
  LOWER(description) LIKE '%cable tray%' OR
  LOWER(description) LIKE '%bus duct%' OR
  LOWER(description) LIKE '%steel pipe%' OR
  LOWER(description) LIKE '%sprinkler pipe%' OR
  LOWER(description) LIKE '%alarm cable%' OR
  LOWER(description) LIKE '%fire collar%' OR
  LOWER(description) LIKE '%rokwrap%' OR
  LOWER(description) LIKE '%mastic%' OR
  LOWER(description) LIKE '%pvc pipe%' OR
  LOWER(description) LIKE '%pex pipe%' OR
  LOWER(description) LIKE '%hdpe pipe%'
);
