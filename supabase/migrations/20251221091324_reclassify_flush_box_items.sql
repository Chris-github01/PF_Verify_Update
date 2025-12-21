/*
  # Reclassify Intumescent Flush Box Items
  
  1. Purpose
    - Fix incorrect system classifications for Intumescent Flush Box items
    - These items were being incorrectly mapped to "Electrical Cables" or "Intumescent Coatings"
    - Intumescent Flush Box is a distinct product for electrical outlet/switch boxes
  
  2. Changes
    - Updates system_id and system_label for Fire Box / Flush Box / Acoustic Putty Pad items
    - Sets correct service type to "Electrical"
    - Updates material to "intumescent pad" (not coating)
    - Preserves original data (non-destructive)
  
  3. Classification Rules
    - "Fire Box" items → Intumescent Flush Box
    - "Flush Box" items → Intumescent Flush Box  
    - "Acoustic Putty Pad" items → Intumescent Flush Box
    - "Powerpad" items → Intumescent Flush Box
    - FRR determines which system (60/90/120)
*/

-- Update items with "Fire Box" in description
UPDATE quote_items
SET 
  system_id = CASE
    WHEN LOWER(description) LIKE '%120%' OR LOWER(description) LIKE '%2hr%' THEN 'FLUSH_BOX_120'
    WHEN LOWER(description) LIKE '%90%' OR LOWER(description) LIKE '%1.5hr%' THEN 'FLUSH_BOX_90'
    ELSE 'FLUSH_BOX_60'
  END,
  system_label = CASE
    WHEN LOWER(description) LIKE '%120%' OR LOWER(description) LIKE '%2hr%' THEN 'Intumescent Flush Box (120min)'
    WHEN LOWER(description) LIKE '%90%' OR LOWER(description) LIKE '%1.5hr%' THEN 'Intumescent Flush Box (90min)'
    ELSE 'Intumescent Flush Box (60min)'
  END,
  service = 'Electrical',
  material = 'intumescent pad',
  subclass = 'Flush Box'
WHERE (
  LOWER(description) LIKE '%fire box%' OR
  LOWER(description) LIKE '%flush box%' OR
  LOWER(description) LIKE '%acoustic putty pad%' OR
  LOWER(description) LIKE '%powerpad%' OR
  LOWER(description) LIKE '%power pad%'
)
AND system_id NOT IN ('FLUSH_BOX_60', 'FLUSH_BOX_90', 'FLUSH_BOX_120');

-- Log the update
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Reclassified % Intumescent Flush Box items', updated_count;
END $$;
