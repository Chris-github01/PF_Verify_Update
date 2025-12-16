/*
  # Fix Platform Admins Table and View

  1. Changes
    - Add email and full_name columns to platform_admins table
    - Create view that enriches platform_admins with user data from auth.users
    - Populate email from auth.users for existing records

  2. Security
    - Maintains existing RLS policies
*/

-- Add missing columns to platform_admins
ALTER TABLE platform_admins 
ADD COLUMN IF NOT EXISTS email text,
ADD COLUMN IF NOT EXISTS full_name text;

-- Populate email from auth.users for existing records
UPDATE platform_admins pa
SET email = u.email,
    full_name = COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1))
FROM auth.users u
WHERE pa.user_id = u.id
AND pa.email IS NULL;

-- Create a view that always shows current user data
CREATE OR REPLACE VIEW platform_admins_with_user_data AS
SELECT 
  pa.id,
  pa.user_id,
  COALESCE(pa.email, u.email) as email,
  COALESCE(pa.full_name, u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)) as full_name,
  pa.is_active,
  pa.created_at,
  pa.updated_at
FROM platform_admins pa
LEFT JOIN auth.users u ON u.id = pa.user_id;

COMMENT ON VIEW platform_admins_with_user_data IS 'Platform admins enriched with user email and name from auth.users';
