/*
  # Fix Organisation Members SELECT Policy - No Recursion

  1. Problem
    - The SELECT policy uses is_organisation_member() which queries organisation_members
    - This creates infinite recursion when trying to view memberships
    
  2. Solution
    - Replace with a simple policy that allows users to see their own membership records
    - This breaks the recursion by not querying the same table
    
  3. Security
    - Users can only see membership records where they are the user
    - Combined with other table policies, this maintains security
*/

-- Drop the recursive policy
DROP POLICY IF EXISTS "Users can view members of their organisations" ON organisation_members;

-- Create a simple non-recursive policy
-- Users can see their own membership records
CREATE POLICY "Users can view their own memberships"
  ON organisation_members
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
