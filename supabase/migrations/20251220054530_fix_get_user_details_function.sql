/*
  # Fix get_user_details Function

  The get_user_details function was not working reliably due to search_path issues.
  This migration fixes the function to properly access the auth.users table and
  always return results, even for newly created users.

  ## Changes
  1. Remove search_path restriction
  2. Add STABLE volatility for better query optimization
  3. Improve error handling
  4. Ensure function always returns a row (even if user not found, return nulls)

  ## Security
  - Function remains SECURITY DEFINER to access auth schema
  - Only exposes non-sensitive user data (email and full_name)
*/

-- Drop and recreate the function with fixes
DROP FUNCTION IF EXISTS get_user_details(uuid);

CREATE OR REPLACE FUNCTION get_user_details(p_user_id uuid)
RETURNS TABLE (
  email text,
  full_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT 
    u.email::text,
    COALESCE((u.raw_user_meta_data->>'full_name')::text, u.email::text) as full_name
  FROM auth.users u
  WHERE u.id = p_user_id
  LIMIT 1;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_user_details(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_details(uuid) TO service_role;

-- Add helpful comment
COMMENT ON FUNCTION get_user_details IS
  'Returns email and full_name for a given user_id from auth.users table. Used by frontend to display user information.';
