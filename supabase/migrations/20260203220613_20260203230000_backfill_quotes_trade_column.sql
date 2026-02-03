/*
  # Backfill Trade Column in Quotes Table

  1. Updates
    - Set trade column for all quotes based on their project's trade
    - This ensures BOQ Builder can find quotes for any project

  2. Safety
    - Only updates quotes where trade is NULL
    - Uses project's trade as the source of truth
*/

-- Backfill trade column for existing quotes from their project's trade
UPDATE quotes
SET trade = projects.trade
FROM projects
WHERE quotes.project_id = projects.id
  AND quotes.trade IS NULL
  AND projects.trade IS NOT NULL;

-- For any quotes where project doesn't have trade set, default to passive_fire
UPDATE quotes
SET trade = 'passive_fire'
WHERE trade IS NULL;
