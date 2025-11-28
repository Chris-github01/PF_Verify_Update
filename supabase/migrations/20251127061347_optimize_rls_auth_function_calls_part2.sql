/*
  # Optimize RLS policies - Part 2: Category and Items tables
  
  Replace direct auth.uid() calls with (SELECT auth.uid()) for:
  - scope_categories
  - quote_items
  - parsing_jobs
  
  ## Performance Impact
  - Auth function evaluated once per query instead of once per row
*/

-- scope_categories policies
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

DROP POLICY IF EXISTS "Users can manage scope categories in their org" ON scope_categories;
CREATE POLICY "Users can manage scope categories in their org"
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

-- quote_items policies
DROP POLICY IF EXISTS "Users can view quote items in their organisation" ON quote_items;
CREATE POLICY "Users can view quote items in their organisation"
  ON quote_items FOR SELECT
  TO authenticated
  USING (
    quote_id IN (
      SELECT q.id FROM quotes q
      JOIN projects p ON p.id = q.project_id
      WHERE p.organisation_id IN (
        SELECT organisation_id FROM organisation_members
        WHERE user_id = (SELECT auth.uid()) AND status = 'active'
      )
    )
  );

DROP POLICY IF EXISTS "Users can insert quote items in their organisation" ON quote_items;
CREATE POLICY "Users can insert quote items in their organisation"
  ON quote_items FOR INSERT
  TO authenticated
  WITH CHECK (
    quote_id IN (
      SELECT q.id FROM quotes q
      JOIN projects p ON p.id = q.project_id
      WHERE p.organisation_id IN (
        SELECT organisation_id FROM organisation_members
        WHERE user_id = (SELECT auth.uid()) AND status = 'active'
      )
    )
  );

DROP POLICY IF EXISTS "Users can update quote items in their organisation" ON quote_items;
CREATE POLICY "Users can update quote items in their organisation"
  ON quote_items FOR UPDATE
  TO authenticated
  USING (
    quote_id IN (
      SELECT q.id FROM quotes q
      JOIN projects p ON p.id = q.project_id
      WHERE p.organisation_id IN (
        SELECT organisation_id FROM organisation_members
        WHERE user_id = (SELECT auth.uid()) AND status = 'active'
      )
    )
  );

DROP POLICY IF EXISTS "Users can delete quote items in their organisation" ON quote_items;
CREATE POLICY "Users can delete quote items in their organisation"
  ON quote_items FOR DELETE
  TO authenticated
  USING (
    quote_id IN (
      SELECT q.id FROM quotes q
      JOIN projects p ON p.id = q.project_id
      WHERE p.organisation_id IN (
        SELECT organisation_id FROM organisation_members
        WHERE user_id = (SELECT auth.uid()) AND status = 'active'
      )
    )
  );

-- parsing_jobs policies
DROP POLICY IF EXISTS "Users can view parsing jobs in their organisation" ON parsing_jobs;
CREATE POLICY "Users can view parsing jobs in their organisation"
  ON parsing_jobs FOR SELECT
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

DROP POLICY IF EXISTS "Users can create parsing jobs in their organisation" ON parsing_jobs;
CREATE POLICY "Users can create parsing jobs in their organisation"
  ON parsing_jobs FOR INSERT
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

DROP POLICY IF EXISTS "Users can update parsing jobs in their organisation" ON parsing_jobs;
CREATE POLICY "Users can update parsing jobs in their organisation"
  ON parsing_jobs FOR UPDATE
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
