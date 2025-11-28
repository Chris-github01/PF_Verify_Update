/*
  # Fix platform_admins RLS circular dependency
  
  1. Problem
    - platform_admins SELECT policy calls is_active_platform_admin()
    - is_active_platform_admin() queries platform_admins table
    - This creates infinite recursion - users can't check if they're admin because they need to be admin to check
  
  2. Solution
    - Allow users to see their own admin record (user_id = auth.uid())
    - This breaks the circular dependency
    - Users can only see their own record, not other admins
  
  3. Security
    - Users can only view their own admin status
    - Only existing platform admins can INSERT/UPDATE/DELETE admin records
*/

-- Drop and recreate SELECT policy to break circular dependency
DROP POLICY IF EXISTS "Platform admins can view all admins" ON platform_admins;

CREATE POLICY "Users can view own admin status"
  ON platform_admins
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
  );

-- Add separate policy for platform admins to view all admin records
CREATE POLICY "Platform admins can view all admin records"
  ON platform_admins
  FOR SELECT
  TO authenticated
  USING (
    is_active_platform_admin() AND user_id != auth.uid()
  );
