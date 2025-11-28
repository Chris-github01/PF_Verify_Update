/*
  # Optimize quotes policies to prevent stack depth issues
  
  The quotes INSERT policy queries organisation_members through projects,
  which can cause stack depth issues when combined with other policies.
  
  ## Solution
  Create a helper function that checks if a user can access a project
  using SECURITY DEFINER to bypass intermediate RLS checks.
  
  ## Changes
  - Create helper function: can_user_access_project
  - Update quotes policies to use this helper
  - Reduces query depth and prevents stack overflow
*/

-- Helper function to check if user can access a project
CREATE OR REPLACE FUNCTION public.can_user_access_project(check_project_id uuid, check_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM projects p
    JOIN organisation_members om ON om.organisation_id = p.organisation_id
    WHERE p.id = check_project_id
    AND om.user_id = check_user_id
    AND om.status = 'active'
  )
  OR
  -- God-Mode users can access all projects
  EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = check_user_id
    AND email IN ('chris@optimalfire.co.nz', 'pieter@optimalfire.co.nz')
  );
$$;

-- Recreate quotes policies using helper function

-- SELECT policy
DROP POLICY IF EXISTS "Users can view quotes in their organisation projects" ON quotes;
CREATE POLICY "Users can view quotes in their organisation projects"
  ON quotes FOR SELECT
  TO authenticated
  USING (
    can_user_access_project(project_id, auth.uid())
  );

-- INSERT policy
DROP POLICY IF EXISTS "Users can create quotes in their organisation projects" ON quotes;
CREATE POLICY "Users can create quotes in their organisation projects"
  ON quotes FOR INSERT
  TO authenticated
  WITH CHECK (
    can_user_access_project(project_id, auth.uid())
  );

-- UPDATE policy (if doesn't exist, create it)
DROP POLICY IF EXISTS "Users can update quotes in their organisation projects" ON quotes;
CREATE POLICY "Users can update quotes in their organisation projects"
  ON quotes FOR UPDATE
  TO authenticated
  USING (
    can_user_access_project(project_id, auth.uid())
  );

-- DELETE policy
DROP POLICY IF EXISTS "Users can delete quotes in their organisation projects" ON quotes;
CREATE POLICY "Users can delete quotes in their organisation projects"
  ON quotes FOR DELETE
  TO authenticated
  USING (
    can_user_access_project(project_id, auth.uid())
  );
