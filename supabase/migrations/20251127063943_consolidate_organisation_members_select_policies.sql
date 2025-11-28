/*
  # Consolidate organisation_members SELECT policies to prevent recursion
  
  Having multiple permissive SELECT policies can cause PostgreSQL to evaluate
  them in ways that trigger recursion. Consolidating into a single policy
  with an OR condition prevents this.
  
  ## Changes
  - Drop both existing SELECT policies
  - Create single unified SELECT policy with OR logic
  - Keep INSERT/UPDATE/DELETE policies separate (as they should be)
*/

-- Drop existing SELECT policies
DROP POLICY IF EXISTS "God-Mode users can view all memberships" ON organisation_members;
DROP POLICY IF EXISTS "Users can view their own memberships" ON organisation_members;

-- Create single consolidated SELECT policy with OR logic
CREATE POLICY "Users can view memberships"
  ON organisation_members FOR SELECT
  TO authenticated
  USING (
    -- User can view their own memberships
    user_id = auth.uid()
    OR
    -- God-Mode users can view all memberships
    COALESCE(
      (auth.jwt() -> 'email')::text IN (
        '"chris@optimalfire.co.nz"',
        '"pieter@optimalfire.co.nz"'
      ),
      false
    )
  );

-- Ensure we have INSERT/UPDATE/DELETE policies (these should already exist)
-- If not, we need to add them

-- Add INSERT policy if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'organisation_members' 
    AND cmd = 'INSERT'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can insert memberships in their org"
      ON organisation_members FOR INSERT
      TO authenticated
      WITH CHECK (
        -- Platform admins can add members
        EXISTS (
          SELECT 1 FROM platform_admins 
          WHERE user_id = auth.uid() AND is_active = true
        )
        OR
        -- Organisation owners can add members
        organisation_id IN (
          SELECT organisation_id FROM organisation_members
          WHERE user_id = auth.uid() 
          AND role = ''owner'' 
          AND status = ''active''
        )
      )';
  END IF;
END $$;

-- Add UPDATE policy if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'organisation_members' 
    AND cmd = 'UPDATE'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can update memberships in their org"
      ON organisation_members FOR UPDATE
      TO authenticated
      USING (
        -- Platform admins can update members
        EXISTS (
          SELECT 1 FROM platform_admins 
          WHERE user_id = auth.uid() AND is_active = true
        )
        OR
        -- Organisation owners can update members
        organisation_id IN (
          SELECT organisation_id FROM organisation_members
          WHERE user_id = auth.uid() 
          AND role = ''owner'' 
          AND status = ''active''
        )
      )';
  END IF;
END $$;

-- Add DELETE policy if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'organisation_members' 
    AND cmd = 'DELETE'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can delete memberships in their org"
      ON organisation_members FOR DELETE
      TO authenticated
      USING (
        -- Platform admins can delete members
        EXISTS (
          SELECT 1 FROM platform_admins 
          WHERE user_id = auth.uid() AND is_active = true
        )
        OR
        -- Organisation owners can delete members
        organisation_id IN (
          SELECT organisation_id FROM organisation_members
          WHERE user_id = auth.uid() 
          AND role = ''owner'' 
          AND status = ''active''
        )
      )';
  END IF;
END $$;
