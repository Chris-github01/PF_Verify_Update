/*
  # Fix Organisations RLS for God-Mode Owners
  
  1. Problem
    - God-Mode owners (chris@optimalfire.co.nz, pieter@optimalfire.co.nz) are getting 403 errors
    - The organisations SELECT policy only checks organisation_members table
    - God-Mode owners should have access to ALL organisations
  
  2. Solution
    - Update the organisations SELECT policy to allow God-Mode owners
    - Add explicit check for God-Mode email addresses
  
  3. Security
    - Hard-coded email list for God-Mode owners
    - Regular users still see only their organisations
*/

-- Drop the existing policy
DROP POLICY IF EXISTS "Users can view their own organisations" ON organisations;

-- Create updated policy with God-Mode bypass
CREATE POLICY "Users can view their own organisations"
  ON organisations
  FOR SELECT
  TO authenticated
  USING (
    -- God-Mode owners can see ALL organisations
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE id = auth.uid() 
      AND email IN ('chris@optimalfire.co.nz', 'pieter@optimalfire.co.nz')
    )
    -- OR regular users can see organisations they are active members of
    OR id IN (
      SELECT organisation_id 
      FROM organisation_members 
      WHERE user_id = auth.uid() 
      AND status = 'active'
    )
  );
