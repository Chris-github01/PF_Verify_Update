/*
  # Reclassify Mastic Items Based on Context
  
  1. Purpose
    - Fix Mastic classification to be context-aware
    - Mastic should be classified based on what it's used with, not just as "Plumbing"
  
  2. Context-Aware Classification Rules
    - Mastic on Cable bundles/Cable trays → Electrical
    - Mastic on Steel pipes/Metal pipes → Fire
    - Mastic on PVC/Copper/Pex pipes → Plumbing (default)
    - Mastic on Ducts → Mechanical
  
  3. Changes
    - Reclassifies Mastic items based on their description context
    - Preserves all other data
*/

-- 1. Mastic on Cables/Cable Trays = ELECTRICAL
UPDATE quote_items
SET service = 'Electrical'
WHERE LOWER(description) LIKE '%mastic%'
  AND (
    LOWER(description) LIKE '%cable%' OR
    LOWER(description) LIKE '%tray%'
  )
  AND LOWER(description) NOT LIKE '%cable tray%'; -- Exclude to handle in next step

-- Fix Cable Tray specifically
UPDATE quote_items
SET service = 'Electrical'
WHERE LOWER(description) LIKE '%mastic%'
  AND LOWER(description) LIKE '%cable tray%';

-- 2. Mastic on Steel/Metal Pipes = FIRE
UPDATE quote_items
SET service = 'Fire'
WHERE LOWER(description) LIKE '%mastic%'
  AND (
    LOWER(description) LIKE '%steel%' OR
    LOWER(description) LIKE '%metal%'
  )
  AND service != 'Electrical'; -- Don't override Electrical

-- 3. Mastic on PVC/Copper/Pex Pipes = PLUMBING
UPDATE quote_items
SET service = 'Plumbing'
WHERE LOWER(description) LIKE '%mastic%'
  AND (
    LOWER(description) LIKE '%pvc%' OR
    LOWER(description) LIKE '%copper%' OR
    LOWER(description) LIKE '%pex%' OR
    LOWER(description) LIKE '%hdpe%' OR
    LOWER(description) LIKE '%collar%'
  )
  AND service NOT IN ('Electrical', 'Fire'); -- Don't override already classified

-- 4. Mastic on Ducts (but not bus ducts) = MECHANICAL
UPDATE quote_items
SET service = 'Mechanical'
WHERE LOWER(description) LIKE '%mastic%'
  AND LOWER(description) LIKE '%duct%'
  AND LOWER(description) NOT LIKE '%bus%'
  AND service NOT IN ('Electrical', 'Fire', 'Plumbing'); -- Don't override already classified
