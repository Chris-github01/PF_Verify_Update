/*
  # Add Selected Trade to User Preferences

  1. Changes
    - Add `selected_trade` column to `user_preferences` table
    - Support for storing user's preferred trade module selection
    - Valid values: 'passive_fire', 'electrical', 'hvac', 'plumbing', 'active_fire'
    - Defaults to 'passive_fire' for backward compatibility
  
  2. Notes
    - This allows users to switch between different VerifyTrade modules
    - The selection persists across sessions
    - Default value ensures existing users default to Passive Fire
*/

-- Add selected_trade column to user_preferences
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'selected_trade'
  ) THEN
    ALTER TABLE user_preferences 
    ADD COLUMN selected_trade text DEFAULT 'passive_fire';
    
    -- Add check constraint for valid trade values
    ALTER TABLE user_preferences
    ADD CONSTRAINT valid_trade_values 
    CHECK (selected_trade IN ('passive_fire', 'electrical', 'hvac', 'plumbing', 'active_fire'));
  END IF;
END $$;
