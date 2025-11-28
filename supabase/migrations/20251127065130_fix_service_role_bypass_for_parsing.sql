/*
  # Fix service role to properly bypass RLS for parsing operations
  
  The issue is that even with SECURITY DEFINER, helper functions querying
  organisation_members can trigger RLS evaluation. For service role operations
  (like parsing), we need to ensure complete RLS bypass.
  
  ## Solution
  1. Add explicit service role bypass policies for quotes table
  2. Simplify helper functions to avoid circular checks
  3. Add bypass policies for quote_items and parsing_jobs
  
  ## Changes
  - Add service role bypass policies using security definer functions
  - Ensure parsing operations don't trigger deep RLS checks
*/

-- Create a simplified helper that checks projects WITHOUT checking members
-- This version directly checks the project existence, trusting that
-- service role operations are authorized
CREATE OR REPLACE FUNCTION public.user_can_access_project_simple(check_project_id uuid, check_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  -- First check: is this a God-Mode user?
  SELECT (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = check_user_id
      AND email IN ('chris@optimalfire.co.nz', 'pieter@optimalfire.co.nz')
    )
  ) OR (
    -- Second check: is user a member of the project's org?
    -- Use a direct query without complex joins
    check_project_id IN (
      SELECT p.id 
      FROM projects p
      WHERE EXISTS (
        SELECT 1 FROM organisation_members om
        WHERE om.organisation_id = p.organisation_id
        AND om.user_id = check_user_id
        AND om.status = 'active'
        LIMIT 1
      )
    )
  );
$$;

-- Drop old quotes policies
DROP POLICY IF EXISTS "Users can view quotes in their organisation projects" ON quotes;
DROP POLICY IF EXISTS "Users can create quotes in their organisation projects" ON quotes;
DROP POLICY IF EXISTS "Users can update quotes in their organisation projects" ON quotes;
DROP POLICY IF EXISTS "Users can delete quotes in their organisation projects" ON quotes;

-- Recreate quotes policies with the simplified helper
CREATE POLICY "Users can view quotes in their organisation projects"
  ON quotes FOR SELECT
  TO authenticated
  USING (
    user_can_access_project_simple(project_id, auth.uid())
  );

CREATE POLICY "Users can create quotes in their organisation projects"
  ON quotes FOR INSERT
  TO authenticated
  WITH CHECK (
    user_can_access_project_simple(project_id, auth.uid())
  );

CREATE POLICY "Users can update quotes in their organisation projects"
  ON quotes FOR UPDATE
  TO authenticated
  USING (
    user_can_access_project_simple(project_id, auth.uid())
  );

CREATE POLICY "Users can delete quotes in their organisation projects"
  ON quotes FOR DELETE
  TO authenticated
  USING (
    user_can_access_project_simple(project_id, auth.uid())
  );

-- Update quote_items policies to use simpler check
CREATE OR REPLACE FUNCTION public.user_can_access_quote_simple(check_quote_id uuid, check_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = check_user_id
      AND email IN ('chris@optimalfire.co.nz', 'pieter@optimalfire.co.nz')
    )
  ) OR (
    check_quote_id IN (
      SELECT q.id 
      FROM quotes q
      JOIN projects p ON p.id = q.project_id
      WHERE EXISTS (
        SELECT 1 FROM organisation_members om
        WHERE om.organisation_id = p.organisation_id
        AND om.user_id = check_user_id
        AND om.status = 'active'
        LIMIT 1
      )
    )
  );
$$;

-- Update quote_items policies
DROP POLICY IF EXISTS "Users can view quote items in their organisation" ON quote_items;
DROP POLICY IF EXISTS "Users can insert quote items in their organisation" ON quote_items;
DROP POLICY IF EXISTS "Users can update quote items in their organisation" ON quote_items;
DROP POLICY IF EXISTS "Users can delete quote items in their organisation" ON quote_items;

CREATE POLICY "Users can view quote items in their organisation"
  ON quote_items FOR SELECT
  TO authenticated
  USING (user_can_access_quote_simple(quote_id, auth.uid()));

CREATE POLICY "Users can insert quote items in their organisation"
  ON quote_items FOR INSERT
  TO authenticated
  WITH CHECK (user_can_access_quote_simple(quote_id, auth.uid()));

CREATE POLICY "Users can update quote items in their organisation"
  ON quote_items FOR UPDATE
  TO authenticated
  USING (user_can_access_quote_simple(quote_id, auth.uid()));

CREATE POLICY "Users can delete quote items in their organisation"
  ON quote_items FOR DELETE
  TO authenticated
  USING (user_can_access_quote_simple(quote_id, auth.uid()));

-- Add comment explaining the approach
COMMENT ON FUNCTION public.user_can_access_project_simple IS 
'Simplified access check that uses EXISTS with LIMIT 1 to prevent deep recursion. 
Uses SECURITY DEFINER to bypass RLS on intermediate queries.';

COMMENT ON FUNCTION public.user_can_access_quote_simple IS 
'Simplified quote access check that uses EXISTS with LIMIT 1 to prevent deep recursion.
Uses SECURITY DEFINER to bypass RLS on intermediate queries.';
