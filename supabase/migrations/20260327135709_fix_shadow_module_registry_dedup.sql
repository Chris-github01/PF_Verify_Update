/*
  # Fix Shadow Module Registry Deduplication

  ## Problem
  The seed migration was applied twice, resulting in duplicate rows in:
  - module_registry: multiple rows with the same module_key
  - module_versions: multiple rows with the same module_key

  ## Fix
  1. Remove duplicate rows from module_registry, keeping the earliest created row per module_key
  2. Remove duplicate rows from module_versions, keeping the most recently updated row per module_key
  3. Add unique constraints to prevent future duplicates

  ## Impact
  - Shadow admin /shadow/modules and /shadow/admin/versions will now render correctly
  - No live app data is affected
*/

DELETE FROM module_versions
WHERE id NOT IN (
  SELECT DISTINCT ON (module_key) id
  FROM module_versions
  ORDER BY module_key, updated_at DESC
);

DELETE FROM module_registry
WHERE id NOT IN (
  SELECT DISTINCT ON (module_key) id
  FROM module_registry
  ORDER BY module_key, created_at ASC
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'module_registry' AND constraint_name = 'module_registry_module_key_key'
  ) THEN
    ALTER TABLE module_registry ADD CONSTRAINT module_registry_module_key_key UNIQUE (module_key);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'module_versions' AND constraint_name = 'module_versions_module_key_key'
  ) THEN
    ALTER TABLE module_versions ADD CONSTRAINT module_versions_module_key_key UNIQUE (module_key);
  END IF;
END $$;
