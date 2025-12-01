/*
  # Create system_config table
  
  1. New Tables
    - `system_config`
      - `id` (uuid, primary key)
      - `key` (text, unique) - Configuration key name
      - `value` (text) - Configuration value
      - `description` (text) - Human-readable description
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
  
  2. Security
    - Enable RLS on `system_config` table
    - Add policy for service_role to manage all configs
    - Add policy for platform admins to read configs
  
  3. Initial Data
    - Insert PDF Extractor API configuration
*/

CREATE TABLE IF NOT EXISTS system_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY "Service role can manage system_config"
  ON system_config
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Platform admins can read configs
CREATE POLICY "Platform admins can read system_config"
  ON system_config
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE platform_admins.user_id = auth.uid()
      AND platform_admins.is_active = true
    )
  );

-- Insert PDF Extractor configuration
INSERT INTO system_config (key, value, description)
VALUES 
  ('RENDER_PDF_EXTRACTOR_URL', 'https://verify-pdf-extractor.onrender.com', 'Base URL for the external PDF extractor service'),
  ('RENDER_PDF_EXTRACTOR_API_KEY', 'your-api-key-here', 'API key for authenticating with the PDF extractor service')
ON CONFLICT (key) DO NOTHING;