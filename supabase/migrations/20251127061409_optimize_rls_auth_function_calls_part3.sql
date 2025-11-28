/*
  # Optimize RLS policies - Part 3: Settings, Reports, Revisions, and Chunks
  
  Replace direct auth.uid() calls with (SELECT auth.uid()) for:
  - project_settings
  - award_reports
  - quote_revisions_diff
  - quote_revision_timeline
  - parsing_chunks
  
  ## Performance Impact
  - Auth function evaluated once per query instead of once per row
*/

-- project_settings policies
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

DROP POLICY IF EXISTS "Users can manage project settings in their organisation" ON project_settings;
CREATE POLICY "Users can manage project settings in their organisation"
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

-- award_reports policies
DROP POLICY IF EXISTS "Users can view award reports in their org" ON award_reports;
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

DROP POLICY IF EXISTS "Users can manage award reports in their org" ON award_reports;
CREATE POLICY "Users can manage award reports in their org"
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

-- quote_revisions_diff policies
DROP POLICY IF EXISTS "Users can view diffs for their projects" ON quote_revisions_diff;
CREATE POLICY "Users can view diffs for their projects"
  ON quote_revisions_diff FOR SELECT
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

DROP POLICY IF EXISTS "Users can insert diffs for their projects" ON quote_revisions_diff;
CREATE POLICY "Users can insert diffs for their projects"
  ON quote_revisions_diff FOR INSERT
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

-- quote_revision_timeline policies
DROP POLICY IF EXISTS "Users can view timeline for their projects" ON quote_revision_timeline;
CREATE POLICY "Users can view timeline for their projects"
  ON quote_revision_timeline FOR SELECT
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

DROP POLICY IF EXISTS "Users can insert timeline events for their projects" ON quote_revision_timeline;
CREATE POLICY "Users can insert timeline events for their projects"
  ON quote_revision_timeline FOR INSERT
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

-- parsing_chunks policies
DROP POLICY IF EXISTS "Users can view chunks for jobs in their organisation" ON parsing_chunks;
CREATE POLICY "Users can view chunks for jobs in their organisation"
  ON parsing_chunks FOR SELECT
  TO authenticated
  USING (
    job_id IN (
      SELECT pj.id FROM parsing_jobs pj
      JOIN projects p ON p.id = pj.project_id
      WHERE p.organisation_id IN (
        SELECT organisation_id FROM organisation_members
        WHERE user_id = (SELECT auth.uid()) AND status = 'active'
      )
    )
  );

DROP POLICY IF EXISTS "Users can insert chunks for jobs in their organisation" ON parsing_chunks;
CREATE POLICY "Users can insert chunks for jobs in their organisation"
  ON parsing_chunks FOR INSERT
  TO authenticated
  WITH CHECK (
    job_id IN (
      SELECT pj.id FROM parsing_jobs pj
      JOIN projects p ON p.id = pj.project_id
      WHERE p.organisation_id IN (
        SELECT organisation_id FROM organisation_members
        WHERE user_id = (SELECT auth.uid()) AND status = 'active'
      )
    )
  );

DROP POLICY IF EXISTS "Users can update chunks for jobs in their organisation" ON parsing_chunks;
CREATE POLICY "Users can update chunks for jobs in their organisation"
  ON parsing_chunks FOR UPDATE
  TO authenticated
  USING (
    job_id IN (
      SELECT pj.id FROM parsing_jobs pj
      JOIN projects p ON p.id = pj.project_id
      WHERE p.organisation_id IN (
        SELECT organisation_id FROM organisation_members
        WHERE user_id = (SELECT auth.uid()) AND status = 'active'
      )
    )
  );
