/*
  # Document Remaining Security Items

  This migration documents security items that require manual intervention
  or acceptance by the development team.

  ## Completed Items ✓
  - Added all missing foreign key indexes
  - Removed unused indexes

  ## Items Requiring Manual Intervention

  ### 1. Vector Extension in Public Schema
  
  **Issue**: Extension `vector` is installed in the public schema.
  
  **Risk Level**: Low to Medium
  - The vector extension is currently in use by the embeddings system
  - Moving it would require:
    1. Dropping all vector columns and indexes
    2. Recreating the extension in a different schema (e.g., extensions)
    3. Recreating all vector columns and indexes
    4. Re-embedding all data
  
  **Recommendation**: 
  - Accept this as-is for production systems already using the extension
  - For new deployments, install vector in the `extensions` schema
  - The security impact is minimal as vector functions are read-only operations
  
  **Alternative**: If moving is required, follow these steps:
  ```sql
  -- Backup all vector data first!
  -- DROP all vector columns
  -- DROP EXTENSION vector CASCADE;
  -- CREATE EXTENSION vector SCHEMA extensions;
  -- Recreate vector columns
  -- Re-embed all data
  ```

  ### 2. Leaked Password Protection (HaveIBeenPwned)
  
  **Issue**: Supabase Auth's leaked password protection is disabled.
  
  **Risk Level**: Medium
  - This feature checks passwords against the HaveIBeenPwned database
  - Prevents users from using compromised passwords
  
  **Action Required**: Enable via Supabase Dashboard
  1. Go to Authentication > Policies in Supabase Dashboard
  2. Enable "Leaked Password Protection"
  3. This is a configuration change, not a migration
  
  **Note**: This cannot be enabled via SQL migration as it's a Supabase Auth
  configuration setting that must be changed through the dashboard or CLI.

  ## Security Posture Summary
  
  ✓ All foreign key columns now have covering indexes
  ✓ Unused indexes removed to reduce maintenance overhead
  ✓ Query performance optimized for all relationship lookups
  ⚠ Vector extension location accepted (low risk)
  ⚠ Password protection requires dashboard configuration
*/

-- This migration is documentation-only
-- All actionable SQL has been completed in previous migration
SELECT 'Security audit items documented' as status;
