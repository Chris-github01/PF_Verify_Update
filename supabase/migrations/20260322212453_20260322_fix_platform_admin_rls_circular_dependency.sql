/*
  # Fix Platform Admin RLS Circular Dependency

  The organisations SELECT policy checks platform_admins table.
  The platform_admins SELECT policy "Admins can view all platform admins" itself
  queries platform_admins (circular), which causes RLS stack depth issues and
  prevents platform admins from seeing their organisations.

  Fix: Create a SECURITY DEFINER function that bypasses RLS to check admin status,
  then use that function in all policies that need to check platform_admins.
*/

-- Drop and recreate the is_platform_admin function to ensure it works correctly
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins
    WHERE user_id = auth.uid()
      AND is_active = true
  );
$$;

-- Fix platform_admins SELECT policies to avoid self-referential recursion
-- Drop the problematic recursive policy
DROP POLICY IF EXISTS "Admins can view all platform admins" ON public.platform_admins;
DROP POLICY IF EXISTS "Users can view their own admin status" ON public.platform_admins;

-- Replace with non-recursive policies using the security definer function
CREATE POLICY "Users can view their own admin status"
  ON public.platform_admins FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Admins can view all platform admins"
  ON public.platform_admins FOR SELECT
  TO authenticated
  USING (public.is_platform_admin());

-- Update organisations SELECT policy to use the function (avoids nested RLS)
DROP POLICY IF EXISTS "organisations_select" ON public.organisations;

CREATE POLICY "organisations_select"
  ON public.organisations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organisation_members om
      WHERE om.organisation_id = organisations.id
        AND om.user_id = (SELECT auth.uid())
        AND om.status = 'active'
    )
    OR public.is_platform_admin()
  );

-- Update organisations UPDATE policy
DROP POLICY IF EXISTS "organisations_update" ON public.organisations;

CREATE POLICY "organisations_update"
  ON public.organisations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organisation_members om
      WHERE om.organisation_id = organisations.id
        AND om.user_id = (SELECT auth.uid())
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    )
    OR public.is_platform_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organisation_members om
      WHERE om.organisation_id = organisations.id
        AND om.user_id = (SELECT auth.uid())
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    )
    OR public.is_platform_admin()
  );

-- Update organisation_members SELECT policy to use the function
DROP POLICY IF EXISTS "Users can view their own memberships" ON public.organisation_members;

CREATE POLICY "Users can view their own memberships"
  ON public.organisation_members FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.is_platform_admin()
  );

-- Update projects SELECT policy to use the function
DROP POLICY IF EXISTS "Users can view their org projects" ON public.projects;

CREATE POLICY "Users can view their org projects"
  ON public.projects FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organisation_members om
      WHERE om.organisation_id = projects.organisation_id
        AND om.user_id = (SELECT auth.uid())
        AND om.status = 'active'
    )
    OR public.is_platform_admin()
  );

-- Update quotes SELECT policy to use the function
DROP POLICY IF EXISTS "Users and admins can view quotes" ON public.quotes;

CREATE POLICY "Users and admins can view quotes"
  ON public.quotes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organisation_members om
      WHERE om.organisation_id = quotes.organisation_id
        AND om.user_id = (SELECT auth.uid())
        AND om.status = 'active'
    )
    OR public.is_platform_admin()
  );
