/*
  # Create debug-reports storage bucket

  1. New public bucket: `debug-reports`
     - Stores temporary HTML debug analysis reports
     - Public read so URLs are shareable (e.g. with ChatGPT)
  2. RLS policies
     - Authenticated users can insert/delete their own reports
     - Public can read (bucket is public)
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'debug-reports',
  'debug-reports',
  true,
  10485760,
  ARRAY['text/html', 'application/json']
)
ON CONFLICT (id) DO UPDATE SET public = true;

CREATE POLICY "Authenticated users can upload debug reports"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'debug-reports');

CREATE POLICY "Authenticated users can delete own debug reports"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'debug-reports' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Public can read debug reports"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'debug-reports');
