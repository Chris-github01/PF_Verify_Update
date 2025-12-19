/*
  # Add Organisation Logo Support

  1. Schema Changes
    - Add `logo_url` column to organisations table to store logo file path/URL
    
  2. Storage Setup
    - Create `organisation-logos` storage bucket for logo files
    - Configure bucket to accept SVG and PNG files up to 2MB
    
  3. Security
    - Add RLS policies for logo uploads
    - Platform admins can upload/update logos
    - Organisation members can view their org's logo
    
  4. Notes
    - Logo will be embedded in PDF report headers (Award Recommendation Report)
    - SVG format preferred for vector scaling
    - Max file size: 2MB
*/

-- Add logo_url column to organisations table
ALTER TABLE organisations 
ADD COLUMN IF NOT EXISTS logo_url text;

-- Create storage bucket for organisation logos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'organisation-logos',
  'organisation-logos',
  false,
  2097152, -- 2MB in bytes
  ARRAY['image/svg+xml', 'image/png']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- RLS Policies for organisation-logos bucket

-- Platform admins can upload logos
CREATE POLICY "Platform admins can upload organisation logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'organisation-logos' AND
  EXISTS (
    SELECT 1 FROM platform_admins
    WHERE user_id = auth.uid() AND is_active = true
  )
);

-- Platform admins can update logos
CREATE POLICY "Platform admins can update organisation logos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'organisation-logos' AND
  EXISTS (
    SELECT 1 FROM platform_admins
    WHERE user_id = auth.uid() AND is_active = true
  )
);

-- Platform admins can delete logos
CREATE POLICY "Platform admins can delete organisation logos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'organisation-logos' AND
  EXISTS (
    SELECT 1 FROM platform_admins
    WHERE user_id = auth.uid() AND is_active = true
  )
);

-- Organisation members can view their organisation's logo
CREATE POLICY "Organisation members can view their org logo"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'organisation-logos' AND
  (
    -- Platform admins can view all logos
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE user_id = auth.uid() AND is_active = true
    )
    OR
    -- Organisation members can view their org's logo
    EXISTS (
      SELECT 1 FROM organisation_members om
      JOIN organisations o ON o.id = om.organisation_id
      WHERE om.user_id = auth.uid() 
        AND om.status = 'active'
        AND o.logo_url = name
    )
  )
);

-- Service role bypass for storage operations (needed for PDF generation)
CREATE POLICY "Service role bypass for organisation logos"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'organisation-logos')
WITH CHECK (bucket_id = 'organisation-logos');