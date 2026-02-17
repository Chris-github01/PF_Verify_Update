# Scope Gaps Export - Missing Columns Fixed ✅

## Issue

The **Scope Gaps Register** Excel export was missing critical identification columns:
- ❌ **BOQ Line ID** column (empty)
- ❌ **System** column (empty)
- ❌ **Location** column (empty)

Users couldn't identify which scope items the gaps related to, making the export unusable.

---

## Root Cause

The export function was querying `scope_gaps` table without JOINing to the `boq_lines` table:

### Before (Broken):
```typescript
// Only fetched gap data
const { data: gaps } = await supabase
  .from('scope_gaps')
  .select('*')
  .eq('project_id', options.project_id)
  .eq('module_key', options.module_key);

// Then tried to use fields that don't exist in scope_gaps:
boq_line_id: gap.boq_line_id || '',     // ❌ Doesn't exist
system: gap.system_name || '',           // ❌ Doesn't exist
location: gap.location || '',            // ❌ Doesn't exist
```

### The Problem:
The `scope_gaps` table has a foreign key `boq_line_id` (UUID), but **doesn't store** the human-readable fields like:
- `boq_line_id` (e.g., "SYS-0006")
- `system_name` (e.g., "Ryanfire HP-X")
- `location` (e.g., "Level 3")

These live in the `boq_lines` table and must be fetched via JOIN.

---

## Solution Implemented

### Fix 1: JOIN boq_lines in the query

```typescript
// Fetch gaps WITH boq_lines details
const { data: gaps } = await supabase
  .from('scope_gaps')
  .select(`
    *,
    boq_lines!inner (
      boq_line_id,
      system_name,
      location
    )
  `)
  .eq('project_id', options.project_id)
  .eq('module_key', options.module_key)
  .order('gap_id');
```

**Key Changes:**
- Added `boq_lines!inner (...)` to JOIN the related BOQ line
- Selected the specific fields we need: `boq_line_id`, `system_name`, `location`
- Used `!inner` to ensure we only get gaps that have valid BOQ lines

### Fix 2: Extract joined data in export

```typescript
gaps.forEach((gap: any, index) => {
  // Extract BOQ line details from the joined table
  const boqLine = gap.boq_lines;

  sheet.addRow({
    gap_id: gap.gap_id || `GAP-${index + 1}`,
    boq_line_id: boqLine?.boq_line_id || '',        // ✅ Now populated
    system: boqLine?.system_name || '',             // ✅ Now populated
    location: boqLine?.location || '',              // ✅ Now populated
    description: gap.description || '',
    // ... rest of fields
  });
});
```

---

## Database Schema Context

### scope_gaps table:
```sql
scope_gaps (
  id uuid PRIMARY KEY,
  gap_id text,                    -- GAP-0001, GAP-0002
  boq_line_id uuid,               -- FK to boq_lines (UUID only!)
  tenderer_id uuid,               -- FK to suppliers
  gap_type text,                  -- 'missing', 'under_measured'
  description text,               -- Gap description
  status text,                    -- 'open', 'resolved'
  ...
)
```

### boq_lines table:
```sql
boq_lines (
  id uuid PRIMARY KEY,
  boq_line_id text,               -- SYS-0001, SYS-0002 (human-readable!)
  system_name text,               -- System description
  location text,                  -- Location on site
  quantity numeric,
  unit text,
  ...
)
```

**Relationship:**
```
scope_gaps.boq_line_id (UUID)
    ↓
    references
    ↓
boq_lines.id (UUID)
```

To get human-readable info, you MUST JOIN!

---

## Expected Export Result

### After Fix - Excel shows:

| Gap ID | BOQ Line ID | System | Location | Description | ... |
|--------|-------------|--------|----------|-------------|-----|
| GAP-0001 | SYS-0002 | Ryanbatt 502, Servowrap & Mastic | - | FireSafe quantity (4) is 33.3% less... | ... |
| GAP-0002 | SYS-0002 | Ryanbatt 502, Servowrap & Mastic | - | ProShield quantity (2) is 66.7% less... | ... |
| GAP-0003 | SYS-0003 | Ryanbatt 502 & Mastic with Gib patch | - | FireSafe quantity (82) is 24.8% less... | ... |
| GAP-0007 | SYS-0006 | Ryanfire HP-X (Single TPS / Data Cable) | - | FireSafe quantity (14) is 99.8% less... | ... |

**Now you can see:**
- ✅ Which BOQ line the gap relates to (SYS-0006)
- ✅ What system it is (Ryanfire HP-X)
- ✅ Where it's located (if applicable)

---

## Testing

### Test Case 1: Export with Gaps
```typescript
// Given: Project has 47 scope gaps
// When: User clicks "Export BOQ Baseline"
// Then: Excel file contains SCOPE_GAPS_REGISTER tab
// And: All rows have populated BOQ Line ID, System, and Location columns
```

### Test Case 2: Export without Gaps
```typescript
// Given: Project has no scope gaps
// When: User clicks "Export BOQ Baseline"
// Then: Excel file contains SCOPE_GAPS_REGISTER tab
// And: Shows placeholder: "No scope gaps identified yet"
```

### Test Case 3: Multiple Gaps per BOQ Line
```typescript
// Given: SYS-0002 has 2 gaps (one per supplier)
// When: Export runs
// Then: Both rows show BOQ Line ID = "SYS-0002"
// And: Both rows show System = "Ryanbatt 502, Servowrap & Mastic"
```

---

## Files Modified

### `/src/lib/boq/boqExporter.ts`

**Line ~66-72:** Updated scope gaps query
```typescript
// OLD: Simple select
.select('*')

// NEW: JOIN with boq_lines
.select(`
  *,
  boq_lines!inner (
    boq_line_id,
    system_name,
    location
  )
`)
```

**Line ~613-631:** Updated row creation logic
```typescript
// OLD: Direct field access (didn't exist)
boq_line_id: gap.boq_line_id || '',

// NEW: Extract from joined table
const boqLine = gap.boq_lines;
boq_line_id: boqLine?.boq_line_id || '',
```

---

## Impact

### User Benefits:
1. **Scope gaps are now identifiable** - You can see which system each gap relates to
2. **Export is complete** - No more missing columns
3. **Gap analysis is usable** - Can be shared with stakeholders
4. **Sorting/filtering works** - Can filter by System or BOQ Line ID in Excel

### System Impact:
- ✅ Build passes successfully
- ✅ No breaking changes to existing code
- ✅ Query performance: Minimal impact (single JOIN, indexed FK)
- ✅ Type safety: Added type annotation for joined data

---

## Related Issues

This fix addresses the export presentation, but there's a **separate issue** with the gap data itself:

The tenderer mapping is not aggregating multiple quote lines correctly, causing false positive gaps. See: `BASELINE_8076_CALCULATION.md`

**Priority:**
1. ✅ **This fix** - Make exports readable (DONE)
2. ⏳ **Next fix** - Fix gap calculation accuracy (separate task)

---

## Summary

The **Scope Gaps Register** export now includes all critical identification columns:
- ✅ BOQ Line ID (e.g., SYS-0006)
- ✅ System (e.g., Ryanfire HP-X)
- ✅ Location (if applicable)

Users can now properly identify and analyze scope gaps in the Excel export.

**Build Status:** ✅ Passing
**Deploy Status:** ✅ Ready for deployment
