/*
  # Fix Organisation Members RLS Circular Dependency
  
  1. Problem
    - The SELECT policy on organisation_members uses user_is_org_member()
    - This creates a circular dependency: to see if you're a member, you must already be a member
    - Users cannot query their own memberships, breaking the organisation picker
    
  2. Solution
    - Replace the policy to allow users to see their own membership records directly
    - Users can see ANY membership record where they are the user
    - Users can also see other members if they're a member of the same org
    
  3. Changes
    - Drop the old circular policy
    - Create a new policy that checks user_id directly first
*/

-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can view org members" ON organisation_members;

-- Create a new policy that allows users to see their own memberships
-- and memberships in orgs they belong to
CREATE POLICY "Users can view own memberships and org members"
  ON organisation_members
  FOR SELECT
  TO authenticated
  USING (
    -- Users can always see their own membership records
    user_id = auth.uid()
    OR
    -- Users can see other members if they're in the same org
    EXISTS (
      SELECT 1 
      FROM organisation_members om
      WHERE om.organisation_id = organisation_members.organisation_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );
