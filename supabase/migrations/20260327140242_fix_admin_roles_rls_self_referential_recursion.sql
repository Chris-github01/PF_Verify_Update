/*
  # Fix admin_roles RLS self-referential infinite recursion

  ## Problem
  The "god_mode can manage admin_roles" SELECT policy does:
    EXISTS (SELECT 1 FROM admin_roles WHERE user_id = auth.uid() AND role = 'god_mode')

  This is a self-referencing subquery on the same table being evaluated.
  Postgres resolves this as infinite recursion and denies access.

  Because module_registry and module_versions SELECT policies also do:
    EXISTS (SELECT 1 FROM admin_roles WHERE ...)

  ...those queries also fail whenever admin_roles cannot be read.

  ## Fix
  Replace the self-referential "god_mode can manage admin_roles" SELECT policy
  with one that uses only auth.uid() = user_id (no subquery into admin_roles).
  The existing "users can read own admin role" policy already covers this.
  Drop the redundant god_mode SELECT policy — the simpler policy handles all cases.

  ## Impact
  - module_registry and module_versions become readable to internal_admin users
  - No live app data or tables are affected
*/

DROP POLICY IF EXISTS "god_mode can manage admin_roles" ON admin_roles;

DROP POLICY IF EXISTS "users can read own admin role" ON admin_roles;

CREATE POLICY "users can read own admin role"
  ON admin_roles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
