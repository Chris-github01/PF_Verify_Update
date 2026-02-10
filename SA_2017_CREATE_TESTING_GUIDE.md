# SA-2017 Create Button - Testing Guide

## Quick Test Steps

### 1. Open DevTools First
```
Right-click → Inspect → Console tab
```

### 2. Navigate to SA-2017 Create
```
Contract Manager → Step 5: Subcontractor Onboarding → Sub-step 4: Sub-Contract Agreement
```

### 3. Click "Create SA-2017 Agreement"

### 4. Check Results

#### ✅ Success Indicators:
- Alert shows: "✓ SA-2017 agreement SA-0001 created successfully!"
- Agreement card appears
- Card shows agreement number, subcontractor name, date
- Status badge says "Draft"
- Console shows logs like:
  ```
  [SA-2017 Create] Starting agreement creation...
  [SA-2017 Create] Current user: ...
  [SA-2017 Create] Agreement created successfully: ...
  ```

#### ❌ Error Indicators:
- Alert shows detailed error message (not just "Failed to create agreement")
- Console shows error details with code, message, hint
- Agreement card does NOT appear
- Error is actionable (tells you what's wrong)

---

## Expected Console Output (Success)

```
[SA-2017 Create] Starting agreement creation for project: abc-123-def
[SA-2017 Create] Current user: user-456-ghi
[SA-2017 Create] Project organisation: org-789-jkl
[SA-2017 Create] Found template: template-012-mno
[SA-2017 Create] Generated agreement number: SA-0001
[SA-2017 Create] Inserting agreement: {template_id: "...", project_id: "...", ...}
[SA-2017 Create] Agreement created successfully: agreement-345-pqr
```

---

## Common Errors & Solutions

### Error: "SA-2017 template not found"

**Cause:** Template not seeded in database

**Solution:**
```sql
-- Check if template exists
SELECT * FROM contract_templates WHERE template_code = 'SA-2017';

-- If missing, run seeding migration:
-- supabase/migrations/20260210222103_seed_sa_2017_template_and_fields_fixed.sql
```

### Error: "Project has no organisation assigned"

**Cause:** Project record missing organisation_id

**Solution:**
```sql
-- Check project
SELECT id, name, organisation_id FROM projects WHERE id = '<project_id>';

-- If null, update it:
UPDATE projects SET organisation_id = '<org_id>' WHERE id = '<project_id>';
```

### Error: "No authenticated user found"

**Cause:** Not logged in or session expired

**Solution:**
- Log out and log back in
- Check auth token in Application → Local Storage

### Error: "new row violates row-level security policy"

**Cause:** User not a member of project's organisation OR created_by doesn't match auth.uid()

**Solution:**
```sql
-- Check user's organisation membership
SELECT * FROM organisation_members
WHERE user_id = auth.uid() AND status = 'active';

-- Ensure project's org matches user's org
SELECT p.organisation_id AS project_org,
       om.organisation_id AS user_org
FROM projects p, organisation_members om
WHERE p.id = '<project_id>'
  AND om.user_id = auth.uid()
  AND om.status = 'active';
-- These should match!
```

---

## Idempotent Create Test

### Steps:
1. Create agreement (should succeed)
2. Note the agreement number (e.g., SA-0001)
3. Refresh the page
4. Click "Create SA-2017 Agreement" again

### Expected:
- Alert: "Agreement SA-0001 already exists. Opening it now."
- Agreement card displays existing agreement
- NO duplicate created
- Console shows: "Found existing agreement: ..."

---

## Network Tab Analysis

### Open Network Tab:
```
DevTools → Network tab → Filter: "supabase" or "agreement"
```

### Expected Requests (Success):

1. **GET /auth/v1/user** - Get current user
   - Status: 200
   - Response: {user: {id: "...", ...}}

2. **GET /rest/v1/projects?id=eq.xxx** - Get project
   - Status: 200
   - Response: {organisation_id: "...", ...}

3. **GET /rest/v1/subcontract_agreements?...** - Check existing
   - Status: 200
   - Response: [] (empty if new)

4. **GET /rest/v1/contract_templates?template_code=eq.SA-2017** - Get template
   - Status: 200
   - Response: {id: "...", template_code: "SA-2017"}

5. **POST /rest/v1/subcontract_agreements** - Create agreement
   - Status: 201 Created
   - Response: {id: "...", agreement_number: "SA-0001", ...}

### Failed Request Indicators:

- **Status 400** - Bad request (missing fields)
- **Status 403** - Forbidden (RLS policy denied)
- **Status 404** - Not found (template missing)
- **Status 500** - Server error (database constraint)

**Check Response Body for Error Details:**
```json
{
  "code": "23502",
  "message": "null value in column \"organisation_id\" violates not-null constraint",
  "details": "Failing row contains (id, null, ...).",
  "hint": "Check your INSERT statement"
}
```

---

## Quick Debug Checklist

Before reporting an issue, verify:

- [ ] Logged in as authenticated user
- [ ] User is active member of an organisation
- [ ] Project has organisation_id set
- [ ] Project's organisation matches user's organisation
- [ ] SA-2017 template exists and is_active = true
- [ ] Browser console shows detailed logs
- [ ] Network tab shows request/response details
- [ ] No other browser errors in console

---

## Screenshot Checklist

When reporting issues, provide:

1. **Full browser window** showing Step 5 > Sub-step 4
2. **Console output** with all [SA-2017 Create] logs
3. **Network tab** showing failed request (if applicable)
4. **Alert dialog** showing error message

---

## Regression Testing

After fix, verify these still work:

- [ ] Step 5 sub-steps 1-3 (LOI, Compliance, Pre-let) still function
- [ ] Creating agreement in Step 5 doesn't break other tabs
- [ ] Existing agreements still load correctly
- [ ] "Open Agreement" button still works
- [ ] Agreement card displays correctly
- [ ] Agreement status updates properly (Draft → Completed)

---

## Performance Testing

Monitor create time:

```javascript
console.time('SA-2017 Create');
// Click create button
console.timeEnd('SA-2017 Create');
// Expected: 200-500ms
```

**Acceptable:** < 1 second
**Good:** < 500ms
**Excellent:** < 300ms

If > 1 second, check:
- Database query performance
- Network latency
- RLS policy complexity

---

## Security Testing

Verify RLS policies work:

**Test 1: Different Organisation**
- Create agreement in Project A (Org 1)
- Switch to Project B (Org 2)
- Try to view Project A's agreement
- **Expected:** Agreement not visible (RLS blocks)

**Test 2: Inactive Member**
- Set user's organisation membership to inactive
- Try to create agreement
- **Expected:** RLS policy denies with 403

**Test 3: Platform Admin**
- Log in as platform admin
- Create agreement in any project
- **Expected:** Works (admins bypass some RLS)

---

## Automated Test (Future)

```typescript
// Example Playwright test
test('SA-2017 agreement creation', async ({ page }) => {
  // Navigate to Step 5 > Sub-step 4
  await page.goto('/contract-manager/project-123');
  await page.click('[data-tab="onboarding"]');
  await page.click('[data-substep="sa2017"]');

  // Click create
  await page.click('button:has-text("Create SA-2017 Agreement")');

  // Wait for success
  await page.waitForSelector('text=created successfully');

  // Verify card appears
  await expect(page.locator('.agreement-card')).toBeVisible();
  await expect(page.locator('text=SA-0001')).toBeVisible();
});
```

---

## Status: Ready for Testing

✅ Build successful
✅ TypeScript compiled
✅ All imports resolved
✅ Error handling comprehensive
✅ Console logging detailed
✅ Idempotent logic added

🔄 **Awaiting manual testing confirmation**

---

**Last Updated:** 2026-02-10
**Fix Version:** 1.0
**Tester:** (Your name here after testing)
**Test Result:** (Pass/Fail)
**Notes:** (Add any observations)
