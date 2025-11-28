/*
  # Consolidate multiple permissive RLS policies
  
  Having multiple permissive SELECT policies for the same role can cause confusion
  and performance issues. This migration consolidates them into single policies
  using OR logic.
  
  ## Tables Updated
  1. award_reports - Merge view and manage SELECT policies
  2. organisation_members - Keep necessary policies, remove temporary one
  3. project_settings - Merge view and manage SELECT policies
  4. scope_categories - Merge view and manage SELECT policies
  5. user_preferences - Merge view and manage SELECT policies
  
  ## Performance Impact
  - Simpler policy evaluation
  - Clearer security model
  - Easier to maintain
*/

-- award_reports: Consolidate into single SELECT policy
DROP POLICY IF EXISTS "Users can view award reports in their org" ON award_reports;
DROP POLICY IF EXISTS "Users can manage award reports in their org" ON award_reports;

CREATE POLICY "Users can view and manage award reports in their org"
  ON award_reports FOR SELECT
  TO authenticated
  USING (
    project_id IN (
      SELECT id FROM projects
      WHERE organisation_id IN (
        SELECT organisation_id FROM organisation_members
        WHERE user_id = (SELECT auth.uid()) AND status = 'active'
      )
    )
  );

CREATE POLICY "Users can modify award reports in their org"
  ON award_reports FOR ALL
  TO authenticated
  USING (
    project_id IN (
      SELECT id FROM projects
      WHERE organisation_id IN (
        SELECT organisation_id FROM organisation_members
        WHERE user_id = (SELECT auth.uid()) AND status = 'active'
      )
    )
  )
  WITH CHECK (
    project_id IN (
      SELECT id FROM projects
      WHERE organisation_id IN (
        SELECT organisation_id FROM organisation_members
        WHERE user_id = (SELECT auth.uid()) AND status = 'active'
      )
    )
  );

-- organisation_members: Remove temporary policy, keep specific policies
DROP POLICY IF EXISTS "Authenticated users can view all org members (TEMPORARY)" ON organisation_members;

-- project_settings: Consolidate into single SELECT policy
DROP POLICY IF EXISTS "Users can view project settings in their organisation" ON project_settings;
DROP POLICY IF EXISTS "Users can manage project settings in their organisation" ON project_settings;

CREATE POLICY "Users can view project settings in their organisation"
  ON project_settings FOR SELECT
  TO authenticated
  USING (
    project_id IN (
      SELECT id FROM projects
      WHERE organisation_id IN (
        SELECT organisation_id FROM organisation_members
        WHERE user_id = (SELECT auth.uid()) AND status = 'active'
      )
    )
  );

CREATE POLICY "Users can modify project settings in their organisation"
  ON project_settings FOR ALL
  TO authenticated
  USING (
    project_id IN (
      SELECT id FROM projects
      WHERE organisation_id IN (
        SELECT organisation_id FROM organisation_members
        WHERE user_id = (SELECT auth.uid()) AND status = 'active'
      )
    )
  )
  WITH CHECK (
    project_id IN (
      SELECT id FROM projects
      WHERE organisation_id IN (
        SELECT organisation_id FROM organisation_members
        WHERE user_id = (SELECT auth.uid()) AND status = 'active'
      )
    )
  );

-- scope_categories: Consolidate into single SELECT policy
DROP POLICY IF EXISTS "Users can view scope categories in their org" ON scope_categories;
DROP POLICY IF EXISTS "Users can manage scope categories in their org" ON scope_categories;

CREATE POLICY "Users can view scope categories in their org"
  ON scope_categories FOR SELECT
  TO authenticated
  USING (
    project_id IN (
      SELECT id FROM projects
      WHERE organisation_id IN (
        SELECT organisation_id FROM organisation_members
        WHERE user_id = (SELECT auth.uid()) AND status = 'active'
      )
    )
  );

CREATE POLICY "Users can modify scope categories in their org"
  ON scope_categories FOR ALL
  TO authenticated
  USING (
    project_id IN (
      SELECT id FROM projects
      WHERE organisation_id IN (
        SELECT organisation_id FROM organisation_members
        WHERE user_id = (SELECT auth.uid()) AND status = 'active'
      )
    )
  )
  WITH CHECK (
    project_id IN (
      SELECT id FROM projects
      WHERE organisation_id IN (
        SELECT organisation_id FROM organisation_members
        WHERE user_id = (SELECT auth.uid()) AND status = 'active'
      )
    )
  );

-- user_preferences: Consolidate into single SELECT policy
DROP POLICY IF EXISTS "Users can view own preferences" ON user_preferences;
DROP POLICY IF EXISTS "Users can manage own preferences" ON user_preferences;

CREATE POLICY "Users can view own preferences"
  ON user_preferences FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can modify own preferences"
  ON user_preferences FOR ALL
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
