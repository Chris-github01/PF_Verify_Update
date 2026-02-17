# BOQ Mapping Debug Guide

## Issue
Tenderer mappings showing **0 mappings** after BOQ generation, even though 36 BOQ lines were created.

## Enhanced Debugging Added

I've added comprehensive logging and validation to identify the root cause:

### 1. **Supplier Validation**
Before creating any mappings, the system now verifies each supplier exists in the database:
```
✓ Supplier verified: Global Fire Protection Pty Ltd
```
If a supplier is missing, you'll see:
```
CRITICAL: Supplier XYZ (uuid) does not exist in suppliers table!
```

### 2. **BOQ Line ID Verification**
Confirms all BOQ lines have valid UUIDs before attempting mappings:
```
✓ All 36 BOQ lines have valid IDs
```

### 3. **Detailed PostgreSQL Error Messages**
When a mapping insert fails, you'll now see:
```
❌ Error creating mapping for "Fire Stopping Penetration" x "Global Fire":
  Message: [error message]
  Details: [detailed info]
  Hint: [postgres hint]
  Code: [error code]
```

### 4. **Automatic Error Detection**
If **zero mappings** are created, the system now throws a clear error explaining why.

## How to Debug

### Step 1: Open Browser Console
1. Press **F12** (Chrome/Edge) or **Cmd+Option+I** (Mac)
2. Go to the **Console** tab
3. Click **"Regenerate BOQ Builder"** button

### Step 2: Look for These Log Sections

#### **Section A: Supplier Verification**
```
=== Creating Tenderer Mappings ===
Processing 36 lines x 1 tenderers = 36 total mappings
Project ID: xxx
Module Key: passive_fire
✓ Supplier verified: Global Fire Protection Pty Ltd
```

**❌ Problem**: If you see `CRITICAL: Supplier ... does not exist`, the supplier_id from the quote doesn't match a record in the `suppliers` table.

**✅ Solution**: Check your supplier records or reimport the quote.

---

#### **Section B: BOQ Line Validation**
```
Verifying BOQ line IDs...
✓ All 36 BOQ lines have valid IDs
```

**❌ Problem**: If you see `CRITICAL: X BOQ lines missing IDs`, the BOQ line insertion didn't return IDs.

**✅ Solution**: This indicates an RLS or database trigger issue.

---

#### **Section C: Mapping Creation Errors**
Look for repeated errors like:
```
❌ Error creating mapping for "..." x "...":
  Message: new row violates row-level security policy for table "boq_tenderer_map"
  Code: 42501
```

**Common Error Codes:**
- **42501**: RLS policy violation (permission denied)
- **23503**: Foreign key violation (supplier or BOQ line doesn't exist)
- **23505**: Unique constraint violation (duplicate mapping)
- **42P01**: Table doesn't exist

---

#### **Section D: Final Summary**
```
=== Mapping Creation Complete ===
✓ Mappings created: 0
✓ Matched items: 0
✗ Missing items: 36
⚠ Errors encountered: 36
```

If mappings = 0 and errors > 0, check the error messages above.

---

## Common Issues & Solutions

### Issue 1: RLS Policy Violation
**Symptom**: `new row violates row-level security policy`

**Cause**: The user is not an active member of the organisation that owns the project.

**Solution**:
```sql
-- Check your organisation membership
SELECT * FROM organisation_members
WHERE user_id = auth.uid() AND status = 'active';

-- Check project ownership
SELECT * FROM projects WHERE id = 'YOUR_PROJECT_ID';
```

### Issue 2: Foreign Key Violation (supplier)
**Symptom**: `insert or update on table "boq_tenderer_map" violates foreign key constraint "boq_tenderer_map_tenderer_id_fkey"`

**Cause**: The supplier_id from the quote doesn't exist in the `suppliers` table.

**Solution**: The quote import process should have created the supplier. Check:
```sql
-- Find orphaned quotes
SELECT q.id, q.supplier_id
FROM quotes q
LEFT JOIN suppliers s ON s.id = q.supplier_id
WHERE s.id IS NULL;
```

### Issue 3: Foreign Key Violation (BOQ line)
**Symptom**: `insert or update on table "boq_tenderer_map" violates foreign key constraint "boq_tenderer_map_boq_line_id_fkey"`

**Cause**: BOQ line IDs are not being returned from the insert or are being deleted before mapping creation.

**Solution**: Check BOQ line insert logs for errors.

### Issue 4: Duplicate Mapping
**Symptom**: `duplicate key value violates unique constraint "boq_tenderer_map_boq_line_id_tenderer_id_key"`

**Cause**: Trying to create the same mapping twice.

**Solution**: This shouldn't happen on a clean regeneration. Clear old mappings first:
```sql
DELETE FROM boq_tenderer_map
WHERE project_id = 'YOUR_PROJECT_ID'
AND module_key = 'passive_fire';
```

---

## Testing Steps

1. **Regenerate BOQ** with console open
2. **Copy all console output** and send it if the issue persists
3. **Check the Tenderer Mapping tab** - the badge should now show the count
4. **Check the green banner** - it should show the actual number created

---

## What I Fixed

1. ✅ Added detailed PostgreSQL error logging
2. ✅ Added supplier existence validation
3. ✅ Added BOQ line ID validation
4. ✅ Added verification query to check if mappings exist despite errors
5. ✅ Added throw error if zero mappings created with detailed cause
6. ✅ Added mapping count badge in the UI
7. ✅ Enhanced all console logs with emoji indicators

The system will now tell you **exactly why** the mappings aren't being created!
