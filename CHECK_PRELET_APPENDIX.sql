-- Diagnostic script for prelet_appendix table issues
-- Run this in Supabase SQL Editor to check table status

-- 1. Check if table exists
SELECT EXISTS (
  SELECT FROM pg_tables
  WHERE schemaname = 'public' AND tablename = 'prelet_appendix'
) AS table_exists;

-- 2. Check table structure
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'prelet_appendix'
ORDER BY ordinal_position;

-- 3. Check if RLS is enabled
SELECT
  relname AS table_name,
  relrowsecurity AS rls_enabled,
  relforcerowsecurity AS rls_forced
FROM pg_class
WHERE relname = 'prelet_appendix' AND relnamespace = 'public'::regnamespace;

-- 4. Check RLS policies
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'prelet_appendix';

-- 5. Count rows in table
SELECT COUNT(*) AS total_rows FROM prelet_appendix;

-- 6. Check recent records (if any exist)
SELECT
  id,
  project_id,
  is_finalised,
  created_at,
  updated_at
FROM prelet_appendix
ORDER BY created_at DESC
LIMIT 5;

-- 7. Check for orphaned records (projects that don't exist)
SELECT
  pa.id,
  pa.project_id,
  pa.created_at,
  CASE
    WHEN p.id IS NULL THEN 'ORPHANED - Project not found'
    ELSE 'OK'
  END AS status
FROM prelet_appendix pa
LEFT JOIN projects p ON p.id = pa.project_id
WHERE p.id IS NULL;
