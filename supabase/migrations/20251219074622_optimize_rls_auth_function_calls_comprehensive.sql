/*
  # Optimize RLS Auth Function Calls - Comprehensive Fix

  This migration optimizes RLS policies to use (select auth.uid()) pattern
  instead of auth.uid() which gets re-evaluated for each row.

  ## Changes

  1. **quotes table** - 4 policies optimized
  2. **quote_items table** - 4 policies optimized
  3. **parsing_jobs table** - 4 policies optimized
  4. **parsing_chunks table** - 4 policies optimized
  5. **suppliers table** - 2 policies optimized
  6. **audits table** - 3 policies optimized
  7. **audit_findings table** - 2 policies optimized
  8. **audit_exports table** - 1 policy optimized
  9. **audit_events table** - 1 policy optimized
  10. **system_config table** - 3 policies optimized
  11. **demo_accounts table** - 1 policy optimized
  12. **projects table** - 1 policy optimized
  13. **organisations table** - 2 policies optimized
  14. **organisation_members table** - 4 policies optimized
*/

-- quotes table policies
DROP POLICY IF EXISTS "Users can view quotes" ON public.quotes;
CREATE POLICY "Users can view quotes"
  ON public.quotes FOR SELECT
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM public.organisation_members
      WHERE user_id = (select auth.uid()) AND status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can create quotes" ON public.quotes;
CREATE POLICY "Users can create quotes"
  ON public.quotes FOR INSERT
  TO authenticated
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM public.organisation_members
      WHERE user_id = (select auth.uid()) AND status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can update quotes" ON public.quotes;
CREATE POLICY "Users can update quotes"
  ON public.quotes FOR UPDATE
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM public.organisation_members
      WHERE user_id = (select auth.uid()) AND status = 'active'
    )
  )
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM public.organisation_members
      WHERE user_id = (select auth.uid()) AND status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can delete quotes" ON public.quotes;
CREATE POLICY "Users can delete quotes"
  ON public.quotes FOR DELETE
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM public.organisation_members
      WHERE user_id = (select auth.uid()) AND status = 'active'
    )
  );

-- quote_items table policies
DROP POLICY IF EXISTS "Users can view quote items" ON public.quote_items;
CREATE POLICY "Users can view quote items"
  ON public.quote_items FOR SELECT
  TO authenticated
  USING (
    quote_id IN (
      SELECT id FROM public.quotes
      WHERE organisation_id IN (
        SELECT organisation_id FROM public.organisation_members
        WHERE user_id = (select auth.uid()) AND status = 'active'
      )
    )
  );

DROP POLICY IF EXISTS "Users can insert quote items" ON public.quote_items;
CREATE POLICY "Users can insert quote items"
  ON public.quote_items FOR INSERT
  TO authenticated
  WITH CHECK (
    quote_id IN (
      SELECT id FROM public.quotes
      WHERE organisation_id IN (
        SELECT organisation_id FROM public.organisation_members
        WHERE user_id = (select auth.uid()) AND status = 'active'
      )
    )
  );

DROP POLICY IF EXISTS "Users can update quote items" ON public.quote_items;
CREATE POLICY "Users can update quote items"
  ON public.quote_items FOR UPDATE
  TO authenticated
  USING (
    quote_id IN (
      SELECT id FROM public.quotes
      WHERE organisation_id IN (
        SELECT organisation_id FROM public.organisation_members
        WHERE user_id = (select auth.uid()) AND status = 'active'
      )
    )
  );

DROP POLICY IF EXISTS "Users can delete quote items" ON public.quote_items;
CREATE POLICY "Users can delete quote items"
  ON public.quote_items FOR DELETE
  TO authenticated
  USING (
    quote_id IN (
      SELECT id FROM public.quotes
      WHERE organisation_id IN (
        SELECT organisation_id FROM public.organisation_members
        WHERE user_id = (select auth.uid()) AND status = 'active'
      )
    )
  );

-- parsing_jobs table policies
DROP POLICY IF EXISTS "Users can view parsing jobs" ON public.parsing_jobs;
CREATE POLICY "Users can view parsing jobs"
  ON public.parsing_jobs FOR SELECT
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM public.organisation_members
      WHERE user_id = (select auth.uid()) AND status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can create parsing jobs" ON public.parsing_jobs;
CREATE POLICY "Users can create parsing jobs"
  ON public.parsing_jobs FOR INSERT
  TO authenticated
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM public.organisation_members
      WHERE user_id = (select auth.uid()) AND status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can update parsing jobs" ON public.parsing_jobs;
CREATE POLICY "Users can update parsing jobs"
  ON public.parsing_jobs FOR UPDATE
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM public.organisation_members
      WHERE user_id = (select auth.uid()) AND status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can delete parsing jobs" ON public.parsing_jobs;
CREATE POLICY "Users can delete parsing jobs"
  ON public.parsing_jobs FOR DELETE
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM public.organisation_members
      WHERE user_id = (select auth.uid()) AND status = 'active'
    )
  );

-- parsing_chunks table policies
DROP POLICY IF EXISTS "Users can view parsing chunks" ON public.parsing_chunks;
CREATE POLICY "Users can view parsing chunks"
  ON public.parsing_chunks FOR SELECT
  TO authenticated
  USING (
    job_id IN (
      SELECT id FROM public.parsing_jobs
      WHERE organisation_id IN (
        SELECT organisation_id FROM public.organisation_members
        WHERE user_id = (select auth.uid()) AND status = 'active'
      )
    )
  );

DROP POLICY IF EXISTS "Users can create parsing chunks" ON public.parsing_chunks;
CREATE POLICY "Users can create parsing chunks"
  ON public.parsing_chunks FOR INSERT
  TO authenticated
  WITH CHECK (
    job_id IN (
      SELECT id FROM public.parsing_jobs
      WHERE organisation_id IN (
        SELECT organisation_id FROM public.organisation_members
        WHERE user_id = (select auth.uid()) AND status = 'active'
      )
    )
  );

DROP POLICY IF EXISTS "Users can update parsing chunks" ON public.parsing_chunks;
CREATE POLICY "Users can update parsing chunks"
  ON public.parsing_chunks FOR UPDATE
  TO authenticated
  USING (
    job_id IN (
      SELECT id FROM public.parsing_jobs
      WHERE organisation_id IN (
        SELECT organisation_id FROM public.organisation_members
        WHERE user_id = (select auth.uid()) AND status = 'active'
      )
    )
  );

DROP POLICY IF EXISTS "Users can delete parsing chunks" ON public.parsing_chunks;
CREATE POLICY "Users can delete parsing chunks"
  ON public.parsing_chunks FOR DELETE
  TO authenticated
  USING (
    job_id IN (
      SELECT id FROM public.parsing_jobs
      WHERE organisation_id IN (
        SELECT organisation_id FROM public.organisation_members
        WHERE user_id = (select auth.uid()) AND status = 'active'
      )
    )
  );

-- suppliers table policies
DROP POLICY IF EXISTS "Users can view suppliers in their org" ON public.suppliers;
CREATE POLICY "Users can view suppliers in their org"
  ON public.suppliers FOR SELECT
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM public.organisation_members
      WHERE user_id = (select auth.uid()) AND status = 'active'
    )
  );

DROP POLICY IF EXISTS "Org admins can manage suppliers" ON public.suppliers;
CREATE POLICY "Org admins can manage suppliers"
  ON public.suppliers FOR ALL
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM public.organisation_members
      WHERE user_id = (select auth.uid()) AND status = 'active' AND role IN ('admin', 'owner')
    )
  );

-- audits table policies
DROP POLICY IF EXISTS "Users can view audits in their org" ON public.audits;
CREATE POLICY "Users can view audits in their org"
  ON public.audits FOR SELECT
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM public.organisation_members
      WHERE user_id = (select auth.uid()) AND status = 'active'
    )
  );

DROP POLICY IF EXISTS "Org members can create audits" ON public.audits;
CREATE POLICY "Org members can create audits"
  ON public.audits FOR INSERT
  TO authenticated
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM public.organisation_members
      WHERE user_id = (select auth.uid()) AND status = 'active'
    )
  );

DROP POLICY IF EXISTS "Org admins can update audits" ON public.audits;
CREATE POLICY "Org admins can update audits"
  ON public.audits FOR UPDATE
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM public.organisation_members
      WHERE user_id = (select auth.uid()) AND status = 'active' AND role IN ('admin', 'owner')
    )
  );

-- audit_findings table policies
DROP POLICY IF EXISTS "Users can view findings for their org audits" ON public.audit_findings;
CREATE POLICY "Users can view findings for their org audits"
  ON public.audit_findings FOR SELECT
  TO authenticated
  USING (
    audit_id IN (
      SELECT id FROM public.audits
      WHERE organisation_id IN (
        SELECT organisation_id FROM public.organisation_members
        WHERE user_id = (select auth.uid()) AND status = 'active'
      )
    )
  );

DROP POLICY IF EXISTS "Org members can create findings" ON public.audit_findings;
CREATE POLICY "Org members can create findings"
  ON public.audit_findings FOR INSERT
  TO authenticated
  WITH CHECK (
    audit_id IN (
      SELECT id FROM public.audits
      WHERE organisation_id IN (
        SELECT organisation_id FROM public.organisation_members
        WHERE user_id = (select auth.uid()) AND status = 'active'
      )
    )
  );

-- audit_exports table policy
DROP POLICY IF EXISTS "Users can view exports for their org audits" ON public.audit_exports;
CREATE POLICY "Users can view exports for their org audits"
  ON public.audit_exports FOR SELECT
  TO authenticated
  USING (
    audit_id IN (
      SELECT id FROM public.audits
      WHERE organisation_id IN (
        SELECT organisation_id FROM public.organisation_members
        WHERE user_id = (select auth.uid()) AND status = 'active'
      )
    )
  );

-- audit_events table policy
DROP POLICY IF EXISTS "Users can view events for their org" ON public.audit_events;
CREATE POLICY "Users can view events for their org"
  ON public.audit_events FOR SELECT
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM public.organisation_members
      WHERE user_id = (select auth.uid()) AND status = 'active'
    )
  );

-- system_config table policies
DROP POLICY IF EXISTS "Platform admins can read system_config" ON public.system_config;
CREATE POLICY "Platform admins can read system_config"
  ON public.system_config FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.platform_admins
      WHERE user_id = (select auth.uid()) AND is_active = true
    )
  );

DROP POLICY IF EXISTS "Platform admins can insert system_config" ON public.system_config;
CREATE POLICY "Platform admins can insert system_config"
  ON public.system_config FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.platform_admins
      WHERE user_id = (select auth.uid()) AND is_active = true
    )
  );

DROP POLICY IF EXISTS "Platform admins can update system_config" ON public.system_config;
CREATE POLICY "Platform admins can update system_config"
  ON public.system_config FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.platform_admins
      WHERE user_id = (select auth.uid()) AND is_active = true
    )
  );

-- demo_accounts table policy
DROP POLICY IF EXISTS "Demo accounts viewable by owner or platform admin" ON public.demo_accounts;
CREATE POLICY "Demo accounts viewable by owner or platform admin"
  ON public.demo_accounts FOR SELECT
  TO authenticated
  USING (
    user_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.platform_admins
      WHERE user_id = (select auth.uid()) AND is_active = true
    )
  );

-- projects table policy
DROP POLICY IF EXISTS "Platform admins can view all projects" ON public.projects;
CREATE POLICY "Platform admins can view all projects"
  ON public.projects FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.platform_admins
      WHERE user_id = (select auth.uid()) AND is_active = true
    )
  );

-- quote_items platform admin policy
DROP POLICY IF EXISTS "Platform admins can view all quote items" ON public.quote_items;
CREATE POLICY "Platform admins can view all quote items"
  ON public.quote_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.platform_admins
      WHERE user_id = (select auth.uid()) AND is_active = true
    )
  );

-- organisations table policies
DROP POLICY IF EXISTS "Platform admins can update organisations" ON public.organisations;
CREATE POLICY "Platform admins can update organisations"
  ON public.organisations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.platform_admins
      WHERE user_id = (select auth.uid()) AND is_active = true
    )
  );

DROP POLICY IF EXISTS "Platform admins can create organisations" ON public.organisations;
CREATE POLICY "Platform admins can create organisations"
  ON public.organisations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.platform_admins
      WHERE user_id = (select auth.uid()) AND is_active = true
    )
  );

-- organisation_members table policies
DROP POLICY IF EXISTS "Users can view memberships" ON public.organisation_members;
CREATE POLICY "Users can view memberships"
  ON public.organisation_members FOR SELECT
  TO authenticated
  USING (
    user_id = (select auth.uid())
    OR organisation_id IN (
      SELECT organisation_id FROM public.organisation_members
      WHERE user_id = (select auth.uid()) AND status = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM public.platform_admins
      WHERE user_id = (select auth.uid()) AND is_active = true
    )
  );

DROP POLICY IF EXISTS "Users can insert memberships in their org" ON public.organisation_members;
CREATE POLICY "Users can insert memberships in their org"
  ON public.organisation_members FOR INSERT
  TO authenticated
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM public.organisation_members
      WHERE user_id = (select auth.uid()) AND status = 'active' AND role IN ('admin', 'owner')
    )
    OR EXISTS (
      SELECT 1 FROM public.platform_admins
      WHERE user_id = (select auth.uid()) AND is_active = true
    )
  );

DROP POLICY IF EXISTS "Users can update memberships in their org" ON public.organisation_members;
CREATE POLICY "Users can update memberships in their org"
  ON public.organisation_members FOR UPDATE
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM public.organisation_members
      WHERE user_id = (select auth.uid()) AND status = 'active' AND role IN ('admin', 'owner')
    )
    OR EXISTS (
      SELECT 1 FROM public.platform_admins
      WHERE user_id = (select auth.uid()) AND is_active = true
    )
  );

DROP POLICY IF EXISTS "Users can delete memberships in their org" ON public.organisation_members;
CREATE POLICY "Users can delete memberships in their org"
  ON public.organisation_members FOR DELETE
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM public.organisation_members
      WHERE user_id = (select auth.uid()) AND status = 'active' AND role IN ('admin', 'owner')
    )
    OR EXISTS (
      SELECT 1 FROM public.platform_admins
      WHERE user_id = (select auth.uid()) AND is_active = true
    )
  );
