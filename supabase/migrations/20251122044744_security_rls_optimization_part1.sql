/*
  # Security Fixes - Part 2a: RLS Policy Optimization (Platform Admins & Organisations)

  1. Changes
    - Wrap all auth.uid() and auth.jwt() calls with (select ...)
    - Prevents re-evaluation per row, improving performance at scale
  
  2. Tables Affected
    - platform_admins
    - organisations (all policies)
*/

-- Platform admins policies
DROP POLICY IF EXISTS "Platform admins can view themselves" ON public.platform_admins;
CREATE POLICY "Platform admins can view themselves"
  ON public.platform_admins FOR SELECT
  TO authenticated
  USING (email = (SELECT auth.jwt()->>'email'));

-- Organisations policies
DROP POLICY IF EXISTS "Users can view their organisations" ON public.organisations;
CREATE POLICY "Users can view their organisations"
  ON public.organisations FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT organisation_id
      FROM public.organisation_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can create organisations" ON public.organisations;
CREATE POLICY "Users can create organisations"
  ON public.organisations FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Org owners and admins can update organisation" ON public.organisations;
CREATE POLICY "Org owners and admins can update organisation"
  ON public.organisations FOR UPDATE
  TO authenticated
  USING (
    id IN (
      SELECT organisation_id
      FROM public.organisation_members
      WHERE user_id = (SELECT auth.uid())
        AND role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Platform admins can view all organisations" ON public.organisations;
CREATE POLICY "Platform admins can view all organisations"
  ON public.organisations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.platform_admins
      WHERE email = (SELECT auth.jwt()->>'email')
        AND is_active = true
    )
  );

DROP POLICY IF EXISTS "Platform admins can create organisations" ON public.organisations;
CREATE POLICY "Platform admins can create organisations"
  ON public.organisations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.platform_admins
      WHERE email = (SELECT auth.jwt()->>'email')
        AND is_active = true
    )
  );

DROP POLICY IF EXISTS "Platform admins can update all organisations" ON public.organisations;
CREATE POLICY "Platform admins can update all organisations"
  ON public.organisations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.platform_admins
      WHERE email = (SELECT auth.jwt()->>'email')
        AND is_active = true
    )
  );