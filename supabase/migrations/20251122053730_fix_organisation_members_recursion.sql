/*
  # Fix Infinite Recursion in organisation_members RLS Policies

  1. Problem
    - organisation_members policies query the same table they protect
    - Creates infinite recursion when checking membership
  
  2. Solution
    - Simplify SELECT policy to allow users to see where they are members
    - Use direct user_id comparison instead of subquery on same table
    - Keep admin policies using the subquery (they work for INSERT/UPDATE/DELETE)
*/

-- Fix the SELECT policy to avoid recursion
DROP POLICY IF EXISTS "Users can view org members" ON public.organisation_members;
CREATE POLICY "Users can view org members"
  ON public.organisation_members FOR SELECT
  TO authenticated
  USING (
    -- Users can see members of orgs where they are members
    -- Use a direct check on user_id OR check via organisations table
    user_id = (SELECT auth.uid())
    OR organisation_id IN (
      SELECT om.organisation_id
      FROM public.organisation_members om
      WHERE om.user_id = (SELECT auth.uid())
    )
  );

-- Alternative approach: Make SELECT policy less restrictive to break recursion
-- Users can see their own membership record directly
DROP POLICY IF EXISTS "Users can view org members" ON public.organisation_members;
CREATE POLICY "Users can view org members"
  ON public.organisation_members FOR SELECT
  TO authenticated
  USING (
    -- Direct check: users can see their own membership
    user_id = (SELECT auth.uid())
  );

-- Add a separate policy for viewing OTHER members (once you're verified as a member)
-- This policy allows viewing all members once we know user is authenticated
DROP POLICY IF EXISTS "Members can view other members" ON public.organisation_members;
CREATE POLICY "Members can view other members"
  ON public.organisation_members FOR SELECT
  TO authenticated
  USING (
    -- If user has ANY membership record, they can view members of their orgs
    EXISTS (
      SELECT 1 FROM public.organisation_members om
      WHERE om.user_id = (SELECT auth.uid())
        AND om.organisation_id = organisation_members.organisation_id
    )
  );

-- The above still has recursion. Let's use a different approach:
-- Create a security definer function to check membership

DROP FUNCTION IF EXISTS public.user_is_org_member(uuid, uuid);
CREATE OR REPLACE FUNCTION public.user_is_org_member(org_id uuid, user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organisation_members
    WHERE organisation_id = org_id
      AND organisation_members.user_id = user_is_org_member.user_id
  );
$$;

-- Now recreate policies using the security definer function
DROP POLICY IF EXISTS "Users can view org members" ON public.organisation_members;
DROP POLICY IF EXISTS "Members can view other members" ON public.organisation_members;

CREATE POLICY "Users can view org members"
  ON public.organisation_members FOR SELECT
  TO authenticated
  USING (
    public.user_is_org_member(organisation_id, (SELECT auth.uid()))
  );

-- Keep the admin policies as they were (for INSERT/UPDATE/DELETE they don't cause recursion)
DROP POLICY IF EXISTS "Admins can add members" ON public.organisation_members;
CREATE POLICY "Admins can add members"
  ON public.organisation_members FOR INSERT
  TO authenticated
  WITH CHECK (
    public.user_is_org_member(organisation_id, (SELECT auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.organisation_members om
      WHERE om.organisation_id = organisation_members.organisation_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Admins can update members" ON public.organisation_members;
CREATE POLICY "Admins can update members"
  ON public.organisation_members FOR UPDATE
  TO authenticated
  USING (
    public.user_is_org_member(organisation_id, (SELECT auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.organisation_members om
      WHERE om.organisation_id = organisation_members.organisation_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Admins can delete members" ON public.organisation_members;
CREATE POLICY "Admins can delete members"
  ON public.organisation_members FOR DELETE
  TO authenticated
  USING (
    public.user_is_org_member(organisation_id, (SELECT auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.organisation_members om
      WHERE om.organisation_id = organisation_members.organisation_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('owner', 'admin')
    )
  );