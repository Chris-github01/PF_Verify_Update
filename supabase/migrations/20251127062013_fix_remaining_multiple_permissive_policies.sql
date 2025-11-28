/*
  # Fix remaining multiple permissive policies
  
  Consolidate duplicate SELECT policies into single policies to improve
  performance and clarity. Each table should have one SELECT policy per role.
  
  ## Tables Fixed
  1. award_reports - Remove duplicate, keep single SELECT policy
  2. organisation_members - Keep both (different purposes)
  3. project_settings - Remove duplicate, keep single SELECT policy
  4. scope_categories - Remove duplicate, keep single SELECT policy
  5. user_preferences - Remove duplicate, keep single SELECT policy
  
  ## Performance Impact
  - Simpler policy evaluation
  - Clearer security model
  - Easier to maintain
*/

-- award_reports: Remove the "modify" SELECT policy, keep view policy only
DROP POLICY IF EXISTS "Users can modify award reports in their org" ON award_reports;
DROP POLICY IF EXISTS "Users can view and manage award reports in their org" ON award_reports;

CREATE POLICY "Users can view award reports in their org"
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

CREATE POLICY "Users can manage award reports in their org"
  ON award_reports FOR INSERT
  TO authenticated
  WITH CHECK (
    project_id IN (
      SELECT id FROM projects
      WHERE organisation_id IN (
        SELECT organisation_id FROM organisation_members
        WHERE user_id = (SELECT auth.uid()) AND status = 'active'
      )
    )
  );

CREATE POLICY "Users can update award reports in their org"
  ON award_reports FOR UPDATE
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

CREATE POLICY "Users can delete award reports in their org"
  ON award_reports FOR DELETE
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

-- project_settings: Remove duplicate, keep single SELECT
DROP POLICY IF EXISTS "Users can modify project settings in their organisation" ON project_settings;
DROP POLICY IF EXISTS "Users can view project settings in their organisation" ON project_settings;

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

CREATE POLICY "Users can insert project settings in their organisation"
  ON project_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    project_id IN (
      SELECT id FROM projects
      WHERE organisation_id IN (
        SELECT organisation_id FROM organisation_members
        WHERE user_id = (SELECT auth.uid()) AND status = 'active'
      )
    )
  );

CREATE POLICY "Users can update project settings in their organisation"
  ON project_settings FOR UPDATE
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

CREATE POLICY "Users can delete project settings in their organisation"
  ON project_settings FOR DELETE
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

-- scope_categories: Remove duplicate, keep single SELECT
DROP POLICY IF EXISTS "Users can modify scope categories in their org" ON scope_categories;
DROP POLICY IF EXISTS "Users can view scope categories in their org" ON scope_categories;

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

CREATE POLICY "Users can insert scope categories in their org"
  ON scope_categories FOR INSERT
  TO authenticated
  WITH CHECK (
    project_id IN (
      SELECT id FROM projects
      WHERE organisation_id IN (
        SELECT organisation_id FROM organisation_members
        WHERE user_id = (SELECT auth.uid()) AND status = 'active'
      )
    )
  );

CREATE POLICY "Users can update scope categories in their org"
  ON scope_categories FOR UPDATE
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

CREATE POLICY "Users can delete scope categories in their org"
  ON scope_categories FOR DELETE
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

-- user_preferences: Remove duplicate, keep single SELECT
DROP POLICY IF EXISTS "Users can modify own preferences" ON user_preferences;
DROP POLICY IF EXISTS "Users can view own preferences" ON user_preferences;

CREATE POLICY "Users can view own preferences"
  ON user_preferences FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can insert own preferences"
  ON user_preferences FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update own preferences"
  ON user_preferences FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can delete own preferences"
  ON user_preferences FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));
