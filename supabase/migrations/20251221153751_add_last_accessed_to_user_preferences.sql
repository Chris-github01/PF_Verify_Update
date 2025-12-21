/*
  # Add Last Accessed Organisation and Project to User Preferences

  This migration adds columns to track each user's last accessed organisation and project,
  enabling automatic navigation to their last working context on login.

  ## Changes

  ### Update `user_preferences` table
  - Add `last_organisation_id` (uuid, references organisations) - Last accessed organisation
  - Add `last_project_id` (uuid, references projects) - Last accessed project

  ## Security
  - RLS already enabled on user_preferences table
  - Existing policies cover the new columns

  ## Indexes
  - Index on last_organisation_id for fast lookups
  - Index on last_project_id for fast lookups
*/

-- Add last_organisation_id column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'last_organisation_id'
  ) THEN
    ALTER TABLE user_preferences
    ADD COLUMN last_organisation_id uuid REFERENCES organisations(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add last_project_id column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'last_project_id'
  ) THEN
    ALTER TABLE user_preferences
    ADD COLUMN last_project_id uuid REFERENCES projects(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_user_preferences_last_organisation_id
  ON user_preferences(last_organisation_id)
  WHERE last_organisation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_preferences_last_project_id
  ON user_preferences(last_project_id)
  WHERE last_project_id IS NOT NULL;

-- Add comments
COMMENT ON COLUMN user_preferences.last_organisation_id IS
  'The last organisation the user accessed - used for automatic navigation on login';

COMMENT ON COLUMN user_preferences.last_project_id IS
  'The last project the user accessed - used for automatic navigation on login';
