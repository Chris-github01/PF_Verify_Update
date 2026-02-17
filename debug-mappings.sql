-- Debug script to check BOQ mapping status

-- 1. Check if boq_lines exist
SELECT
  'BOQ Lines' as table_name,
  COUNT(*) as total_count,
  COUNT(DISTINCT project_id) as projects,
  module_key,
  COUNT(*) as lines_per_module
FROM boq_lines
GROUP BY module_key;

-- 2. Check if mappings exist
SELECT
  'Tenderer Mappings' as table_name,
  COUNT(*) as total_count,
  COUNT(DISTINCT project_id) as projects,
  module_key,
  COUNT(*) as mappings_per_module
FROM boq_tenderer_map
GROUP BY module_key;

-- 3. Check if mappings exist for specific project (replace with actual project ID)
-- SELECT * FROM boq_tenderer_map WHERE project_id = 'YOUR_PROJECT_ID_HERE' LIMIT 5;

-- 4. Check RLS policies on boq_tenderer_map
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
WHERE tablename = 'boq_tenderer_map'
ORDER BY policyname;

-- 5. Count by included_status
SELECT
  included_status,
  COUNT(*) as count
FROM boq_tenderer_map
GROUP BY included_status;
