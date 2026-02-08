# BOQ Generator Debug Guide

## 🔍 Comprehensive Logging Added

The BOQ generation process now includes **extensive console logging** at every step to help diagnose why quotes aren't being picked up.

---

## 📋 How to Debug

### Step 1: Open Browser Console
- **Chrome/Edge:** Press `F12` → Console tab
- **Firefox:** Press `F12` → Console tab
- **Safari:** Cmd+Option+C

### Step 2: Clear Console
Click the "Clear Console" button (🚫 icon)

### Step 3: Click "Generate Baseline BOQ" or "Regenerate BOQ Builder"

### Step 4: Review Console Output

You should see a detailed flow like this:

```
=== BOQ Generation Started ===
Project ID: [your-project-id]
Module Key: passive_fire

Step 1: Fetching quotes...
Quotes with trade filter: 3
Tenderers found: 3
Tenderers: [
  { name: "Supplier A", quote_id: "..." },
  { name: "Supplier B", quote_id: "..." },
  { name: "Supplier C", quote_id: "..." }
]

Step 2: Fetching quote items...
Quote IDs to fetch: ["...", "...", "..."]
Total quote items found: 450
Sample quote item: { ... }

Step 3: Normalizing items...
normalizeItems: Processing 450 items
normalizeItems: Created 150 unique groups
normalizeItems: Created 150 normalized lines
Sample normalized line: { ... }

Step 4: Inserting BOQ lines...
Successfully inserted BOQ lines: 150

Step 5: Creating tenderer mappings...
createTendererMappings: Processing 150 lines x 3 tenderers
createTendererMappings: Created 450 mappings
createTendererMappings: Matched items: 420 Missing items: 30

Step 6: Detecting scope gaps...
detectScopeGaps: Analyzing 150 lines x 3 tenderers

Step 7: Marking BOQ Builder as completed...

=== BOQ Generation Complete ===
Final stats: {
  lines_created: 150,
  mappings_created: 450,
  gaps_detected: 35
}
```

---

## 🚨 Common Issues and What They Mean

### Issue 1: "Quotes with trade filter: 0"

**Console Output:**
```
Step 1: Fetching quotes...
Quotes with trade filter: 0
No quotes found with trade filter, trying without trade filter...
Quotes without trade filter: 0
```

**Meaning:** No quotes found for this project at all

**Possible Causes:**
1. Wrong project selected
2. Quotes haven't been imported yet
3. Quotes belong to different project

**Solution:**
1. Verify correct project in URL/breadcrumb
2. Go to "Import Quotes" and upload quotes
3. Check project_id in console matches your current project

**Debug Query (run in console):**
```javascript
// Check if quotes exist for this project
const projectId = window.location.pathname.split('/')[2];
const { data: quotes } = await supabase
  .from('quotes')
  .select('id, supplier_id, trade, suppliers(name)')
  .eq('project_id', projectId);
console.log('Quotes for project:', quotes);
```

---

### Issue 2: "Total quote items found: 0"

**Console Output:**
```
Step 2: Fetching quote items...
Quote IDs to fetch: ["id1", "id2", "id3"]
Total quote items found: 0
WARNING: No quote items found for any quotes!
Error: No quote items found. The quotes may not have been parsed correctly.
```

**Meaning:** Quotes exist but have no line items

**Possible Causes:**
1. Quotes were uploaded but parsing failed
2. PDF was empty or couldn't be parsed
3. Parsing jobs didn't complete
4. Database records weren't created

**Solution:**
1. Check parsing status on Import Quotes page
2. Look for parsing errors in console
3. Try reimporting the quotes
4. Verify PDF file contains data

**Debug Query (run in console):**
```javascript
// Check quote items for a specific quote
const { data: items } = await supabase
  .from('quote_items')
  .select('*')
  .eq('quote_id', 'YOUR_QUOTE_ID')
  .limit(5);
console.log('Sample quote items:', items);

// Check parsing jobs
const { data: jobs } = await supabase
  .from('parsing_jobs')
  .select('*')
  .eq('quote_id', 'YOUR_QUOTE_ID');
console.log('Parsing jobs:', jobs);
```

---

### Issue 3: "Created 0 unique groups"

**Console Output:**
```
Step 3: Normalizing items...
normalizeItems: Processing 450 items
normalizeItems: Created 0 unique groups
normalizeItems: Created 0 normalized lines
WARNING: No normalized lines created from items!
```

**Meaning:** Items exist but couldn't be grouped/normalized

**Possible Causes:**
1. All items missing critical fields (system_name, etc.)
2. Data corruption
3. Items have null/empty values

**Solution:**
1. Check sample quote item in console
2. Verify items have `system_name` field populated
3. May need to reimport quotes with better parsing

**Debug Query:**
```javascript
// Check what fields are in quote items
const { data: items } = await supabase
  .from('quote_items')
  .select('*')
  .limit(1);
console.log('Quote item structure:', items[0]);
console.log('Has system_name?', !!items[0]?.system_name);
```

---

### Issue 4: "Error inserting BOQ line: [error]"

**Console Output:**
```
Step 4: Inserting BOQ lines...
Error inserting BOQ line: { code: "...", message: "..." }
Failed line data: { ... }
```

**Meaning:** BOQ line couldn't be inserted into database

**Possible Causes:**
1. Missing required fields
2. Data type mismatch
3. Foreign key constraint violation
4. RLS policy blocking insert

**Solution:**
1. Check the error code and message
2. Review the failed line data
3. Verify database schema matches expected fields
4. Check RLS policies allow insert

---

### Issue 5: "Matched items: 0 Missing items: 450"

**Console Output:**
```
Step 5: Creating tenderer mappings...
createTendererMappings: Processing 150 lines x 3 tenderers
createTendererMappings: Created 450 mappings
createTendererMappings: Matched items: 0 Missing items: 450
```

**Meaning:** Mappings created but no items matched between BOQ and quotes

**Possible Causes:**
1. Field name mismatch in matching logic
2. Data normalization differences
3. Grouping key too strict

**Impact:**
- All items show as "missing" in tenderer mapping
- Many scope gaps will be detected
- This is actually expected behavior if quotes differ significantly

**Solution:**
This might be correct if:
- Tenderers quoted different items
- Scope varies significantly between quotes
- This is the first import and no baseline exists yet

If this seems wrong:
- Check the `findMatchingItem` logic
- Review `createGroupingKey` function
- Verify field names match between quote_items and boq_lines

---

## 🔬 Advanced Debugging

### Check Database Directly

Run these queries in browser console to inspect data:

```javascript
// 1. Check project exists
const projectId = 'YOUR_PROJECT_ID';
const { data: project } = await supabase
  .from('projects')
  .select('*')
  .eq('id', projectId)
  .single();
console.log('Project:', project);

// 2. Check quotes for project
const { data: quotes } = await supabase
  .from('quotes')
  .select(`
    id,
    supplier_id,
    trade,
    parse_status,
    suppliers (name)
  `)
  .eq('project_id', projectId);
console.log('Quotes:', quotes);

// 3. Check quote items count per quote
for (const quote of quotes) {
  const { count } = await supabase
    .from('quote_items')
    .select('*', { count: 'exact', head: true })
    .eq('quote_id', quote.id);
  console.log(`${quote.suppliers.name}: ${count} items`);
}

// 4. Sample quote items
const { data: sampleItems } = await supabase
  .from('quote_items')
  .select('*')
  .eq('quote_id', quotes[0].id)
  .limit(5);
console.log('Sample items:', sampleItems);

// 5. Check existing BOQ lines
const { data: existingBoq, count: boqCount } = await supabase
  .from('boq_lines')
  .select('*', { count: 'exact' })
  .eq('project_id', projectId)
  .eq('module_key', 'passive_fire');
console.log('Existing BOQ lines:', boqCount);
```

---

## 📊 Understanding the Data Flow

### 1. Quotes Table
```sql
quotes (
  id,
  project_id,
  supplier_id,
  trade,
  parse_status
)
```
- Each quote represents one supplier's submission
- `parse_status` should be 'completed'

### 2. Quote Items Table
```sql
quote_items (
  id,
  quote_id,
  system_name,
  location,
  frr_rating,
  substrate,
  service_type,
  size_opening,
  quantity,
  unit,
  rate,
  amount
)
```
- Line items extracted from each quote
- This is the source data for BOQ generation

### 3. BOQ Lines Table
```sql
boq_lines (
  id,
  project_id,
  module_key,
  boq_line_id,
  system_name,
  location_zone,
  frr_rating,
  quantity,
  unit,
  ...
)
```
- Normalized baseline from all quotes
- One line per unique system/location combination
- Uses MAX quantity across all tenderers

### 4. BOQ Tenderer Map Table
```sql
boq_tenderer_map (
  boq_line_id,
  tenderer_id,
  included_status,
  tenderer_qty,
  tenderer_rate,
  tenderer_amount
)
```
- Links each BOQ line to each tenderer
- Shows what each tenderer priced/included
- Status: 'included', 'missing', 'unclear', 'excluded'

### 5. Scope Gaps Table
```sql
scope_gaps (
  boq_line_id,
  tenderer_id,
  gap_type,
  description
)
```
- Automatically detected differences
- Types: 'missing', 'under_measured', 'unclear', 'unpriced'

---

## ✅ Expected Flow (Normal Operation)

When everything works correctly:

1. **Fetch Quotes:** 3-10 quotes found
2. **Fetch Items:** 100-1000+ items found (varies by project)
3. **Normalize:** Creates 50-500 unique BOQ lines
4. **Insert BOQ:** Successfully inserts all lines
5. **Create Mappings:** Creates (lines × tenderers) mappings
6. **Detect Gaps:** Finds 10-50 gaps (normal variance)
7. **Complete:** Success message shown

---

## 🚑 What To Do Next

### If you see "Total quote items found: 0":

1. **Go to Import Quotes page**
2. **Check parsing status** - should say "Completed"
3. **If parsing failed:**
   - Try reimporting the quote
   - Check PDF file is valid
   - Look for parsing errors
4. **If parsing succeeded but no items:**
   - The PDF may be empty or unparseable
   - Try a different file format
   - Contact support with PDF sample

### If you see other errors:

1. **Copy entire console output**
2. **Take screenshot of error**
3. **Note which step failed**
4. **Check database queries above**
5. **Report issue with:**
   - Console logs
   - Project ID
   - Module key
   - Number of quotes
   - When quotes were imported

---

## 📞 Reporting Issues

Include in your report:

1. **Full console output** (copy all text)
2. **Project ID** (from URL)
3. **Module key** (passive_fire, active_fire, etc.)
4. **How many quotes imported**
5. **When quotes were imported**
6. **Parse status of quotes**
7. **Screenshot of error message**
8. **Result of debug queries** (if you ran them)

---

## 🎯 Next Steps

1. **Try generating BOQ again** with console open
2. **Review the console output** carefully
3. **Identify which step fails**
4. **Use appropriate solution** from this guide
5. **Report if issue persists** with full details

The detailed logging will tell us **exactly** where the process breaks down!

---

**Last Updated:** February 2026
**Version:** 2.0 (Comprehensive Logging Edition)
