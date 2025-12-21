/*
  # Fix Critical Circular RLS Dependency on platform_admins

  ## Problem
  The SELECT policy on platform_admins calls is_platform_admin(), which itself 
  queries platform_admins, creating an infinite recursion that blocks ALL access.
  
  This broke after recent security updates and is preventing platform admins from 
  seeing any organisations.

  ## Solution
  Allow users to check their own admin status without calling is_platform_admin().
  Once they can read their own row, the organisations and other tables can safely 
  call is_platform_admin().

  ## Changes
  1. Drop the circular SELECT policy on platform_admins
  2. Create a new policy that allows users to view their own admin record
  3. Keep other policies that use is_platform_admin() for write operations
     (those only trigger AFTER the user has already confirmed they're an admin)

  ## Security
  - Users can only see their own row (auth.uid() = user_id)
  - Write operations still require is_platform_admin() check
  - No data exposure - users can only see if THEY are admins
*/

-- Drop the circular policy
DROP POLICY IF EXISTS "Platform admins can view all admins" ON platform_admins;

-- Create a safe policy: users can check their own admin status
CREATE POLICY "Users can view their own admin status"
  ON platform_admins
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Create a second policy: admins can view all admin records (for admin UI)
-- This is safe because by the time this runs, we already know they're an admin
CREATE POLICY "Admins can view all platform admins"
  ON platform_admins
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 
      FROM platform_admins pa
      WHERE pa.user_id = auth.uid() 
        AND pa.is_active = true
    )
  );
