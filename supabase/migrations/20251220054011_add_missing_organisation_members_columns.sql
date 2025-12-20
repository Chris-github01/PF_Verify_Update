/*
  # Add Missing Organisation Members Columns

  This migration adds missing columns to the organisation_members table that are referenced
  in various parts of the application but were not previously created via migrations.

  ## Changes
  1. Add `invited_by_user_id` column - tracks who invited this member
  2. Add `activated_at` column - tracks when the member activated their account

  These columns are used for:
  - Tracking invitation history
  - Displaying member activation status
  - Ordering members by activation date
  - Admin analytics
*/

-- Add invited_by_user_id column if it doesn't exist
ALTER TABLE organisation_members
ADD COLUMN IF NOT EXISTS invited_by_user_id uuid REFERENCES auth.users(id);

-- Add activated_at column if it doesn't exist
ALTER TABLE organisation_members
ADD COLUMN IF NOT EXISTS activated_at timestamptz;

-- Create index for invited_by_user_id
CREATE INDEX IF NOT EXISTS idx_organisation_members_invited_by_user_id
  ON organisation_members(invited_by_user_id)
  WHERE invited_by_user_id IS NOT NULL;

-- Create index for activated_at
CREATE INDEX IF NOT EXISTS idx_organisation_members_activated_at
  ON organisation_members(activated_at)
  WHERE activated_at IS NOT NULL;

-- Update existing active members to set activated_at to their created_at if null
UPDATE organisation_members
SET activated_at = created_at
WHERE activated_at IS NULL
  AND status = 'active';

-- Add comment explaining the columns
COMMENT ON COLUMN organisation_members.invited_by_user_id IS
  'User ID of the person who invited this member to the organisation';

COMMENT ON COLUMN organisation_members.activated_at IS
  'Timestamp when the member activated their account or was added to the organisation';
