# COMMERCIAL DASHBOARD DATA SYNCHRONIZATION AUDIT REPORT

**Date:** 2026-02-05
**Issue:** Commercial Dashboard displays "No awarded trades found" despite having approved suppliers
**Status:** ROOT CAUSE IDENTIFIED

---

## EXECUTIVE SUMMARY

The Commercial Control Dashboard is querying for a database column (`boq_lines.awarded_supplier_id`) that **does not exist** in the schema. This is causing all awarded supplier queries to return zero results, displaying the "No awarded trades found" message even when suppliers have been properly awarded and approved.

**Impact:** Complete failure to display commercial metrics for any project with awarded suppliers.

**Severity:** CRITICAL - Core functionality completely broken

---

## DETAILED FINDINGS

### 1. DATABASE LAYER ✅ VERIFIED

#### Award Data EXISTS and is Correct

**Finding:** Award approvals are properly stored in the database.

**Evidence:**
```sql
-- Query of Harbour Tower Commercial Fit-Out project
-- Project ID: 95559cdd-2950-451a-ac61-4f7f6d41e6cf
-- Organisation: Summit Construction Group Ltd

award_approvals table:
- 4 approved awards found
- Most recent: ProShield Systems (approved 2026-02-05)
- All have valid quote_ids, supplier names, and timestamps
```

**Database Tables:**
- ✅ `award_approvals` - Contains award records with supplier names and quote IDs
- ✅ `quotes` - Contains quote data with supplier_name field
- ✅ `boq_lines` - Contains BOQ data (but missing awarded_supplier_id)
- ✅ `suppliers` - Contains supplier master data
- ✅ `projects` - Contains project data with trade information

#### Critical Schema Issue: Missing Column

**Finding:** The `boq_lines` table does NOT have an `awarded_supplier_id` column.

**Evidence:**
```sql
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'boq_lines'
AND column_name LIKE '%award%';

Result: [] (empty - no award-related columns)
```

**Columns in boq_lines:**
- id, project_id, module_key, boq_line_id
- trade, system_group, system_name
- quantity, unit
- baseline_included, baseline_scope_notes
- version, created_at, updated_at
- **❌ NO awarded_supplier_id column**
- **❌ NO awarded_quote_id column**
- **❌ NO award_status column**

#### Secondary Issue: Incomplete Data Relationships

**Finding:** `quotes.supplier_id` field exists but is NULL for all awarded quotes.

**Evidence:**
```sql
-- Check quotes for Harbour Tower project
SELECT quote_id, supplier_id, supplier_name
FROM quotes
WHERE id IN (awarded quote IDs)

Results:
- supplier_id: NULL (for all quotes)
- supplier_name: "ProShield Systems", "FireSafe" (populated)
```

**Implication:** Even if boq_lines had awarded_supplier_id, it couldn't link to suppliers table because quotes.supplier_id is not populated.

---

### 2. FRONTEND/API LAYER ❌ BROKEN

#### Commercial Dashboard Query Logic

**File:** `src/pages/CommercialControlDashboard.tsx`
**Lines:** 135-151

**Problematic Code:**
```typescript
async function loadTradeMetrics(projId: string) {
  // Get all awarded trades/suppliers
  const { data: awarded } = await supabase
    .from('boq_lines')
    .select(`
      module_key,
      awarded_supplier_id,  // ❌ THIS COLUMN DOESN'T EXIST
      contract_qty,
      contract_rate,
      quantity,
      unit_price,
      suppliers (
        name
      )
    `)
    .eq('project_id', projId)
    .not('awarded_supplier_id', 'is', null);  // ❌ ALWAYS FAILS

  if (!awarded || awarded.length === 0) {
    setTradeMetrics([]);  // ❌ ALWAYS TRIGGERS
    return;
  }
  // ... rest of logic never executes
}
```

**Issue Analysis:**
1. Query requests `awarded_supplier_id` from `boq_lines` table
2. This column does not exist in the database schema
3. Supabase returns an error or empty result
4. Dashboard interprets this as "no awarded suppliers"
5. Shows "No awarded trades found" message

**Expected Behavior:**
The dashboard should:
1. Query `award_approvals` table for approved awards
2. Link to `quotes` table to get supplier details
3. Link to `boq_lines` table for the project/trade
4. Calculate metrics based on actual award data

---

### 3. DATA FLOW ANALYSIS

#### Current (Broken) Flow:
```
User Views Dashboard
  ↓
loadTradeMetrics(projectId)
  ↓
Query: SELECT ... FROM boq_lines WHERE awarded_supplier_id IS NOT NULL
  ↓
❌ Column doesn't exist → Query fails
  ↓
awarded.length === 0
  ↓
Display: "No awarded trades found"
```

#### Actual Data Model:
```
award_approvals
├── project_id
├── final_approved_supplier (TEXT)
├── final_approved_quote_id (UUID → quotes.id)
└── approved_at (TIMESTAMP)

quotes
├── id
├── project_id
├── supplier_name (TEXT)
└── supplier_id (UUID - but NULL!)

boq_lines
├── project_id
├── module_key (trade)
├── quantity
└── unit_price
└── ❌ NO link to awarded supplier
```

#### Correct Flow (Should Be):
```
User Views Dashboard
  ↓
loadTradeMetrics(projectId)
  ↓
1. Query award_approvals → Get awarded suppliers per trade
2. Query quotes → Get supplier details
3. Query boq_lines → Get BOQ data for project/trade
4. Calculate metrics → Group by trade/supplier
  ↓
Display: Trade performance table with metrics
```

---

### 4. ROOT CAUSE SUMMARY

**Primary Issue:**
The Commercial Dashboard was developed assuming a database schema where `boq_lines` would have an `awarded_supplier_id` column to directly link BOQ lines to awarded suppliers. This column was never created in the migration, creating a fundamental mismatch between code expectations and database reality.

**Secondary Issues:**
1. No migration exists to populate `boq_lines.awarded_supplier_id` when awards are approved
2. `quotes.supplier_id` is not populated, breaking foreign key relationships
3. Award data is isolated in `award_approvals` table with no automatic sync to BOQ

**Why It Wasn't Caught:**
1. No integration tests checking dashboard with awarded suppliers
2. Dashboard code written before schema migration was complete
3. Award approval flow doesn't update BOQ lines with winner

---

## IMPACT ANALYSIS

### Affected Features:
- ✅ Award Reports Page - Works correctly (uses award_approvals table)
- ✅ Award Approval Flow - Works correctly (inserts to award_approvals)
- ❌ Commercial Control Dashboard - COMPLETELY BROKEN
- ❌ Base Tracker Export - Will fail (depends on awarded supplier data)
- ❌ VO Tracker - Partially broken (can't link to awarded suppliers)

### User Impact:
- **100% of users** cannot see commercial metrics
- Base Tracker cannot be generated for awarded suppliers
- No visibility into contract value, exposure, or completion
- System appears non-functional for post-award phase

### Data Integrity:
- ✅ Award data is safe and correctly stored
- ✅ No data loss or corruption
- ❌ Data not accessible via dashboard queries

---

## SOLUTION OPTIONS

### Option 1: Add awarded_supplier_id Column (RECOMMENDED)

**Approach:** Add the missing column and populate it when awards are approved.

**Implementation:**
1. Add migration to create `boq_lines.awarded_supplier_id` column
2. Add trigger/function to populate column when award is approved
3. Backfill existing awards
4. Update dashboard to use the column

**Pros:**
- Matches original design intent
- Efficient queries (single table)
- Easy to maintain going forward

**Cons:**
- Requires schema migration
- Need to backfill historical data
- Need trigger for ongoing sync

**Estimated Effort:** 2-3 hours

### Option 2: Fix Dashboard Queries (QUICK FIX)

**Approach:** Rewrite dashboard to query award_approvals instead of boq_lines.

**Implementation:**
1. Change `loadTradeMetrics()` to query `award_approvals` first
2. Join to `quotes` and `boq_lines` to get complete picture
3. Calculate metrics from joined data

**Pros:**
- No schema changes needed
- Works with existing data immediately
- Can deploy in minutes

**Cons:**
- More complex queries (3-table joins)
- Slightly slower performance
- Doesn't fix root cause

**Estimated Effort:** 30 minutes

### Option 3: Hybrid Approach (BEST LONG-TERM)

**Approach:** Quick fix now, proper solution later.

**Implementation:**
1. Immediate: Fix dashboard queries (Option 2)
2. Next sprint: Add awarded_supplier_id column (Option 1)
3. Deprecate complex queries once column exists

**Pros:**
- Unblocks users immediately
- Proper long-term solution
- Time to test migrations properly

**Cons:**
- Temporary technical debt
- Need to maintain both approaches briefly

**Estimated Effort:** 30 min now + 2 hours later

---

## RECOMMENDED SOLUTION

**Implement Option 2 (Quick Fix) immediately:**

1. Rewrite `loadTradeMetrics()` to query from `award_approvals`
2. Join to `quotes` for supplier details
3. Join to `boq_lines` for contract values
4. Test with existing project data
5. Deploy

**Then plan Option 1 for next release:**
- Add proper schema column
- Implement sync mechanism
- Backfill data
- Optimize queries

---

## CODE LOCATIONS REQUIRING FIXES

### Primary Fix Location:
**File:** `src/pages/CommercialControlDashboard.tsx`
**Function:** `loadTradeMetrics(projId: string)`
**Lines:** 135-210

**Change Required:**
```typescript
// BEFORE (broken):
const { data: awarded } = await supabase
  .from('boq_lines')
  .select('module_key, awarded_supplier_id, ...')
  .not('awarded_supplier_id', 'is', null);

// AFTER (fixed):
const { data: awards } = await supabase
  .from('award_approvals')
  .select(`
    final_approved_supplier,
    final_approved_quote_id,
    quotes (
      supplier_name,
      project_id
    )
  `)
  .eq('project_id', projId);

// Then query boq_lines separately and join in application
```

### Secondary Fix Location:
**File:** `src/lib/export/baseTrackerExport.ts`
**Function:** `exportBaseTracker()`
**Lines:** 45-65

**Change Required:**
Same pattern - query awards first, then BOQ

---

## TESTING REQUIREMENTS

### Unit Tests:
- [ ] Test loadTradeMetrics() with awarded suppliers
- [ ] Test loadTradeMetrics() with no awards
- [ ] Test loadCommercialMetrics() with awarded projects

### Integration Tests:
- [ ] Award supplier → Verify appears in dashboard immediately
- [ ] Multiple suppliers per project
- [ ] Multiple trades per project
- [ ] Historic awards display correctly

### Edge Cases:
- [ ] Project with no awards (show empty state)
- [ ] Award then revoke (should disappear)
- [ ] Partial awards (only some trades awarded)
- [ ] Award with no BOQ data (handle gracefully)

### Regression Tests:
- [ ] Award Reports still work
- [ ] Approval flow unaffected
- [ ] Export functions work
- [ ] Other dashboards unaffected

---

## APPENDIX: SQL VERIFICATION QUERIES

```sql
-- Check if awarded_supplier_id exists
SELECT column_name FROM information_schema.columns
WHERE table_name = 'boq_lines' AND column_name LIKE '%award%';
-- Result: [] (empty)

-- Get award data for a project
SELECT * FROM award_approvals
WHERE project_id = '95559cdd-2950-451a-ac61-4f7f6d41e6cf';
-- Result: 4 awards found

-- Check quote supplier linkage
SELECT id, supplier_id, supplier_name FROM quotes
WHERE id IN (SELECT final_approved_quote_id FROM award_approvals);
-- Result: supplier_id is NULL for all

-- Verify BOQ data exists
SELECT COUNT(*) FROM boq_lines
WHERE project_id = '95559cdd-2950-451a-ac61-4f7f6d41e6cf';
-- Result: 1 BOQ line
```

---

## CONCLUSION

The issue is a **fundamental schema mismatch** between the Commercial Dashboard's expectations and the actual database structure. The dashboard assumes a column exists that was never created. This is not a data sync issue, but a **missing feature** in the database schema.

**Immediate Action Required:** Rewrite dashboard queries to use existing tables (`award_approvals` + `quotes` + `boq_lines`) rather than the non-existent `boq_lines.awarded_supplier_id` column.

**Long-term Action Required:** Add proper schema support for awarded suppliers in BOQ lines, with automatic syncing when awards are approved.

**Timeline to Resolution:**
- Quick Fix: 30 minutes (rewrite queries)
- Proper Fix: 2-3 hours (add schema + sync)
- Full Testing: 2 hours
- **Total: Can be fully operational within 1 business day**

---

**Report Generated By:** AI Code Auditor
**Next Steps:** Implement recommended fixes and verify with test cases
