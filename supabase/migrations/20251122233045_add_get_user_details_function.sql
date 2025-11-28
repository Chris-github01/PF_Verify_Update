/*
  # Add Function to Get User Details
  
  Creates a secure function to retrieve user email and full_name from auth.users table.
  This is needed because the frontend cannot directly query auth.users.
  
  1. New Functions
    - `get_user_details(user_id)` - Returns email and full_name for a given user
  
  2. Security
    - Function is marked as SECURITY DEFINER to access auth schema
    - Only returns non-sensitive user information (email and full_name)
*/

-- Function to get user details (email and full_name)
CREATE OR REPLACE FUNCTION get_user_details(p_user_id uuid)
RETURNS TABLE (
  email text,
  full_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.email::text,
    (u.raw_user_meta_data->>'full_name')::text as full_name
  FROM auth.users u
  WHERE u.id = p_user_id;
END;
$$;
