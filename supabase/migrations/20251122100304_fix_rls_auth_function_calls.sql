/*
  # Fix RLS Auth Function Performance

  1. Problem
    - RLS policies calling auth.uid() directly re-evaluate for each row
    - This causes O(n) function calls instead of O(1)
    - Severe performance degradation at scale

  2. Solution
    - Wrap auth function calls in SELECT subqueries
    - Function is evaluated once and cached for the query
    - Converts O(n) to O(1) complexity

  3. Policies Fixed
    - platform_admins: Platform admins can view themselves
    - organisations: Platform admins can create/view/update
    - admin_audit_log: Platform admins can view audit logs

  4. Performance Impact
    - Up to 1000x faster on large result sets
    - Recommended by Supabase best practices
*/

-- Drop existing policies that need to be fixed
DROP POLICY IF EXISTS "Platform admins can view themselves" ON platform_admins;
DROP POLICY IF EXISTS "Platform admins can create organisations" ON organisations;
DROP POLICY IF EXISTS "Platform admins can update all organisations" ON organisations;
DROP POLICY IF EXISTS "Platform admins can view all organisations" ON organisations;
DROP POLICY IF EXISTS "Platform admins can view audit logs" ON admin_audit_log;

-- Recreate policies with SELECT optimization

-- Platform Admins Table
CREATE POLICY "Platform admins can view themselves"
  ON platform_admins
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- Organisations Table - Platform Admin Policies
CREATE POLICY "Platform admins can create organisations"
  ON organisations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE user_id = (select auth.uid())
      AND is_active = true
    )
  );

CREATE POLICY "Platform admins can view all organisations"
  ON organisations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE user_id = (select auth.uid())
      AND is_active = true
    )
  );

CREATE POLICY "Platform admins can update all organisations"
  ON organisations
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE user_id = (select auth.uid())
      AND is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE user_id = (select auth.uid())
      AND is_active = true
    )
  );

-- Admin Audit Log
CREATE POLICY "Platform admins can view audit logs"
  ON admin_audit_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE user_id = (select auth.uid())
      AND is_active = true
    )
  );
