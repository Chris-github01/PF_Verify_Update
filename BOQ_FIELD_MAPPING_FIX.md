# BOQ Field Mapping Fix - 6,380 Items Collapsed to 1 Line

## 🔴 The Problem

**Symptom:** All 6,380 parsed quote items collapsed into a single BOQ line called "Unnamed System" with quantity 6380.

**Root Cause:** **Complete field name mismatch** between what the BOQ generator expected and what actually exists in the `quote_items` table.

---

## 🔍 Diagnostic Analysis

### What Happened

When generating the baseline BOQ, the system:
1. ✅ Successfully fetched 6,380 quote items from database
2. ❌ **Failed to extract any meaningful data** because field names were wrong
3. ❌ All items had empty/null values for all grouping fields
4. ❌ Created identical grouping keys (`|||||`) for ALL items
5. ❌ Grouped all 6,380 items into a single line
6. ❌ Summed quantities to get 6380 total

### The Field Name Mismatch

**What the code was looking for:**
```typescript
{
  system_name: "...",      // ❌ Doesn't exist
  location: "...",         // ❌ Doesn't exist
  frr_rating: "...",       // ❌ Doesn't exist (called 'frr')
  substrate: "...",        // ❌ Doesn't exist (called 'material')
  service_type: "...",     // ❌ Doesn't exist (called 'service')
  size_opening: "...",     // ❌ Doesn't exist (called 'size')
  rate: ...,               // ❌ Doesn't exist (called 'unit_price')
  amount: ...              // ❌ Doesn't exist (called 'total_price')
}
```

**What actually exists in `quote_items` table:**
```typescript
{
  // Core fields
  description: "...",            // ✅ Actual description
  system_label: "...",           // ✅ Human-readable system name
  mapped_system: "...",          // ✅ AI-mapped system

  // Attributes
  size: "...",                   // ✅ Size/opening dimension
  frr: "...",                    // ✅ Fire resistance rating
  service: "...",                // ✅ Service type
  mapped_service_type: "...",    // ✅ AI-mapped service type
  material: "...",               // ✅ Material type
  subclass: "...",               // ✅ Item subclass

  // Pricing
  unit_price: ...,               // ✅ Rate per unit
  total_price: ...,              // ✅ Total amount
  quantity: ...,                 // ✅ Quantity
  unit: "...",                   // ✅ Unit of measure

  // Normalization
  raw_description: "...",        // ✅ Original description
  normalized_description: "...", // ✅ Cleaned description
  canonical_unit: "...",         // ✅ Normalized unit

  // System mapping
  system_confidence: ...,        // ✅ Mapping confidence
  mapping_confidence: ...,       // ✅ Overall confidence
  mapped_penetration: "...",     // ✅ Penetration type

  // Quality
  confidence: ...,               // ✅ Data quality score
  issues: {...},                 // ✅ Quality issues
  system_needs_review: false     // ✅ Review flag
}
```

---

## ✅ The Fix

### 1. Updated `createGroupingKey()` Function

**Before:**
```typescript
const parts = [
  item.system_name || '',          // ❌ Wrong field name
  item.location || '',             // ❌ Doesn't exist
  item.frr_rating || '',           // ❌ Wrong field name
  item.substrate || '',            // ❌ Wrong field name
  item.service_type || '',         // ❌ Wrong field name
  item.size_opening || ''          // ❌ Wrong field name
];
```

**After:**
```typescript
const parts = [
  // System/Description - prioritize AI-mapped fields
  item.system_label || item.mapped_system || item.description || '',

  // Size/Opening - from size column
  item.size || '',

  // FRR - from frr column
  item.frr || '',

  // Service Type - use mapped field first
  item.mapped_service_type || item.service || '',

  // Material - from material column
  item.material || item.subclass || ''
];
```

### 2. Added Fallback for Empty Keys

**Before:**
```typescript
// If all fields empty, all items got same key: '|||||'
return parts.join('|').toLowerCase();
```

**After:**
```typescript
const key = parts.join('|').toLowerCase().trim();

// If all parts empty, use description or ID to keep items separate
if (key === '||||' || key.replace(/\|/g, '').trim() === '') {
  const description = item.description || item.raw_description || '';
  if (description) {
    return description.toLowerCase().trim();
  }

  // Last resort: use item ID to ensure uniqueness
  return `unique_${item.id || item.item_number}`;
}

return key;
```

### 3. Updated `normalizeItems()` Function

**Before:**
```typescript
system_name: representative.system_name || 'Unnamed System',
frr_rating: representative.frr_rating || null,
substrate: representative.substrate || null,
service_type: representative.service_type || null,
penetration_size_opening: representative.size_opening || null,
// ... etc
```

**After:**
```typescript
// Prioritize AI-mapped and processed fields
system_name: representative.system_label
  || representative.mapped_system
  || representative.description
  || 'Unnamed System',

frr_rating: representative.frr || null,

substrate: representative.material || null,

service_type: representative.mapped_service_type
  || representative.service || null,

penetration_size_opening: representative.size || null,

unit: representative.unit
  || representative.canonical_unit
  || representative.normalized_unit
  || 'Each',
```

### 4. Updated `findMatchingItem()` Function

**Before:**
```typescript
const boqKey = createGroupingKey({
  system_name: boqLine.system_name,    // ❌ Wrong
  frr_rating: boqLine.frr_rating,      // ❌ Wrong
  substrate: boqLine.substrate,        // ❌ Wrong
  service_type: boqLine.service_type,  // ❌ Wrong
  size_opening: boqLine.penetration_size_opening  // ❌ Wrong
});
```

**After:**
```typescript
const boqKey = createGroupingKey({
  system_label: boqLine.system_name,           // ✅ Correct
  description: boqLine.system_name,            // ✅ Fallback
  frr: boqLine.frr_rating,                     // ✅ Correct
  material: boqLine.substrate,                 // ✅ Correct
  mapped_service_type: boqLine.service_type,   // ✅ Correct
  size: boqLine.penetration_size_opening       // ✅ Correct
});
```

### 5. Updated `createTendererMappings()` Function

**Before:**
```typescript
tendererRate = matchingItem.rate;       // ❌ Wrong field
tendererAmount = matchingItem.amount;   // ❌ Wrong field
```

**After:**
```typescript
tendererRate = matchingItem.unit_price || matchingItem.rate;
tendererAmount = matchingItem.total_price || matchingItem.amount;
```

---

## 🎯 Expected Behavior After Fix

### What Should Happen Now

1. ✅ Each unique item gets proper grouping based on:
   - System/description
   - Size/opening
   - FRR rating
   - Service type
   - Material

2. ✅ Items with similar attributes are grouped together

3. ✅ Items with unique attributes create separate BOQ lines

4. ✅ If parsing hasn't populated detailed fields, each item stays separate (uses description as key)

5. ✅ Quantity properly represents max across all tenderers for that specific item

### Expected Results

For 6,380 parsed items, you should see:
- **150-500+ unique BOQ lines** (depending on how many unique systems/items)
- Each line has meaningful description (not "Unnamed System")
- Quantities are distributed appropriately
- Tenderer mappings show which supplier priced which items

---

## 🧪 Testing the Fix

### Step 1: Clear Existing BOQ
```sql
-- Run this in Supabase SQL Editor to start fresh
DELETE FROM boq_tenderer_map WHERE project_id = 'YOUR_PROJECT_ID';
DELETE FROM scope_gaps WHERE project_id = 'YOUR_PROJECT_ID';
DELETE FROM boq_lines WHERE project_id = 'YOUR_PROJECT_ID';

UPDATE projects
SET boq_builder_completed = false,
    boq_builder_completed_at = NULL
WHERE id = 'YOUR_PROJECT_ID';
```

### Step 2: Regenerate BOQ

1. Open browser console (F12)
2. Clear console
3. Click "Generate Baseline BOQ"
4. Watch console output

### Step 3: Verify Results

**Check console for:**
```
normalizeItems: Processing 6380 items
First 3 items: [...]  ← Should show actual data now
Sample item keys: [...]  ← Should show field names
Sample grouping keys: [...]  ← Should show varied keys
normalizeItems: Created XXX unique groups  ← Should be 100-500+, not 1!
```

**Check BOQ Builder tab:**
- Should see multiple lines (100-500+)
- Each line should have meaningful system name
- Quantities should be reasonable (not 6380)
- Tenderer coverage should show matches

### Step 4: Verify Database

```sql
-- Check BOQ lines created
SELECT
  boq_line_id,
  system_name,
  quantity,
  unit
FROM boq_lines
WHERE project_id = 'YOUR_PROJECT_ID'
ORDER BY boq_line_id
LIMIT 20;

-- Should show multiple distinct lines, not just one!
```

---

## 📊 Understanding the Data Flow

### Parsing → BOQ Generation Flow

```
1. Quote Upload (PDF/Excel)
   ↓
2. Parsing (extract data)
   ↓ Creates quote_items with fields:
   - description (raw text)
   - quantity, unit, unit_price, total_price
   ↓
3. AI Enhancement (optional)
   ↓ Adds enriched fields:
   - system_label, mapped_system
   - size, frr, service, material
   - mapped_service_type, mapped_penetration
   - confidence scores
   ↓
4. BOQ Generation ← **THIS IS WHERE THE FIX APPLIES**
   ↓ Groups items by:
   - System (from system_label/description)
   - Size (from size)
   - FRR (from frr)
   - Service (from service/mapped_service_type)
   - Material (from material)
   ↓
5. Creates BOQ Lines
   - One line per unique combination
   - Max quantity across all tenderers
   ↓
6. Creates Tenderer Mappings
   - Links each BOQ line to each supplier
   - Shows included/missing/unclear status
   ↓
7. Detects Scope Gaps
   - Finds missing items
   - Finds under-measured items
   - Finds unclear pricing
```

### Why Field Names Matter

The BOQ generator needs to:
1. **Extract** meaningful data from quote items
2. **Group** similar items together
3. **Match** items between different suppliers

If field names are wrong:
- ❌ Can't extract data → all items appear identical
- ❌ Can't group properly → everything collapses to one line
- ❌ Can't match → shows everything as "missing"

---

## 🚨 If Issue Persists

### Check These Scenarios

**Scenario 1: Items Still Collapse (but fewer)**

If you see 10-20 lines instead of 100-500:
- **Cause:** Parsing didn't populate detailed fields
- **Solution:** This might be correct if quotes are simple
- **Check:** Look at a few BOQ lines - do they make sense?

**Scenario 2: Everything Shows "Unnamed System"**

If system names are still missing:
- **Cause:** `description`, `system_label`, and `mapped_system` are all NULL
- **Solution:** Check quote parsing - PDF may be corrupted
- **Debug Query:**
  ```sql
  SELECT
    description,
    system_label,
    mapped_system,
    raw_description,
    normalized_description
  FROM quote_items
  WHERE quote_id = 'YOUR_QUOTE_ID'
  LIMIT 10;
  ```

**Scenario 3: Console Shows "Empty grouping key"**

If you see many warnings:
- **Cause:** Items lack ALL grouping fields
- **Behavior:** Each item becomes separate line (might be OK)
- **Check:** Are you seeing 6,380 individual lines? That's also wrong
- **Solution:** Need to improve parsing to extract more fields

---

## 📝 Verification Checklist

Before considering this fixed, verify:

- [ ] Console shows "Created XXX unique groups" where XXX > 50
- [ ] BOQ Builder shows multiple lines (not just 1)
- [ ] Each line has meaningful system name (not all "Unnamed System")
- [ ] Quantities are distributed (not one line with 6380)
- [ ] Tenderer coverage shows some matches (not all 0/1)
- [ ] Scope gaps are detected appropriately
- [ ] Sample BOQ line has populated fields (FRR, service type, etc.)

---

## 🎓 Lessons Learned

### Why This Happened

1. **Schema Evolution:** The `quote_items` table was enhanced over time with better field names
2. **Code Lag:** The BOQ generator wasn't updated to use new field names
3. **No Validation:** No checks to ensure field names matched schema
4. **Silent Failure:** Bad field mapping caused silent collapse instead of error

### Prevention

1. ✅ Always check actual database schema before field mapping
2. ✅ Add validation to detect when all items have same grouping key
3. ✅ Log sample items at start to verify field names
4. ✅ Add fallbacks to prevent catastrophic collapse
5. ✅ Use TypeScript types from database schema

---

## 📞 Still Having Issues?

If the fix doesn't work, provide:

1. **Console output** from regeneration (full text)
2. **Sample quote_items** (run this query):
   ```sql
   SELECT * FROM quote_items
   WHERE quote_id = 'YOUR_QUOTE_ID'
   LIMIT 5;
   ```
3. **BOQ lines created** (run this query):
   ```sql
   SELECT * FROM boq_lines
   WHERE project_id = 'YOUR_PROJECT_ID'
   LIMIT 10;
   ```
4. **Number of groups** shown in console
5. **Number of BOQ lines** created

---

**Fix Applied:** February 8, 2026
**Build Status:** ✅ Successful
**Next Action:** Regenerate BOQ and verify results
