/*
  # Remove Unused Indexes

  1. Problem
    - idx_quotes_status_processing index is not being used by any queries
    - Unused indexes consume storage space
    - They add overhead to INSERT, UPDATE, DELETE operations
    - No performance benefit if never used

  2. Solution
    - Drop the unused index
    - Reduces maintenance overhead
    - Frees up storage space
    - Improves write performance

  3. Important Notes
    - Only drop if truly unused
    - Monitor query patterns after removal
    - Can be recreated if needed later
*/

DROP INDEX IF EXISTS idx_quotes_status_processing;
