/*
  # Fix Organisations RLS - Use Security Definer Function
  
  1. Problem
    - RLS policy tries to query auth.users directly
    - The authenticated role doesn't have SELECT permission on auth.users
    - This causes the policy to FAIL and return no rows
  
  2. Solution
    - Create a SECURITY DEFINER function that can read auth.users
    - Use this function in the RLS policy
    - This bypasses the permission issue
  
  3. Security
    - Function is SECURITY DEFINER so it runs with elevated privileges
    - Function is STABLE (read-only, cacheable)
    - Only checks if current user is a God-Mode owner
*/

-- Create a helper function that can read auth.users with elevated privileges
CREATE OR REPLACE FUNCTION public.is_god_mode_owner()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM auth.users 
    WHERE id = auth.uid() 
    AND email IN ('chris@optimalfire.co.nz', 'pieter@optimalfire.co.nz')
  );
$$;

-- Drop the existing policy
DROP POLICY IF EXISTS "Users can view their own organisations" ON organisations;

-- Create updated policy using the helper function
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

-- Grant execute permission on the function to authenticated users
GRANT EXECUTE ON FUNCTION public.is_god_mode_owner() TO authenticated;
