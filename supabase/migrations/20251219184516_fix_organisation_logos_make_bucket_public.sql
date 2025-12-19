/*
  # Fix Organisation Logos - Make Storage Bucket Public
  
  ## Issue
  The organisation-logos bucket is currently private (public=false), which prevents:
  - Logos from being properly displayed in PDF reports
  - Public URL access needed for embedding logos in generated documents
  - Cross-origin resource sharing (CORS) issues when fetching logos
  
  ## Solution
  Update the organisation-logos bucket to be public, allowing:
  - Public URL access for embedded logos in PDFs
  - Proper display in generated reports and documents
  - No authentication required for viewing (RLS still controls uploads)
  
  ## Security Notes
  - RLS policies on storage.objects still control who can upload/update/delete
  - Making bucket public only affects viewing - uploads still require authentication
  - This is standard practice for publicly accessible assets like company logos
*/

-- Make the organisation-logos bucket public
UPDATE storage.buckets 
SET public = true
WHERE id = 'organisation-logos';
