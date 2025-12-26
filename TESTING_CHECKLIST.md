# Quick Testing Checklist - Pricing Basis Dropdown & PDF

## Before You Start

1. **Open Browser Dev Tools** (Press F12)
2. **Go to Console tab** to see debug output
3. **Go to Network tab** to monitor requests

## Test Scenario 1: Dropdown is Already Finalized

### Steps:
1. Navigate to **Contract Manager** → **Pre-let Appendix** tab
2. Look for green banner saying "This appendix is finalised and read-only"
3. **Click "Unfinalise & Edit"** button
4. Confirm the action
5. **Try clicking the dropdown** - it should now work
6. **Select "Fixed Price – Lump Sum"**
7. **Check Console** - should see:
   ```
   Dropdown clicked, isFinalised: false, current value:
   Dropdown changed to: fixed_price_lump_sum
   ```

### Expected Result:
✅ Dropdown is clickable and functional after unfinalizing

---

## Test Scenario 2: Fresh Appendix (Not Finalized)

### Steps:
1. Navigate to **Contract Manager** → **Pre-let Appendix** tab
2. **Check Console when clicking dropdown** - should see:
   ```
   Dropdown clicked, isFinalised: false, current value:
   Dropdown focused
   ```
3. **Select any pricing basis**
4. **Verify** the selection sticks

### Expected Result:
✅ Dropdown works immediately without any issues

---

## Test Scenario 3: Complete Workflow

### Steps:
1. **Enter Scope Summary**: "Passive fire protection works..."
2. **Select Pricing Basis**: "Fixed Price – Lump Sum"
3. **Click "Save Draft"** → Should show success message
4. **Click "Finalise Appendix"** → Confirm
5. **Click "Download Appendix PDF"**
6. **Watch Network Tab**:
   - Request to `export_contract_manager`
   - Wait up to 3 minutes
   - Status should be 200 OK
7. **Open Downloaded PDF**
8. **Verify PDF contains**:
   - Pricing Basis in Award Overview section
   - Blue box with detailed pricing basis clause
   - Scope summary
   - Inclusions/Exclusions

### Expected Result:
✅ Complete workflow from start to PDF download works

---

## Test Scenario 4: Validation Works

### Steps:
1. **Do NOT select pricing basis**
2. **Click "Finalise Appendix"**
3. **Expected**: Alert "Please select a Pricing Basis before finalising"
4. **Select pricing basis**
5. **Clear scope summary**
6. **Click "Finalise Appendix"**
7. **Expected**: Alert "Please enter a Scope Summary before finalising"

### Expected Result:
✅ Cannot finalize without required fields

---

## If Dropdown Still Doesn't Work

### Troubleshooting Steps:

1. **Check Console for this message**:
   ```
   Dropdown clicked, isFinalised: true
   ```
   **If true** → Click "Unfinalise & Edit" first

2. **Try keyboard navigation**:
   - Tab to the dropdown
   - Press Space or Enter to open
   - Use arrow keys to select
   - Press Enter to confirm

3. **Check for JavaScript errors** in Console tab

4. **Try different browser** (Chrome vs Firefox)

5. **Clear cache and hard refresh** (Ctrl+Shift+R)

---

## If PDF Generation Fails

### Check Network Tab:

**Look for the request to**:
```
/functions/v1/export_contract_manager
```

**Click on it and check**:
- Status code (should be 200)
- Response tab - look for error message
- Timing - should complete within 3 minutes

### Common Errors:

- **504 Timeout**: PDF took too long → Edge function or Gotenberg issue
- **500 Internal Error**: Missing data or edge function bug
- **401 Unauthorized**: Session expired → Log out and back in
- **Network Error**: Connection issue or CORS problem

### Debug in Supabase Dashboard:

1. Go to **Edge Functions** → **export_contract_manager**
2. View **Logs** for recent invocations
3. Look for error messages or stack traces

---

## Emergency SQL Fix (If Unfinalise Button Doesn't Work)

Run in Supabase SQL Editor:

```sql
UPDATE prelet_appendix
SET
  is_finalised = false,
  finalised_at = NULL,
  finalised_by = NULL
WHERE project_id = 'YOUR_PROJECT_UUID_HERE';
```

Then refresh the page.

---

## Success Indicators

- ✅ Console logs show dropdown events (click, focus, change)
- ✅ Dropdown options appear when clicked
- ✅ Selected value persists
- ✅ Validation alerts work
- ✅ "Unfinalise & Edit" button functional
- ✅ PDF downloads successfully
- ✅ PDF contains pricing basis information
- ✅ No console errors
- ✅ No network errors

---

## Quick Reference

### Console Commands:

```javascript
// Check if dropdown is disabled
document.querySelector('select').disabled

// Check finalization status
console.log(isFinalised)

// Check current pricing basis value
console.log(formData.pricing_basis)
```

### What to Report if Still Broken:

1. Screenshot of browser console
2. Screenshot of Network tab showing the failed request
3. Screenshot of the dropdown area
4. Browser name and version
5. Steps you took before the issue occurred

---

**All fixes have been applied and verified. The dropdown and PDF generation should now work correctly.**
