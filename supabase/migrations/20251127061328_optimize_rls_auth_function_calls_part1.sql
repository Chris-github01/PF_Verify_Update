/*
  # Optimize RLS policies - Part 1: Core tables
  
  Replace direct auth.uid() calls with (SELECT auth.uid()) to prevent re-evaluation
  for each row, significantly improving query performance at scale.
  
  This migration covers:
  - platform_admins
  - quotes (view, create, delete policies)
  - organisation_members
  - user_preferences
  
  ## Performance Impact
  - Auth function evaluated once per query instead of once per row
  - Can reduce query time by 10-100x on large datasets
*/

-- platform_admins policies
DROP POLICY IF EXISTS "Platform admins can view themselves" ON platform_admins;
CREATE POLICY "Platform admins can view themselves"
  ON platform_admins FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- quotes policies
DROP POLICY IF EXISTS "Users can view quotes in their organisation projects" ON quotes;
CREATE POLICY "Users can view quotes in their organisation projects"
  ON quotes FOR SELECT
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

DROP POLICY IF EXISTS "Users can create quotes in their organisation projects" ON quotes;
CREATE POLICY "Users can create quotes in their organisation projects"
  ON quotes FOR INSERT
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

DROP POLICY IF EXISTS "Users can delete quotes in their organisation projects" ON quotes;
CREATE POLICY "Users can delete quotes in their organisation projects"
  ON quotes FOR DELETE
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

-- organisation_members policies
DROP POLICY IF EXISTS "Users can view their own memberships" ON organisation_members;
CREATE POLICY "Users can view their own memberships"
  ON organisation_members FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "God-Mode owners can view all memberships" ON organisation_members;
CREATE POLICY "God-Mode owners can view all memberships"
  ON organisation_members FOR SELECT
  TO authenticated
  USING (
    organisation_id IN (
      SELECT id FROM organisations WHERE name = 'God Mode Test Org'
    )
    AND (SELECT auth.uid()) IN (
      SELECT user_id FROM organisation_members
      WHERE organisation_id IN (SELECT id FROM organisations WHERE name = 'God Mode Test Org')
      AND role = 'owner' AND status = 'active'
    )
  );

-- user_preferences policies
DROP POLICY IF EXISTS "Users can manage own preferences" ON user_preferences;
CREATE POLICY "Users can manage own preferences"
  ON user_preferences FOR ALL
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can view own preferences" ON user_preferences;
CREATE POLICY "Users can view own preferences"
  ON user_preferences FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));
