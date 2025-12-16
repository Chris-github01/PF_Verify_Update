/*
  # Add INSERT policy for platform admins to create organisations
  
  Allows platform admins to create new organisations through the admin console.
*/

-- Allow platform admins to insert new organisations
CREATE POLICY "Platform admins can create organisations"
  ON organisations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE platform_admins.user_id = auth.uid()
      AND platform_admins.is_active = true
    )
  );

-- Allow platform admins to update organisations
CREATE POLICY "Platform admins can update organisations"
  ON organisations
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE platform_admins.user_id = auth.uid()
      AND platform_admins.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE platform_admins.user_id = auth.uid()
      AND platform_admins.is_active = true
    )
  );
