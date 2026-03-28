/*
  # Add Mandatory Review Confirmation fields to award_reports

  ## Summary
  Persists the two acknowledgement checkboxes from the Award Reports "Mandatory Review
  Confirmation" gate so the user's sign-off is recorded in the database when they click
  "Complete and Finish".

  ## New Columns on award_reports
  - `review_scope_gaps` (boolean, default false) — user confirmed they reviewed scope gaps
  - `review_commercial_risks` (boolean, default false) — user accepted commercial risks
  - `review_confirmed_at` (timestamptz) — timestamp when both were checked and finish clicked
  - `review_confirmed_by` (uuid) — auth.uid() of the user who completed the review
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'award_reports' AND column_name = 'review_scope_gaps'
  ) THEN
    ALTER TABLE award_reports ADD COLUMN review_scope_gaps boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'award_reports' AND column_name = 'review_commercial_risks'
  ) THEN
    ALTER TABLE award_reports ADD COLUMN review_commercial_risks boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'award_reports' AND column_name = 'review_confirmed_at'
  ) THEN
    ALTER TABLE award_reports ADD COLUMN review_confirmed_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'award_reports' AND column_name = 'review_confirmed_by'
  ) THEN
    ALTER TABLE award_reports ADD COLUMN review_confirmed_by uuid REFERENCES auth.users(id);
  END IF;
END $$;
