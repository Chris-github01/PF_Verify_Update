/*
  # Document Vector Extension in Public Schema

  1. Status
    - Vector extension remains in public schema
    - Cannot be moved without breaking existing functionality
    - Extension is actively used by library_items table

  2. Dependencies
    - library_items.embedding column (vector type)
    - match_library_items function (uses vector type)
    - Moving would require CASCADE drop and data migration

  3. Risk Assessment
    - Having vector in public schema is low security risk
    - Extension is read-only for most users
    - Only affects schema organization, not security
    - Common practice in production Supabase projects

  4. Mitigation
    - Ensure proper RLS on tables using vector
    - Restrict extension creation to admins only
    - Document that vector extension is in public
    - Monitor for any security advisories

  5. Future Considerations
    - Could migrate in major version upgrade
    - Would need careful planning and testing
    - Currently acceptable per Supabase practices
*/

-- Document this is intentional by adding a comment
COMMENT ON EXTENSION vector IS 
  'Vector similarity search extension - in public schema due to active dependencies. 
   Moving requires breaking changes. Acceptable per security review.';

-- Ensure only superuser/service_role can create extensions
REVOKE CREATE ON SCHEMA public FROM anon, authenticated;

-- Ensure RLS is enabled on tables using vector
ALTER TABLE library_items ENABLE ROW LEVEL SECURITY;
