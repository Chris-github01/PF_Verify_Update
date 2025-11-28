/*
  # Fix is_god_mode_owner Function - Remove Search Path Restriction
  
  1. Problem
    - Function has search_path = public restriction
    - Cannot access auth.users table
    - Causes 403 errors when loading organisations
  
  2. Solution
    - Drop policy temporarily
    - Recreate function without search_path restriction
    - Recreate policy
  
  3. Security
    - Function remains SECURITY DEFINER (elevated privileges)
    - No user input, read-only check
*/

-- Drop the policy first
DROP POLICY IF EXISTS "Users can view their own organisations" ON organisations;

-- Drop and recreate the function without search_path restriction
DROP FUNCTION IF EXISTS public.is_god_mode_owner();

CREATE OR REPLACE FUNCTION public.is_god_mode_owner()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM auth.users 
    WHERE id = auth.uid() 
    AND email IN ('chris@optimalfire.co.nz', 'pieter@optimalfire.co.nz')
  );
$$;

-- Recreate the policy
CREATE POLICY "Users can view their own organisations"
  ON organisations
  FOR SELECT
  TO authenticated
  USING (
    -- God-Mode owners can see ALL organisations
    public.is_god_mode_owner()
    -- OR regular users can see organisations they are active members of
    OR id IN (
      SELECT organisation_id 
      FROM organisation_members 
      WHERE user_id = auth.uid() 
      AND status = 'active'
    )
  );

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.is_god_mode_owner() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_god_mode_owner() TO anon;
