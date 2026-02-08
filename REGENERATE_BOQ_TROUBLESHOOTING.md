# Regenerate BOQ Troubleshooting Guide

## If You're Getting an Error When Clicking Regenerate

The code has been updated with **comprehensive error logging** to help diagnose issues.

---

## 🔍 How to Debug the Issue

### Step 1: Open Browser Console
1. **Chrome/Edge:** Press `F12` or `Ctrl+Shift+J` (Windows) / `Cmd+Option+J` (Mac)
2. **Firefox:** Press `F12` or `Ctrl+Shift+K` (Windows) / `Cmd+Option+K` (Mac)
3. **Safari:** Enable Developer Menu first, then press `Cmd+Option+C`

### Step 2: Clear Console and Try Again
1. Click the "Clear Console" button (🚫 icon)
2. Click "Regenerate BOQ Builder" button
3. Confirm the action
4. Watch the console for messages

### Step 3: Check Console Output
You should see messages like:
```
Starting BOQ regeneration for project: [project-id] module: [module-key]
Step 1: Deleting BOQ lines...
Step 2: Deleting project tags...
Step 3: Resetting project flags...
Step 4: Clearing local state...
Step 5: Regenerating BOQ...
BOQ generation result: { lines_created: X, mappings_created: Y, gaps_detected: Z }
Step 6: Reloading data...
Regeneration complete!
```

**If there's an error**, you'll see:
```
Error regenerating BOQ: [detailed error message]
```

---

## 🐛 Common Issues and Solutions

### Issue 1: "No quotes found for this project"

**Cause:** No quotes have been imported yet

**Solution:**
1. Go to "Import Quotes" step first
2. Upload and parse at least one quote
3. Then return to BOQ Builder and try regenerating

### Issue 2: "Failed to delete BOQ lines: [permission error]"

**Cause:** User doesn't have delete permissions

**Solution:**
1. Verify you're logged in as an active member of the organization
2. Check that you have the correct role/permissions
3. Contact admin if permissions are restricted

### Issue 3: "Failed to reset project flags"

**Cause:** Database connection or permissions issue

**Solution:**
1. Refresh the page
2. Check your internet connection
3. Try logging out and back in
4. Contact support if issue persists

### Issue 4: RLS Policy Violations

**Cause:** Row Level Security preventing access

**Solution:**
Check that:
- You are authenticated (logged in)
- You are an active member of the project's organization
- The project exists and belongs to your organization

### Issue 5: Cascade Delete Failures

**Cause:** Foreign key constraints or orphaned records

**Solution:**
This should be automatic, but if it fails:
1. Check browser console for specific table name
2. Contact support with the error details

---

## 📊 What the Console Logs Mean

### Step-by-Step Breakdown:

#### Step 1: Deleting BOQ lines
```sql
DELETE FROM boq_lines
WHERE project_id = ? AND module_key = ?
```
- Removes all BOQ baseline lines
- Automatically cascades to delete:
  - `boq_tenderer_map` (mappings)
  - `scope_gaps` (gaps)

#### Step 2: Deleting project tags
```sql
DELETE FROM project_tags
WHERE project_id = ? AND module_key = ?
```
- Removes all custom tags and clarifications

#### Step 3: Resetting project flags
```sql
UPDATE projects
SET boq_builder_completed = false,
    boq_builder_completed_at = null
WHERE id = ?
```
- Marks BOQ Builder as incomplete

#### Step 4: Clearing local state
- Clears React component state variables
- Prepares UI for fresh data

#### Step 5: Regenerating BOQ
- Calls `generateBaselineBOQ(projectId, moduleKey)`
- Fetches all quotes for project
- Normalizes items into baseline BOQ
- Creates tenderer mappings
- Detects scope gaps
- Returns counts of items created

#### Step 6: Reloading data
- Fetches fresh BOQ data from database
- Updates all tables and displays

---

## 🔬 Advanced Debugging

### Check Database Permissions

Run in browser console:
```javascript
// Check if user is authenticated
const { data: { user } } = await supabase.auth.getUser();
console.log('Authenticated user:', user?.email);

// Check if project exists
const { data: project } = await supabase
  .from('projects')
  .select('id, name, organisation_id')
  .eq('id', 'YOUR_PROJECT_ID')
  .single();
console.log('Project:', project);

// Check organization membership
const { data: membership } = await supabase
  .from('organisation_members')
  .select('*')
  .eq('user_id', user?.id)
  .eq('organisation_id', project?.organisation_id);
console.log('Membership:', membership);
```

### Test Delete Permissions

```javascript
// Test if you can delete BOQ lines
const { error } = await supabase
  .from('boq_lines')
  .delete()
  .eq('project_id', 'YOUR_PROJECT_ID')
  .eq('module_key', 'passive_fire');

console.log('Delete test error:', error);
```

### Check Existing Data

```javascript
// Check how many BOQ lines exist
const { data: lines, count } = await supabase
  .from('boq_lines')
  .select('*', { count: 'exact' })
  .eq('project_id', 'YOUR_PROJECT_ID')
  .eq('module_key', 'passive_fire');

console.log('Existing BOQ lines:', count);
```

---

## 📝 Error Message Format

The improved error handling now shows:

### Before (Generic):
```
Failed to regenerate BOQ. Please try again or contact support.
```

### After (Specific):
```
Failed to regenerate BOQ:

Failed to delete BOQ lines: permission denied for table boq_lines

Please check the browser console for more details.
```

**This tells you exactly:**
1. Which step failed
2. What the specific error was
3. How to get more information

---

## 🆘 Getting Help

If you're still stuck, provide this information to support:

1. **Error message** from the alert
2. **Console logs** (copy entire console output)
3. **Project ID** (from URL or page)
4. **Module key** (passive_fire, active_fire, etc.)
5. **User email** (your login email)
6. **Organization name**
7. **Steps you took** before the error occurred
8. **Browser and version** (Chrome 120, Firefox 121, etc.)

### How to Copy Console Logs:
1. Right-click in console
2. Select "Save as..." or "Copy all"
3. Save to a text file
4. Send to support

---

## ✅ Verifying Success

When regeneration succeeds, you should see:

1. **Success Alert:**
   ```
   BOQ regenerated successfully!

   150 lines created
   450 mappings created
   23 gaps detected
   ```

2. **Fresh Data Displayed:**
   - Baseline BOQ Lines tab shows new lines
   - Tenderer Mapping tab shows new mappings
   - Scope Gaps Register shows new gaps
   - Tags & Clarifications tab is empty (reset)

3. **Console Shows:**
   ```
   Regeneration complete!
   ```

---

## 🔄 If Regeneration Partially Completes

If regeneration fails partway through:

### Scenario: Steps 1-3 complete, Step 5 fails

**Result:**
- BOQ data is deleted
- Tags are deleted
- Project flags are reset
- But regeneration failed

**What to do:**
1. Don't panic - your original quotes are safe
2. Try clicking "Generate Baseline BOQ" button again
3. If that fails, check console for specific error
4. Contact support if issue persists

### Data Safety:
**Never deleted:**
- Original quotes (`quotes` table)
- Quote items (`quote_items` table)
- Suppliers (`suppliers` table)
- Award reports (`award_reports` table)
- Project basic info

**Can be regenerated:**
- BOQ lines
- Mappings
- Gaps
- Everything else

---

## 🚑 Emergency Recovery

If things go wrong and you need to start fresh:

### Option 1: Reimport Quotes
1. Go to Import Quotes
2. Reupload original PDF quotes
3. Let them parse again
4. Return to BOQ Builder
5. Generate baseline BOQ

### Option 2: Use Exported BOQ (if you have it)
1. If you exported BOQ before regenerating
2. Use the Excel file as reference
3. Manually rebuild or contact support for import

### Option 3: Contact Support
Provide all information listed in "Getting Help" section above

---

## 🎯 Best Practices

### Before Regenerating:
1. ✅ **Always export** current BOQ first
2. ✅ **Screenshot** key data if needed
3. ✅ **Note** any manual customizations
4. ✅ **Verify** quotes are imported correctly
5. ✅ **Check** browser console is clear of errors

### During Regeneration:
1. ✅ **Don't refresh** the page
2. ✅ **Don't navigate** away
3. ✅ **Wait** for completion message
4. ✅ **Watch** the console for progress

### After Regeneration:
1. ✅ **Verify** data looks correct
2. ✅ **Check** all tabs (Baseline, Mapping, Gaps, Tags)
3. ✅ **Review** gap counts are reasonable
4. ✅ **Test** export functionality
5. ✅ **Document** any issues found

---

## 📞 Support Information

**For technical support:**
- Include all information from "Getting Help" section
- Attach console logs
- Describe what you were trying to accomplish
- Note any error messages

**For immediate issues:**
- Check this troubleshooting guide first
- Review console logs for specific errors
- Try the suggested solutions
- Contact support if unresolved

---

**Last Updated:** February 2026
**Version:** 1.1 (with enhanced error logging)
