/*
  # Fix Platform Admin Access to Organisations

  The admin dashboard broke after consolidating RLS policies because:
  1. organisations SELECT - only allowed member users, not platform admins
  2. organisations UPDATE - only allowed org owners/admins, not platform admins
  3. organisation_members SELECT - only allowed self-view, not platform admin view

  This migration adds back platform admin access to these tables.
*/

-- Fix organisations SELECT: allow platform admins to see all organisations
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
    OR EXISTS (
      SELECT 1 FROM public.platform_admins pa
      WHERE pa.user_id = (SELECT auth.uid())
        AND pa.is_active = true
    )
  );

-- Fix organisations UPDATE: allow platform admins to update any organisation
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
    OR EXISTS (
      SELECT 1 FROM public.platform_admins pa
      WHERE pa.user_id = (SELECT auth.uid())
        AND pa.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organisation_members om
      WHERE om.organisation_id = organisations.id
        AND om.user_id = (SELECT auth.uid())
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.platform_admins pa
      WHERE pa.user_id = (SELECT auth.uid())
        AND pa.is_active = true
    )
  );

-- Fix organisation_members SELECT: allow platform admins to see all members
DROP POLICY IF EXISTS "Users can view their own memberships" ON public.organisation_members;

CREATE POLICY "Users can view their own memberships"
  ON public.organisation_members FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.platform_admins pa
      WHERE pa.user_id = (SELECT auth.uid())
        AND pa.is_active = true
    )
  );
