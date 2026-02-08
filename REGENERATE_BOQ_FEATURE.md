# Regenerate BOQ Builder Feature

## Overview

The **Regenerate BOQ Builder** button allows users to completely reset the BOQ Builder workflow and start fresh from the original quote data, while clearing all manual modifications and customizations.

---

## 🎯 Purpose

This feature enables users to:
- **Start over** when significant changes have been made to quotes
- **Recalculate** BOQ lines, mappings, and gaps from scratch
- **Clear** all manual edits and custom tags
- **Reset** the workflow back to initial state

---

## 📍 Button Location

### Where to Find It:
**Page:** BOQ Builder
**Location:** Top-right header area, next to "Export BOQ Baseline" and "Export Tags" buttons
**Visibility:** Only visible when BOQ has already been generated (i.e., when `boqLines.length > 0`)

### Visual Placement:
```
┌─────────────────────────────────────────────────────────┐
│ BOQ Builder (Normalised Scope)                          │
│ 3 tenderers • 150 BOQ lines • 5/23 gaps open           │
│                                                          │
│  [Regenerate BOQ Builder] [Export BOQ] [Export Tags]   │
└─────────────────────────────────────────────────────────┘
```

---

## 🔄 How It Works

### Step-by-Step Process:

#### 1. User Clicks "Regenerate BOQ Builder"
- Button is styled in **red** to indicate destructive action
- Shows refresh icon (🔄) to indicate regeneration

#### 2. Confirmation Modal Appears
Modal displays:
- **Warning message** about permanent data deletion
- **Count of items** that will be deleted:
  - BOQ baseline lines
  - Tenderer mappings
  - Scope gaps
  - Project tags & clarifications
- **Note** explaining that manual edits will be lost
- **Cancel** and **Yes, Regenerate BOQ** buttons

#### 3. User Confirms Action
When user clicks "Yes, Regenerate BOQ":

##### 3a. Delete Existing BOQ Data
```typescript
// Delete BOQ lines (cascades to mappings and gaps)
DELETE FROM boq_lines
WHERE project_id = ? AND module_key = ?

// Delete project tags
DELETE FROM project_tags
WHERE project_id = ? AND module_key = ?
```

##### 3b. Reset Project Flags
```typescript
UPDATE projects
SET boq_builder_completed = false,
    boq_builder_completed_at = null
WHERE id = ?
```

##### 3c. Clear Local State
```typescript
setBoqLines([]);
setMappings([]);
setGaps([]);
setTags([]);
setGenerationResult(null);
```

##### 3d. Regenerate BOQ
```typescript
const result = await generateBaselineBOQ(projectId, moduleKey);
// Creates new:
// - BOQ lines (normalized from all quotes)
// - Tenderer mappings (links each supplier to BOQ lines)
// - Scope gaps (detects missing/under-measured items)
```

##### 3e. Reload Data
```typescript
await loadBOQData();
// Fetches freshly generated data and updates UI
```

#### 4. Success Notification
Shows alert with generation results:
```
BOQ regenerated successfully!

150 lines created
450 mappings created
23 gaps detected
```

---

## 🛡️ Data Handling

### What Gets Deleted:
✅ **BOQ Baseline Lines** (`boq_lines` table)
- All baseline BOQ line items
- System names, quantities, units, FRR ratings, etc.
- Version history reset

✅ **Tenderer Mappings** (`boq_tenderer_map` table)
- All supplier-to-BOQ-line links
- Included/missing status per supplier
- Tenderer quantities, rates, amounts
- Clarification tag links

✅ **Scope Gaps** (`scope_gaps` table)
- All detected gaps (missing, under-measured, unclear, excluded)
- Gap descriptions and risk assessments
- Commercial treatment plans
- Closure evidence

✅ **Project Tags** (`project_tags` table)
- All custom tags added to the project
- Tag agreements and negotiations
- Main contractor and supplier comments
- Contract clause references

### What Gets Preserved:
✅ **Original Quotes** (`quotes` table)
- All imported quote data remains intact
- Quote items and specifications preserved
- Supplier information maintained

✅ **Quote Items** (`quote_items` table)
- All line items from original quotes
- Quantities, rates, amounts preserved
- System names and technical specs maintained

✅ **Suppliers** (`suppliers` table)
- Supplier/tenderer records unchanged

✅ **Project Settings** (`projects` table)
- Project name, organization, basic settings
- Only BOQ completion flags are reset
- Awarded supplier (if any) remains set

✅ **Award Reports** (`award_reports` table)
- Any previously generated award reports remain
- Historical decision-making records preserved

---

## 🎨 User Interface

### Button Styling:
```tsx
<button
  onClick={() => setShowRegenerateConfirm(true)}
  disabled={regenerating}
  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center gap-2"
  title="Delete current BOQ and regenerate from quotes"
>
  <RefreshCw size={18} />
  Regenerate BOQ Builder
</button>
```

**Design Choices:**
- **Red background** (`bg-red-600`) - Indicates destructive action
- **Refresh icon** - Shows regeneration/reset concept
- **Tooltip** - Explains action on hover
- **Disabled state** - Prevents multiple clicks during regeneration

### Confirmation Modal:
```tsx
{showRegenerateConfirm && (
  <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
    {/* Modal content */}
  </div>
)}
```

**Modal Features:**
- **Backdrop blur** - Focuses attention on modal
- **Warning icon** (⚠️) - Red alert triangle
- **Item count display** - Shows exactly what will be deleted
- **Orange warning box** - Highlights critical information
- **Two-button choice** - Clear cancel vs. confirm options
- **Loading state** - Spinning icon during regeneration

---

## 🔐 Security & Permissions

### Row Level Security (RLS):
The regeneration process respects existing RLS policies:

```sql
-- User must be active member of project's organisation
EXISTS (
  SELECT 1 FROM projects p
  JOIN organisation_members om ON om.organisation_id = p.organisation_id
  WHERE p.id = boq_lines.project_id
    AND om.user_id = auth.uid()
    AND om.status = 'active'
)
```

### Access Requirements:
- ✅ User must be authenticated
- ✅ User must be active member of project's organisation
- ✅ User must have project access

### Service Role Bypass:
Not required - all operations use user's authenticated session with RLS enforcement.

---

## ⚙️ Technical Implementation

### File Location:
```
src/pages/BOQBuilder.tsx
```

### Key State Variables:
```typescript
const [regenerating, setRegenerating] = useState(false);
const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
```

### Main Function:
```typescript
const handleRegenerateBOQ = async () => {
  if (!projectId) return;

  setRegenerating(true);
  setShowRegenerateConfirm(false);

  try {
    // Step 1: Delete BOQ lines (cascades to mappings and gaps)
    const { error: deleteBoqError } = await supabase
      .from('boq_lines')
      .delete()
      .eq('project_id', projectId)
      .eq('module_key', moduleKey);

    if (deleteBoqError) throw deleteBoqError;

    // Step 2: Delete project tags
    const { error: deleteTagsError } = await supabase
      .from('project_tags')
      .delete()
      .eq('project_id', projectId)
      .eq('module_key', moduleKey);

    if (deleteTagsError) throw deleteTagsError;

    // Step 3: Reset project flags
    const { error: updateProjectError } = await supabase
      .from('projects')
      .update({
        boq_builder_completed: false,
        boq_builder_completed_at: null
      })
      .eq('id', projectId);

    if (updateProjectError) throw updateProjectError;

    // Step 4: Clear local state
    setBoqLines([]);
    setMappings([]);
    setGaps([]);
    setTags([]);
    setGenerationResult(null);

    // Step 5: Regenerate BOQ
    const result = await generateBaselineBOQ(projectId, moduleKey);
    setGenerationResult(result);

    // Step 6: Reload data
    await loadBOQData();

    // Success notification
    alert(`BOQ regenerated successfully!\n\n${result.lines_created} lines created\n${result.mappings_created} mappings created\n${result.gaps_detected} gaps detected`);
  } catch (error) {
    console.error('Error regenerating BOQ:', error);
    alert('Failed to regenerate BOQ. Please try again or contact support.');
  } finally {
    setRegenerating(false);
  }
};
```

---

## 📊 Database Operations

### Tables Affected:

#### 1. `boq_lines`
```sql
-- ON DELETE CASCADE relationships:
-- - boq_tenderer_map (via boq_line_id FK)
-- - scope_gaps (via boq_line_id FK)
-- - schedule_boq_links (via boq_line_id FK)

DELETE FROM boq_lines
WHERE project_id = ? AND module_key = ?;
```

#### 2. `project_tags`
```sql
-- No cascade relationships (standalone table)

DELETE FROM project_tags
WHERE project_id = ? AND module_key = ?;
```

#### 3. `projects`
```sql
UPDATE projects
SET
  boq_builder_completed = false,
  boq_builder_completed_at = null
WHERE id = ?;
```

### Cascade Behavior:
When `boq_lines` are deleted:
- ✅ `boq_tenderer_map` entries auto-deleted (ON DELETE CASCADE)
- ✅ `scope_gaps` entries auto-deleted (ON DELETE CASCADE)
- ✅ `schedule_boq_links` entries auto-deleted (if applicable)

---

## 🧪 Testing Checklist

### Manual Testing Steps:

#### ✅ Initial Setup
1. Navigate to BOQ Builder page
2. Generate initial BOQ (should have lines, mappings, gaps)
3. Add some custom tags from library
4. Make manual edits to some BOQ lines

#### ✅ Regeneration Flow
5. Click "Regenerate BOQ Builder" button
6. Verify confirmation modal appears
7. Check modal shows correct item counts
8. Click "Cancel" - verify modal closes, no changes
9. Click "Regenerate BOQ Builder" again
10. Click "Yes, Regenerate BOQ" - verify regeneration starts

#### ✅ During Regeneration
11. Verify button shows "Regenerating..." with spinner
12. Verify button is disabled during process
13. Wait for regeneration to complete

#### ✅ After Regeneration
14. Verify success alert appears with correct counts
15. Verify BOQ lines are present (fresh data)
16. Verify tenderer mappings recreated
17. Verify scope gaps detected again
18. Verify custom tags removed (only tags added post-regen remain)
19. Verify manual edits removed (back to baseline)
20. Verify project flags reset correctly

#### ✅ Edge Cases
21. Test with no quotes (should show error)
22. Test with only 1 tenderer
23. Test with 5+ tenderers
24. Test with different module keys (passive_fire, active_fire, etc.)
25. Test regeneration twice in a row

---

## 🎯 Use Cases

### When to Use Regenerate BOQ Builder:

#### 1. **Quotes Updated After BOQ Generation**
**Scenario:** Suppliers submit revised quotes with new items or quantities
**Solution:** Regenerate to incorporate all latest quote data

#### 2. **Major Manual Edits Need Reset**
**Scenario:** User made extensive manual changes but wants to start over
**Solution:** Regenerate to restore original baseline from quotes

#### 3. **New Quotes Added Post-Generation**
**Scenario:** Additional suppliers submit quotes after initial BOQ created
**Solution:** Regenerate to include new suppliers in mappings and analysis

#### 4. **BOQ Generation Errors**
**Scenario:** Initial generation produced incorrect results or missed items
**Solution:** Fix source quotes, then regenerate to recalculate correctly

#### 5. **Trade Module Changed**
**Scenario:** Project trade changed (e.g., passive_fire → active_fire)
**Solution:** Regenerate with new module_key to rebuild appropriate BOQ

#### 6. **Gap Analysis Reset Required**
**Scenario:** Many gaps closed but need fresh analysis after quote revisions
**Solution:** Regenerate to recompute all scope gaps from scratch

---

## ⚠️ Important Warnings

### Data Loss Warning:
```
⚠️ CRITICAL: This action permanently deletes:
- All BOQ baseline lines
- All tenderer mappings
- All scope gaps (including closure evidence)
- All project tags & clarifications
- All manual edits and customizations
```

### Cannot Undo:
Once regeneration completes, **previous BOQ data cannot be recovered** unless:
- You have an exported BOQ pack (Excel file)
- You have a database backup
- You have an audit trail export

### Best Practice:
**Always export current BOQ before regenerating:**
1. Click "Export BOQ Baseline"
2. Click "Export Tags"
3. Save both files
4. Then proceed with regeneration

---

## 🔍 Troubleshooting

### Issue: "Failed to regenerate BOQ"

**Possible Causes:**
1. No quotes exist for project
2. Database connection error
3. RLS permission denied
4. Invalid project_id or module_key

**Solutions:**
- Verify quotes imported: Check "Import Quotes" step completed
- Check browser console for specific error
- Verify user has project access
- Refresh page and try again

### Issue: Modal Won't Close

**Possible Cause:** Modal state stuck open

**Solution:**
- Refresh page
- Check for JavaScript errors in console

### Issue: Button Disabled/Grayed Out

**Possible Causes:**
1. Regeneration already in progress
2. No BOQ data exists yet (button only shows when BOQ exists)

**Solution:**
- Wait for current operation to complete
- Generate initial BOQ first if none exists

---

## 📈 Performance

### Expected Timing:
- **Small projects** (1-3 tenderers, <100 items): 2-5 seconds
- **Medium projects** (3-5 tenderers, 100-300 items): 5-15 seconds
- **Large projects** (5+ tenderers, 300+ items): 15-30 seconds

### Optimization:
- Deletes use efficient `ON DELETE CASCADE`
- Single batch generation call
- Minimal UI re-renders during process
- Loading states prevent duplicate operations

---

## 🎓 User Training Notes

### Key Points to Communicate:

1. **Destructive Action**
   - Emphasize this cannot be undone
   - Recommend exporting current BOQ first

2. **When to Use**
   - After quote revisions
   - When starting fresh analysis needed
   - Not for minor adjustments (use edit instead)

3. **What's Preserved**
   - Original quote data unchanged
   - Historical award reports maintained
   - Project settings intact

4. **Expected Results**
   - Fresh BOQ lines from all current quotes
   - New tenderer mappings recalculated
   - New scope gaps auto-detected
   - Clean slate for tags and clarifications

---

## 📋 Related Features

### Connected Functionality:
1. **Generate Baseline BOQ** - Called internally by regenerate
2. **Import Quotes** - Source data for regeneration
3. **Export BOQ Pack** - Backup before regeneration
4. **Scope Gaps Register** - Regenerated as part of process
5. **Tags & Clarifications** - Cleared during regeneration

---

## 🚀 Future Enhancements

### Potential Improvements:

1. **Selective Regeneration**
   - Option to preserve certain data (e.g., keep tags)
   - Regenerate only mappings or only gaps

2. **Backup/Restore**
   - Automatic backup before regeneration
   - Ability to restore previous BOQ version

3. **Incremental Updates**
   - Smart merge of new quote data
   - Preserve manual edits where possible

4. **Batch Operations**
   - Regenerate multiple projects at once
   - Scheduled regeneration for dynamic projects

5. **Audit Trail**
   - Log each regeneration event
   - Show regeneration history
   - Compare before/after snapshots

---

## 📞 Support

### If Issues Occur:
1. Check browser console for error messages
2. Verify user has correct permissions
3. Ensure quotes are properly imported
4. Export current BOQ as backup
5. Contact support with:
   - Project ID
   - Module key
   - Error message (if any)
   - Browser console logs

---

**Last Updated:** February 2026
**Version:** 1.0
**Feature Status:** ✅ Production Ready
