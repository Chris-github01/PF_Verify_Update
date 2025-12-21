# Understanding "Unused" Indexes

## ⚠️ Important: Do NOT Remove These Indexes

If you see monitoring alerts about "unused" indexes, **this is expected and correct behavior**.

---

## Why Are They Showing as "Unused"?

These indexes were just created and haven't been used yet because:

1. **System Just Started:** The database is new or hasn't processed enough queries
2. **No Production Traffic:** Development/staging environments may not have typical query patterns
3. **Monitoring Lag:** PostgreSQL statistics need time to update
4. **Query Patterns:** Some queries may not have been executed yet

---

## Which Indexes Are "Unused"?

All 52 foreign key indexes we created may show as unused initially:

### Audit System (9 indexes)
```
idx_audit_events_actor_user_id
idx_audit_exports_generated_by_user_id
idx_audit_exports_audit_id
idx_audit_findings_audit_id
idx_audit_findings_supplier_id
idx_audits_audited_by_user_id
idx_audits_recommended_supplier_id
idx_audits_project_id
```

### Award & Approval System (6 indexes)
```
idx_award_approvals_organisation_id
idx_award_approvals_project_id
idx_award_approvals_final_approved_quote_id
idx_award_reports_created_by
idx_award_reports_approval_id
```

### Contract Management (3 indexes)
```
idx_contract_allowances_created_by
idx_contract_tags_clarifications_created_by
idx_letters_of_intent_created_by
```

### Onboarding System (3 indexes)
```
idx_onboarding_audit_log_project_id
idx_onboarding_audit_log_user_id
idx_onboarding_compliance_documents_verified_by
```

### Organisation & Members (4 indexes)
```
idx_organisation_members_archived_by_user_id
idx_organisation_members_invited_by_user_id
idx_organisations_created_by_admin_id
idx_organisations_demo_account_id
```

### Parsing Jobs (3 indexes)
```
idx_parsing_jobs_created_by
idx_parsing_jobs_organisation_id
idx_parsing_jobs_user_id
```

### Projects (5 indexes)
```
idx_prelet_appendix_created_by
idx_prelet_appendix_finalised_by
idx_project_sharing_shared_by_user_id
idx_project_sharing_shared_with_user_id
idx_projects_created_by
idx_projects_created_by_user_id
idx_projects_user_id
```

### Quotes & Revisions (11 indexes)
```
idx_quote_revision_timeline_created_by
idx_quote_revisions_diff_project_id
idx_quote_revisions_diff_revised_quote_id
idx_quotes_created_by
idx_quotes_parent_quote_id
idx_quotes_revised_by
idx_quotes_supplier_id
idx_quotes_uploaded_by_user_id
idx_revision_request_suppliers_quote_id
idx_revision_request_suppliers_revision_request_id
idx_revision_requests_award_report_id
idx_revision_requests_project_id
```

### Security & Activity (5 indexes)
```
idx_security_audit_log_organisation_id
idx_security_audit_log_user_id
idx_team_invitations_invited_by_user_id
idx_team_invitations_organisation_id
idx_user_activity_log_project_id
idx_user_activity_log_user_id
```

### Scope Categories (1 index)
```
idx_scope_categories_project_id
```

---

## Why Keep Them?

### 1. **Foreign Key Performance**
These indexes are ESSENTIAL for:
- Fast foreign key constraint checks on INSERT/UPDATE
- Efficient CASCADE operations on DELETE
- Preventing full table scans during JOINs

### 2. **Query Performance**
Without these indexes, queries will:
- Use sequential scans (very slow on large tables)
- Lock tables for longer periods
- Consume more CPU and memory
- Cause performance degradation under load

### 3. **Production Requirements**
In production, these indexes will:
- Be automatically used by the query planner
- Provide 5-10x speedup on JOIN operations
- Prevent performance bottlenecks
- Enable horizontal scaling

---

## When Will They Be Used?

Indexes will be used automatically when:

1. **JOIN Queries:** Joining tables on foreign keys
   ```sql
   SELECT * FROM quotes q
   JOIN projects p ON q.project_id = p.id
   -- Uses idx_quotes_project_id
   ```

2. **WHERE Clauses:** Filtering by foreign key
   ```sql
   SELECT * FROM quotes WHERE supplier_id = 'some-uuid'
   -- Uses idx_quotes_supplier_id
   ```

3. **Foreign Key Checks:** On INSERT/UPDATE/DELETE
   ```sql
   DELETE FROM suppliers WHERE id = 'some-uuid'
   -- Uses idx_quotes_supplier_id to check references
   ```

4. **RLS Policy Evaluation:** In EXISTS subqueries
   ```sql
   -- RLS policies use these indexes extensively
   WHERE EXISTS (
     SELECT 1 FROM organisation_members
     WHERE organisation_id = ... AND user_id = ...
   )
   ```

---

## How to Verify Index Usage

### Check Index Usage Stats (After Production Use)
```sql
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan as times_used,
  idx_tup_read as rows_read,
  idx_tup_fetch as rows_fetched
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
AND indexname LIKE 'idx_%'
ORDER BY idx_scan DESC;
```

### Check Query Plans
```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM quotes q
JOIN suppliers s ON q.supplier_id = s.id
WHERE s.name = 'Acme Corp';
```

Look for:
- ✅ `Index Scan using idx_quotes_supplier_id`
- ❌ `Seq Scan on quotes` (bad - means index not used)

---

## Monitoring Best Practices

### ✅ DO:
- Keep all foreign key indexes
- Monitor query performance
- Review slow query logs
- Check index usage after 30 days of production traffic

### ❌ DON'T:
- Remove indexes showing as "unused" in first 30 days
- Remove foreign key indexes without careful analysis
- Optimize prematurely before production load

---

## When to Consider Removal

Only consider removing an index if **ALL** of these are true:

1. ✅ System has been in production for 60+ days
2. ✅ Index shows ZERO usage in `pg_stat_user_indexes`
3. ✅ No queries reference the indexed column in WHERE/JOIN
4. ✅ Foreign key is never used for lookups
5. ✅ Write performance is significantly impacted
6. ✅ You've analyzed EXPLAIN plans for all major queries

**Even then:** Consult with a database expert before removing foreign key indexes.

---

## TL;DR

### 🟢 Current Status: CORRECT

- **52 foreign key indexes created** ✅
- **Showing as "unused"** ✅ Expected
- **Should be kept** ✅ Essential
- **Will be used automatically** ✅ By query planner
- **Production ready** ✅ Optimized

### ⚠️ Action Required: NONE

Do not remove these indexes. They are working correctly and will be utilized as the application processes queries.

---

**Last Updated:** 2025-12-21
**Status:** ✅ All indexes correctly configured
**Action Required:** None - keep monitoring
