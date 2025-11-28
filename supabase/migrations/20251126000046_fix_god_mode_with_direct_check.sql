/*
  # Fix God-Mode Access - Use Direct Email Check
  
  1. Problem
    - SECURITY DEFINER function still can't access auth.users
    - Multiple function duplicates exist
  
  2. Solution
    - Drop all existing functions and policies
    - Use a simpler approach: Check email in JWT token
    - JWT token contains the user's email in claims
  
  3. Implementation
    - Create function that checks auth.jwt() for email
    - This avoids needing to query auth.users table
*/

-- Drop existing policy
DROP POLICY IF EXISTS "Users can view their own organisations" ON organisations;

-- Drop ALL instances of the function
DROP FUNCTION IF EXISTS public.is_god_mode_owner() CASCADE;

-- Create function that checks JWT email claim
CREATE OR REPLACE FUNCTION public.is_god_mode_user()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'email')::text IN (
      '"chris@optimalfire.co.nz"',
      '"pieter@optimalfire.co.nz"'
    ),
    false
  );
$$;

-- Create policy using JWT check
CREATE POLICY "Users can view their own organisations"
  ON organisations
  FOR SELECT
  TO authenticated
  USING (
    -- God-Mode users (check JWT email) can see ALL organisations
    public.is_god_mode_user()
    -- OR regular users can see organisations they are active members of
    OR id IN (
      SELECT organisation_id 
      FROM organisation_members 
      WHERE user_id = auth.uid() 
      AND status = 'active'
    )
  );

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.is_god_mode_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_god_mode_user() TO anon;
