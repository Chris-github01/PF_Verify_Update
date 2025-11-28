/*
  # Security Fixes - Part 3: Enable RLS on admin_audit_log

  1. Changes
    - Enable RLS on admin_audit_log table
    - Add policies for platform admins to view logs
    - Allow system to insert audit logs
  
  2. Security
    - Only platform admins can view audit logs
    - Authenticated users can insert (for system logging)
*/

-- Enable RLS
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Only platform admins can view audit logs
DROP POLICY IF EXISTS "Platform admins can view audit logs" ON public.admin_audit_log;
CREATE POLICY "Platform admins can view audit logs"
  ON public.admin_audit_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.platform_admins
      WHERE email = (SELECT auth.jwt()->>'email')
        AND is_active = true
    )
  );

-- System can insert audit logs (for logging admin actions)
DROP POLICY IF EXISTS "System can insert audit logs" ON public.admin_audit_log;
CREATE POLICY "System can insert audit logs"
  ON public.admin_audit_log FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);