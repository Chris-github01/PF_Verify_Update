/*
  # Fix Infinite Recursion in organisation_members RLS Policy

  ## Problem
  The "Users can view memberships" policy was checking organisation_members 
  within the policy for organisation_members, creating infinite recursion.
  This blocked all access to the system.

  ## Solution
  Simplify the SELECT policy to:
  1. Users can always see their own memberships
  2. Platform admins can see all memberships
  
  Remove the circular check that was trying to let users see other members
  in their organisations. This access pattern should be handled at the 
  application level or through separate views.

  ## Impact
  This will restore access to all quotes, projects, and other data by fixing
  the membership lookup that all other policies depend on.
*/

-- Fix the circular dependency in organisation_members SELECT policy
DROP POLICY IF EXISTS "Users can view memberships" ON public.organisation_members;

CREATE POLICY "Users can view memberships"
  ON public.organisation_members FOR SELECT
  TO authenticated
  USING (
    -- Users can always see their own memberships
    user_id = (select auth.uid())
    OR
    -- Platform admins can see all memberships
    EXISTS (
      SELECT 1 FROM public.platform_admins
      WHERE user_id = (select auth.uid()) AND is_active = true
    )
  );

COMMENT ON POLICY "Users can view memberships" ON public.organisation_members IS
  'Simplified policy without circular dependency. Users see their own memberships, platform admins see all.';
