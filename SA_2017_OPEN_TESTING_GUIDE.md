# SA-2017 Open Agreement - Quick Testing Guide

## What Was Fixed

Before, clicking "Open Agreement" would:
- ❌ Open a new window/tab
- ❌ Log you out
- ❌ Show blank page or error

Now, clicking "Open Agreement" will:
- ✅ Open editor in the same window
- ✅ Keep you logged in
- ✅ Show full dynamic form

---

## Quick Test (2 minutes)

### Step 1: Create Agreement
```
1. Go to Contract Manager
2. Click Step 5: Subcontractor Onboarding
3. Click Sub-step 4: Sub-Contract Agreement (SA-2017)
4. Click "Create SA-2017 Agreement"
5. Wait for success alert
```

**Expected:** Agreement card appears with "Open Agreement" button

### Step 2: Open Agreement
```
1. Click "Open Agreement" button
```

**Expected:**
- ✅ Editor loads in same window (no new tab)
- ✅ Shows "← Back to Contract Manager" at top
- ✅ Shows agreement number (SA-0001)
- ✅ Shows form sections
- ✅ You're still logged in (check user menu)

### Step 3: Verify Form Works
```
1. Look at first section (Contract Identity)
2. Try entering text in a field
3. Try selecting from dropdown (Yes/No/N/A)
4. Add a comment in comment box
5. Click "Save Draft"
```

**Expected:**
- ✅ Can type in fields
- ✅ Dropdowns work
- ✅ Comments save
- ✅ "Draft saved successfully" message
- ✅ No errors in console

### Step 4: Close and Reopen
```
1. Click "← Back to Contract Manager"
2. Click "Open Agreement" again
```

**Expected:**
- ✅ Returns to Step 5 view
- ✅ Can reopen editor
- ✅ Data you entered is still there
- ✅ No logout or errors

---

## What You Should See

### Agreement Card (Before Opening)
```
┌─────────────────────────────────────┐
│ Agreement Number                    │
│ SA-0001                             │
│                                     │
│ Subcontractor: Optimal Fire Ltd 3  │
│ Created: 2/10/2026                  │
│                                     │
│ [👁 Open Agreement] [⬇ Export PDF]│
└─────────────────────────────────────┘
```

### Agreement Editor (After Opening)
```
← Back to Contract Manager

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SA-2017: Subcontract Agreement 2017
Agreement Number: SA-0001
Subcontractor: Optimal Fire Limited 3
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

┌─ Section 1: Contract Identity ──────┐
│                                     │
│ Contract Number: [___________]      │
│ Comment: [____________________]     │
│                                     │
│ Subcontractor Name: [___________]   │
│ Comment: [____________________]     │
│                                     │
└─────────────────────────────────────┘

┌─ Section 2: Works Description ──────┐
│                                     │
│ Works to be Performed: [________]   │
│ Comment: [____________________]     │
│                                     │
│ Completion Date: [___________]      │
│ Comment: [____________________]     │
│                                     │
└─────────────────────────────────────┘

[More sections...]

┌─ Sidebar Checklist ─────────────────┐
│ Completion: 15%                     │
│                                     │
│ ✅ Contract Identity (100%)         │
│ ⏳ Works Description (50%)          │
│ ⏳ Payment Terms (0%)               │
│ ⏳ Insurance (0%)                   │
└─────────────────────────────────────┘

[💾 Save Draft] [✓ Complete] [📄 PDF]
```

---

## Console Output

### Opening Agreement
```
[SA-2017] Opening agreement in-app: abc-123-def-456
```

### Closing Agreement
```
[SA-2017] Closing agreement view
```

---

## Common Problems

### Problem: Button Does Nothing
**Check:**
- Browser console for errors
- Network tab for failed requests
- Agreement was created successfully

### Problem: Form Shows Empty
**Check:**
- Template exists: `SELECT * FROM contract_templates WHERE template_code = 'SA-2017';`
- Fields exist: `SELECT * FROM subcontract_field_definitions WHERE template_id = '...';`
- Agreement exists: `SELECT * FROM subcontract_agreements WHERE id = '...';`

### Problem: Can't Save
**Check:**
- Agreement not locked (`is_locked = false`)
- User in correct organisation
- RLS policies allow update

---

## Browser DevTools Checks

### Session Check
```
1. Open DevTools → Application → Storage → Local Storage
2. Look for supabase auth tokens
3. Before: tokens present
4. After open: tokens STILL present ✅
```

### Network Check
```
1. Open DevTools → Network tab
2. Click "Open Agreement"
3. Check requests:
   - GET subcontract_agreements: 200 ✅
   - GET contract_templates: 200 ✅
   - GET subcontract_field_definitions: 200 ✅
   - GET subcontract_field_values: 200 ✅
4. No 401 or 403 errors ✅
```

### Console Check
```
1. Open DevTools → Console
2. Click "Open Agreement"
3. Should see:
   [SA-2017] Opening agreement in-app: ...
4. Should NOT see:
   - Auth errors
   - "Unauthorized"
   - "Session expired"
   - Component errors
```

---

## Success Criteria

✅ **Passed if:**
- Opens in same window
- User stays logged in
- Form loads with all sections
- Can edit fields
- Can save draft
- Can close and reopen
- Data persists

❌ **Failed if:**
- Opens new tab
- User logged out
- Blank page shows
- Form doesn't load
- Cannot edit
- Save fails
- Data lost

---

## Quick Debug Commands

### Check Agreement Exists
```sql
SELECT id, agreement_number, status, is_locked
FROM subcontract_agreements
WHERE project_id = '<project_id>';
```

### Check Template Exists
```sql
SELECT id, template_code, template_name, is_active
FROM contract_templates
WHERE template_code = 'SA-2017';
```

### Check User Session
```javascript
// In browser console:
const session = await window.supabase.auth.getSession();
console.log('Session:', session);
```

### Check Field Definitions Count
```sql
SELECT COUNT(*)
FROM subcontract_field_definitions
WHERE template_id = (
  SELECT id FROM contract_templates WHERE template_code = 'SA-2017'
);
-- Should return > 0 (e.g., 50-100 fields)
```

---

## Video Walkthrough Script

If recording a test video:

```
1. [0:00] Show Contract Manager page, Step 5
2. [0:05] Click "Create SA-2017 Agreement"
3. [0:10] Show success alert
4. [0:15] Show agreement card with "Open Agreement" button
5. [0:20] Click "Open Agreement"
6. [0:25] Show editor loads in same window
7. [0:30] Show user menu - still logged in
8. [0:35] Scroll through form sections
9. [0:40] Enter data in a field
10. [0:45] Add a comment
11. [0:50] Click "Save Draft"
12. [0:55] Show success message
13. [1:00] Click "Back to Contract Manager"
14. [1:05] Show returned to Step 5
15. [1:10] Click "Open Agreement" again
16. [1:15] Show data persisted
17. [1:20] End
```

**Total time:** 1:20

---

## Report Template

After testing, report results:

```
## SA-2017 Open Agreement Test Results

**Date:** 2026-02-10
**Tester:** [Your name]
**Environment:** [Local/Staging/Production]
**Browser:** [Chrome/Firefox/Safari] [Version]

### Test Results

- [ ] ✅ Create agreement works
- [ ] ✅ Open agreement opens in-app
- [ ] ✅ User stays logged in
- [ ] ✅ Form loads completely
- [ ] ✅ All sections visible
- [ ] ✅ Fields are editable
- [ ] ✅ Dropdowns work
- [ ] ✅ Comments work
- [ ] ✅ Save draft works
- [ ] ✅ Data persists
- [ ] ✅ Back button works
- [ ] ✅ Can reopen

### Issues Found

[None / List any issues]

### Screenshots

[Attach screenshots if issues found]

### Console Errors

[None / Paste any errors]

### Verdict

✅ PASS / ❌ FAIL

### Notes

[Any additional observations]
```

---

**Status:** Ready for testing
**Build:** ✅ Successful
**Expected Result:** All tests pass
**Time Required:** 2-5 minutes

---

**Last Updated:** 2026-02-10
