# BOQ Supplier Names - Debug Guide

## Problem Solved

Previously, all suppliers showed as "Unknown Supplier" because:
1. Quotes had `supplier_id: null` in the database
2. The system created placeholder suppliers with generic names
3. The actual supplier names stored in `supplier_name` field were ignored

## New Behavior

The system now:
1. ✅ **Fetches** the `supplier_name` field from quotes
2. ✅ **Creates** suppliers using the actual names from quotes
3. ✅ **Reuses** existing suppliers if they already exist
4. ✅ **Displays** real supplier names in the UI
5. ✅ **Provides** detailed debug logs to diagnose data issues

---

## How to Use

### Step 1: Clear Cache & Regenerate
1. Press **Ctrl+F5** (Windows) or **Cmd+Shift+R** (Mac) to clear browser cache
2. Open **Browser Console** (F12 → Console tab)
3. Navigate to **BOQ Builder**
4. Click **"Regenerate BOQ Builder"**

### Step 2: Read the Debug Logs

You'll now see detailed information about your quotes:

#### **A. Quote Data Summary**
```
📊 Quote Data Summary:
  Quote 1: {
    id: '21abdfed...',
    supplier_id: 'NULL ⚠️',              ← Indicates missing supplier_id
    supplier_name: 'Global Fire Pty Ltd', ← The actual supplier name
    supplier_relation: 'NULL ⚠️'         ← No foreign key relation yet
  }
  Quote 2: {
    id: '34469f61...',
    supplier_id: 'NULL ⚠️',
    supplier_name: 'ABC Fire Services',
    supplier_relation: 'NULL ⚠️'
  }
```

**What this tells you:**
- ⚠️ `supplier_id: NULL` = Quote needs a supplier record created
- ✅ `supplier_name: "..."` = Actual supplier name is available
- ⚠️ `supplier_relation: NULL` = No foreign key link yet (will be fixed)

---

#### **B. Supplier Creation Process**
```
⚠ Found 2 quotes without supplier_id. Creating supplier records...
  Creating supplier "Global Fire Pty Ltd" for quote 21abdfed...
    ✓ Created new supplier: "Global Fire Pty Ltd" (a1b2c3d4...)
  Creating supplier "ABC Fire Services" for quote 34469f61...
    ✓ Created new supplier: "ABC Fire Services" (e5f6g7h8...)
```

**What this tells you:**
- Each quote gets a supplier record created
- Supplier names come from the `supplier_name` field on quotes
- If the same supplier name exists, it's reused (not duplicated)

---

#### **C. Final Tenderer List**
```
✓ Tenderers found: 2
Tenderers:
  1. Global Fire Pty Ltd (supplier_id: a1b2c3d4..., quote_id: 21abdfed...)
  2. ABC Fire Services (supplier_id: e5f6g7h8..., quote_id: 34469f61...)
```

**What this tells you:**
- ✅ Real supplier names are now being used
- Each tenderer has a valid supplier_id
- Mappings will be created using these names

---

## Expected UI Changes

### Before Fix:
```
Unknown Supplier  ✓ 36 included  ⚠ 0 missing
Unknown Supplier  ✓ 36 included  ⚠ 0 missing
```

### After Fix:
```
Global Fire Pty Ltd  ✓ 36 included  ⚠ 0 missing
ABC Fire Services    ✓ 36 included  ⚠ 0 missing
```

---

## Troubleshooting

### Issue: Still showing "Unknown Supplier"

**Possible Causes:**
1. **No supplier_name in database**
   - Check logs for: `supplier_name: 'NULL ⚠️'`
   - **Solution**: Your quote import didn't extract supplier names

2. **Browser cache**
   - **Solution**: Hard refresh with Ctrl+F5

3. **Old data**
   - Suppliers were created before this fix
   - **Solution**: Check the "Supplier Creation Process" logs - if it says "Found existing supplier", the old name is being reused

---

### Issue: Duplicate suppliers created

**Example:**
```
Suppliers:
  - Global Fire Pty Ltd
  - global fire pty ltd
  - Global Fire Pty ltd
```

**Cause:** Supplier names in quotes have inconsistent capitalization

**Solution:** Manually merge duplicates or update quote supplier_name fields to be consistent

**SQL to find duplicates:**
```sql
SELECT LOWER(name) as normalized, array_agg(name) as variants, COUNT(*)
FROM suppliers
WHERE organisation_id = 'YOUR_ORG_ID'
GROUP BY LOWER(name)
HAVING COUNT(*) > 1;
```

---

### Issue: "NULL ⚠️" everywhere

**Logs show:**
```
Quote 1: {
  supplier_id: 'NULL ⚠️',
  supplier_name: 'NULL ⚠️',
  supplier_relation: 'NULL ⚠️'
}
```

**Cause:** Quote import failed to extract ANY supplier information

**Solution:**
1. Re-import quotes with proper supplier detection
2. Manually update `supplier_name` field in quotes table
3. Or manually create suppliers and link them

**SQL to manually add supplier_name:**
```sql
-- Update quote with supplier name
UPDATE quotes
SET supplier_name = 'Actual Supplier Name'
WHERE id = 'your-quote-id';

-- Then regenerate BOQ
```

---

## Data Model Explanation

### How Suppliers Work

```
┌─────────────────┐
│    suppliers    │  ← Master supplier records
├─────────────────┤
│ id (uuid)       │
│ name            │
│ organisation_id │
└─────────────────┘
         ↑
         │ Foreign Key (supplier_id)
         │
┌─────────────────┐
│     quotes      │  ← Imported quotes
├─────────────────┤
│ id              │
│ supplier_id ────┤  ← Links to suppliers.id
│ supplier_name   │  ← Text field from import
│ project_id      │
└─────────────────┘
```

### The Problem:
- Quotes are imported with `supplier_name` (text field)
- But `supplier_id` (foreign key) is not set
- Without `supplier_id`, the system can't link quotes to suppliers

### The Solution:
1. Read `supplier_name` from quote
2. Find or create matching supplier record
3. Update quote's `supplier_id` to link them
4. Now the foreign key relationship works

---

## Advanced: Manual Supplier Linking

If you want to manually link quotes to existing suppliers:

### Step 1: Find your supplier ID
```sql
SELECT id, name FROM suppliers
WHERE organisation_id = 'your-org-id';
```

### Step 2: Update quotes
```sql
UPDATE quotes
SET supplier_id = 'supplier-uuid-from-step-1'
WHERE supplier_name ILIKE '%partial name%'
AND project_id = 'your-project-id';
```

### Step 3: Regenerate BOQ
The system will now use the linked supplier.

---

## Summary

✅ **What's Fixed:**
- Supplier names now come from `supplier_name` field on quotes
- System automatically creates supplier records
- Prevents duplicates by checking for existing suppliers
- Provides detailed debug logs

✅ **What You See:**
- Real supplier names in BOQ Builder UI
- Clear logging of the supplier creation process
- Visibility into data quality issues

✅ **What You Should Do:**
1. Regenerate BOQ Builder with console open
2. Review debug logs to verify supplier names are correct
3. If you see "Unknown Supplier", check the logs to understand why
4. Fix quote imports if `supplier_name` is NULL

---

## Quick Reference

| Log Message | Meaning | Action Required |
|-------------|---------|-----------------|
| `supplier_name: 'NULL ⚠️'` | Quote has no supplier name | Fix quote import or manually add name |
| `supplier_id: 'NULL ⚠️'` | Quote needs supplier record | Normal - will be auto-created |
| `✓ Created new supplier` | New supplier created | None - working as expected |
| `✓ Found existing supplier` | Reusing existing supplier | None - working as expected |
| `supplier_relation: 'NULL ⚠️'` | No foreign key yet | Normal before creation |

---

## Support

If supplier names still show as "Unknown Supplier":
1. Copy all console logs starting from "=== BOQ Generation Started ==="
2. Share the "📊 Quote Data Summary" section
3. This will show exactly what data is (or isn't) available
