/*
  # Fix Organisation Members RLS - Simple Version
  
  1. Problem
    - RLS policy has circular dependency preventing users from seeing their memberships
    
  2. Solution
    - Simple policy: users can always see their own membership records
    - Platform admins can see all memberships
    
  3. Changes
    - Drop all existing SELECT policies
    - Create two simple policies without recursion
*/

-- Drop all existing SELECT policies on organisation_members
DROP POLICY IF EXISTS "Users can view own memberships and org members" ON organisation_members;
DROP POLICY IF EXISTS "Users can view org members" ON organisation_members;
DROP POLICY IF EXISTS "Users can view own membership records" ON organisation_members;
DROP POLICY IF EXISTS "Admins can view all memberships" ON organisation_members;

-- Create a simple policy: users can always see their own memberships
CREATE POLICY "Users see own memberships"
  ON organisation_members
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Create a policy for platform admins to see everything
CREATE POLICY "Platform admins see all memberships"
  ON organisation_members
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE platform_admins.user_id = auth.uid()
        AND platform_admins.is_active = true
    )
  );
