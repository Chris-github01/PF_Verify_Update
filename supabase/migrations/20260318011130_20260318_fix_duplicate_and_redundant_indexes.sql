/*
  # Drop Duplicate and Redundant Indexes

  Removes indexes that are duplicates of unique constraint indexes already covering the same column.

  - Drop idx_award_approvals_report_id: redundant because award_approvals_report_id_unique 
    (UNIQUE INDEX) already covers award_report_id column
  - Drop idx_award_approvals_report_id_unique: also redundant for same reason
    (the unique constraint itself is the index)
*/

DROP INDEX IF EXISTS public.idx_award_approvals_report_id;
DROP INDEX IF EXISTS public.idx_award_approvals_report_id_unique;
