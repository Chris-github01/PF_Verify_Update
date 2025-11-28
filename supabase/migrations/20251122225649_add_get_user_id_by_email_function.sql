/*
  # Add function to get user ID by email
  
  1. Function
    - `get_user_id_by_email` - Safely retrieves user ID from auth.users by email
    - Only callable by platform admins
    - Returns user_id if found, null otherwise
  
  2. Security
    - Function uses security definer to access auth schema
    - Only platform admins can call this function
*/

CREATE OR REPLACE FUNCTION get_user_id_by_email(user_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  found_user_id uuid;
BEGIN
  -- Check if caller is a platform admin
  IF NOT EXISTS (
    SELECT 1 FROM platform_admins
    WHERE user_id = auth.uid()
    AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Only platform admins can call this function';
  END IF;

  -- Look up user by email
  SELECT id INTO found_user_id
  FROM auth.users
  WHERE email = LOWER(user_email)
  LIMIT 1;

  RETURN found_user_id;
END;
$$;