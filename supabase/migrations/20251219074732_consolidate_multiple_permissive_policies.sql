/*
  # Consolidate Multiple Permissive Policies

  This migration consolidates multiple permissive policies for the same table
  and operation into single policies with OR conditions. This improves query
  planning and performance.

  ## Tables Updated

  1. **audit_events** - Merge platform admin and org user SELECT policies
  2. **audit_exports** - Merge platform admin and org user SELECT policies
  3. **audit_findings** - Merge platform admin and org user SELECT policies
  4. **audits** - Merge platform admin and org user SELECT policies
  5. **parsing_chunks** - Merge duplicate INSERT policies
  6. **projects** - Merge two SELECT policies
  7. **quote_items** - Merge platform admin and org user SELECT policies
  8. **quotes** - Merge platform admin and org user SELECT policies
  9. **suppliers** - Merge three SELECT policies
  10. **system_config** - Merge duplicate INSERT, SELECT, and UPDATE policies
*/

-- audit_events: Consolidate SELECT policies
DROP POLICY IF EXISTS "Platform admins can view all events" ON public.audit_events;
DROP POLICY IF EXISTS "Users can view events for their org" ON public.audit_events;

CREATE POLICY "Users and admins can view audit events"
  ON public.audit_events FOR SELECT
  TO authenticated
  USING (
    -- Platform admins can view all
    EXISTS (
      SELECT 1 FROM public.platform_admins
      WHERE user_id = (select auth.uid()) AND is_active = true
    )
    OR
    -- Org members can view their org's events
    organisation_id IN (
      SELECT organisation_id FROM public.organisation_members
      WHERE user_id = (select auth.uid()) AND status = 'active'
    )
  );

-- audit_exports: Consolidate SELECT policies
DROP POLICY IF EXISTS "Platform admins can view all exports" ON public.audit_exports;
DROP POLICY IF EXISTS "Users can view exports for their org audits" ON public.audit_exports;

CREATE POLICY "Users and admins can view audit exports"
  ON public.audit_exports FOR SELECT
  TO authenticated
  USING (
    -- Platform admins can view all
    EXISTS (
      SELECT 1 FROM public.platform_admins
      WHERE user_id = (select auth.uid()) AND is_active = true
    )
    OR
    -- Org members can view their org's exports
    audit_id IN (
      SELECT id FROM public.audits
      WHERE organisation_id IN (
        SELECT organisation_id FROM public.organisation_members
        WHERE user_id = (select auth.uid()) AND status = 'active'
      )
    )
  );

-- audit_findings: Consolidate SELECT policies
DROP POLICY IF EXISTS "Platform admins can view all findings" ON public.audit_findings;
DROP POLICY IF EXISTS "Users can view findings for their org audits" ON public.audit_findings;

CREATE POLICY "Users and admins can view audit findings"
  ON public.audit_findings FOR SELECT
  TO authenticated
  USING (
    -- Platform admins can view all
    EXISTS (
      SELECT 1 FROM public.platform_admins
      WHERE user_id = (select auth.uid()) AND is_active = true
    )
    OR
    -- Org members can view their org's findings
    audit_id IN (
      SELECT id FROM public.audits
      WHERE organisation_id IN (
        SELECT organisation_id FROM public.organisation_members
        WHERE user_id = (select auth.uid()) AND status = 'active'
      )
    )
  );

-- audits: Consolidate SELECT policies
DROP POLICY IF EXISTS "Platform admins can view all audits" ON public.audits;
DROP POLICY IF EXISTS "Users can view audits in their org" ON public.audits;

CREATE POLICY "Users and admins can view audits"
  ON public.audits FOR SELECT
  TO authenticated
  USING (
    -- Platform admins can view all
    EXISTS (
      SELECT 1 FROM public.platform_admins
      WHERE user_id = (select auth.uid()) AND is_active = true
    )
    OR
    -- Org members can view their org's audits
    organisation_id IN (
      SELECT organisation_id FROM public.organisation_members
      WHERE user_id = (select auth.uid()) AND status = 'active'
    )
  );

-- parsing_chunks: Consolidate INSERT policies
DROP POLICY IF EXISTS "Users can create parsing chunks" ON public.parsing_chunks;
DROP POLICY IF EXISTS "Users can insert chunks for jobs in their organisation" ON public.parsing_chunks;

CREATE POLICY "Users can insert parsing chunks"
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

-- projects: Consolidate SELECT policies
DROP POLICY IF EXISTS "Authenticated users can view all projects" ON public.projects;
DROP POLICY IF EXISTS "Platform admins can view all projects" ON public.projects;

CREATE POLICY "Authenticated users can view projects"
  ON public.projects FOR SELECT
  TO authenticated
  USING (true);

-- quote_items: Consolidate SELECT policies
DROP POLICY IF EXISTS "Platform admins can view all quote items" ON public.quote_items;
DROP POLICY IF EXISTS "Users can view quote items" ON public.quote_items;

CREATE POLICY "Users and admins can view quote items"
  ON public.quote_items FOR SELECT
  TO authenticated
  USING (
    -- Platform admins can view all
    EXISTS (
      SELECT 1 FROM public.platform_admins
      WHERE user_id = (select auth.uid()) AND is_active = true
    )
    OR
    -- Org members can view their org's quote items
    quote_id IN (
      SELECT id FROM public.quotes
      WHERE organisation_id IN (
        SELECT organisation_id FROM public.organisation_members
        WHERE user_id = (select auth.uid()) AND status = 'active'
      )
    )
  );

-- quotes: Consolidate SELECT policies
DROP POLICY IF EXISTS "Platform admins can view all quotes" ON public.quotes;
DROP POLICY IF EXISTS "Users can view quotes" ON public.quotes;

CREATE POLICY "Users and admins can view quotes"
  ON public.quotes FOR SELECT
  TO authenticated
  USING (
    -- Platform admins can view all
    EXISTS (
      SELECT 1 FROM public.platform_admins
      WHERE user_id = (select auth.uid()) AND is_active = true
    )
    OR
    -- Org members can view their org's quotes
    organisation_id IN (
      SELECT organisation_id FROM public.organisation_members
      WHERE user_id = (select auth.uid()) AND status = 'active'
    )
  );

-- suppliers: Consolidate SELECT policies
DROP POLICY IF EXISTS "Org admins can manage suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Platform admins can view all suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Users can view suppliers in their org" ON public.suppliers;

-- Recreate consolidated SELECT policy for suppliers
CREATE POLICY "Users and admins can view suppliers"
  ON public.suppliers FOR SELECT
  TO authenticated
  USING (
    -- Platform admins can view all
    EXISTS (
      SELECT 1 FROM public.platform_admins
      WHERE user_id = (select auth.uid()) AND is_active = true
    )
    OR
    -- Org members can view their org's suppliers
    organisation_id IN (
      SELECT organisation_id FROM public.organisation_members
      WHERE user_id = (select auth.uid()) AND status = 'active'
    )
  );

-- Recreate separate management policies for suppliers
CREATE POLICY "Org admins can manage suppliers"
  ON public.suppliers FOR ALL
  TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM public.organisation_members
      WHERE user_id = (select auth.uid()) AND status = 'active' AND role IN ('admin', 'owner')
    )
  );

-- system_config: Consolidate INSERT policies
DROP POLICY IF EXISTS "Platform admins can insert system_config" ON public.system_config;
DROP POLICY IF EXISTS "Platform admins can manage system config" ON public.system_config;

CREATE POLICY "Platform admins can insert system_config"
  ON public.system_config FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.platform_admins
      WHERE user_id = (select auth.uid()) AND is_active = true
    )
  );

-- system_config: Consolidate SELECT policies
DROP POLICY IF EXISTS "All users can view system config" ON public.system_config;
DROP POLICY IF EXISTS "Platform admins can read system_config" ON public.system_config;

CREATE POLICY "All users can view system config"
  ON public.system_config FOR SELECT
  TO authenticated
  USING (true);

-- system_config: Consolidate UPDATE policies
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
