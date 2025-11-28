/*
  # Consolidate Organisation Policies

  1. Problem
    - Multiple permissive policies for same action on organisations table
    - Makes policy evaluation less predictable
    - Harder to maintain and audit
    - Can cause confusion about access control

  2. Solution
    - Combine multiple permissive policies into single policies using OR
    - Clearer access control logic
    - Easier to maintain and understand
    - Better performance with single policy evaluation

  3. Consolidated Policies
    - INSERT: Platform admins OR regular users
    - SELECT: Platform admins OR members of organisation
    - UPDATE: Platform admins OR org owners/admins

  4. Important Notes
    - Maintains same access control, just consolidated
    - Uses SELECT optimization for auth functions
    - Single source of truth for each action
*/

-- Drop existing policies (already done in previous migration, but safe to repeat)
DROP POLICY IF EXISTS "Platform admins can create organisations" ON organisations;
DROP POLICY IF EXISTS "Users can create organisations" ON organisations;
DROP POLICY IF EXISTS "Platform admins can view all organisations" ON organisations;
DROP POLICY IF EXISTS "Users can view their organisations" ON organisations;
DROP POLICY IF EXISTS "Platform admins can update all organisations" ON organisations;
DROP POLICY IF EXISTS "Org owners and admins can update organisation" ON organisations;

-- Consolidated INSERT policy
CREATE POLICY "Authenticated users can create organisations"
  ON organisations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Platform admins can create any organisation
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE user_id = (select auth.uid())
      AND is_active = true
    )
    OR
    -- Regular users can create organisations
    (select auth.uid()) IS NOT NULL
  );

-- Consolidated SELECT policy
CREATE POLICY "Users can view accessible organisations"
  ON organisations
  FOR SELECT
  TO authenticated
  USING (
    -- Platform admins can view all
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE user_id = (select auth.uid())
      AND is_active = true
    )
    OR
    -- Members can view their organisations
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = organisations.id
      AND organisation_members.user_id = (select auth.uid())
      AND organisation_members.status = 'active'
    )
  );

-- Consolidated UPDATE policy
CREATE POLICY "Authorized users can update organisations"
  ON organisations
  FOR UPDATE
  TO authenticated
  USING (
    -- Platform admins can update all
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE user_id = (select auth.uid())
      AND is_active = true
    )
    OR
    -- Org owners and admins can update their org
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = organisations.id
      AND organisation_members.user_id = (select auth.uid())
      AND organisation_members.status = 'active'
      AND organisation_members.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    -- Same conditions for WITH CHECK
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE user_id = (select auth.uid())
      AND is_active = true
    )
    OR
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE organisation_members.organisation_id = organisations.id
      AND organisation_members.user_id = (select auth.uid())
      AND organisation_members.status = 'active'
      AND organisation_members.role IN ('owner', 'admin')
    )
  );
