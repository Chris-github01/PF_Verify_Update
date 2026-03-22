/*
  # Fix Platform Admin Access to Projects and Quotes

  Platform admins need SELECT access to all projects and quotes
  for the admin dashboard stats and global views to work correctly.
*/

-- Fix projects SELECT: allow platform admins to see all projects
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
    OR EXISTS (
      SELECT 1 FROM public.platform_admins pa
      WHERE pa.user_id = (SELECT auth.uid())
        AND pa.is_active = true
    )
  );

-- Fix quotes SELECT: allow platform admins to see all quotes
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
    OR EXISTS (
      SELECT 1 FROM public.platform_admins pa
      WHERE pa.user_id = (SELECT auth.uid())
        AND pa.is_active = true
    )
  );
