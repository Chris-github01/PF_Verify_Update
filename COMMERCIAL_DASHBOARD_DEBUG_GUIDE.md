# COMMERCIAL DASHBOARD DEBUG GUIDE

**Date:** 2026-02-05
**Issue:** Dashboard showing "No awarded trades found" despite awards existing
**Status:** 🔍 DEBUGGING ENABLED

---

## CHANGES MADE

### 1. Fixed RLS Policy on award_approvals
**File:** Database migration

**Problem:** Platform admins couldn't see award_approvals (only org members could)

**Fix Applied:**
```sql
CREATE POLICY "Users can view approvals in their organisation"
  ON award_approvals FOR SELECT TO authenticated
  USING (
    -- Platform admins can see all ✅
    (EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid() AND is_active = true))
    OR
    -- Organisation members can see their org's approvals ✅
    (EXISTS (SELECT 1 FROM organisation_members
      WHERE organisation_id = award_approvals.organisation_id
      AND user_id = auth.uid()
      AND status = 'active'))
  );
```

### 2. Added Comprehensive Logging
**File:** `src/pages/CommercialControlDashboard.tsx`

Added console logging at every step:
- ✅ Dashboard load start
- ✅ User authentication check
- ✅ User preferences fetch
- ✅ Project details fetch
- ✅ Awards query result
- ✅ Quotes fetch
- ✅ Quote map creation
- ✅ Supplier info lookup
- ✅ Baseline generation attempts
- ✅ Contract value calculation
- ✅ Grouped map population
- ✅ Final trade metrics array

### 3. Fixed Data Source Queries
**Changed:**
- `boq_lines` → `commercial_baseline_items` ✅
- Added organization_id to queries ✅
- Added fallback to quote_items if baseline missing ✅

---

## HOW TO DEBUG

### Step 1: Open Browser Console
1. Navigate to Commercial Control dashboard
2. Open Developer Tools (F12)
3. Go to Console tab
4. Clear existing logs

### Step 2: Watch for Log Sequence

You should see this pattern:

```javascript
[Commercial Dashboard] Starting dashboard load...
[Commercial Dashboard] Current user: 260cb6c6-864f-40b1-a273-bbc0555d731c
[Commercial Dashboard] User preferences: { prefs: {...}, prefsError: null }
[Commercial Dashboard] Project details: { project: {...}, projectError: null }
[Commercial Dashboard] Loading trade metrics for project: 95559cdd-...
[Commercial Dashboard] Awards query result: { awards: [...], awardsError: null, count: 4 }
[Commercial Dashboard] Found 4 awards
[Commercial Dashboard] Quote IDs from awards: ["34469f61-...", "21abdfed-..."]
[Commercial Dashboard] Quotes fetched: { quotes: [...], quotesError: null, count: 2 }
[Commercial Dashboard] Quote map created with 2 entries
[Commercial Dashboard] Processing award: 258897a4-... with quote: 34469f61-...
[Commercial Dashboard] Found supplier info: { supplierId: "...", supplierName: "ProShield Systems" }
[Commercial Dashboard] Auto-generating baseline for award 258897a4-...
[Baseline Generator] Starting generation...
[Baseline Generator] ✅ Baseline generation complete
[Commercial Dashboard] ✅ Baseline generated for award 258897a4-...
[Commercial Dashboard] Contract value calculated: 1538755.68
[Commercial Dashboard] Creating/updating group with key: passive_fire_...
[Commercial Dashboard] ✅ Added group: {...}
[Commercial Dashboard] Grouped map final size: 2
[Commercial Dashboard] Final trade metrics: [...]
[Commercial Dashboard] Setting 2 trade metrics
```

### Step 3: Identify Where It Fails

#### If No User Found:
```
[Commercial Dashboard] No user found!
```
**Fix:** Check authentication state, may need to re-login

#### If No Current Project:
```
[Commercial Dashboard] No current project set!
```
**Fix:** Go to Project Dashboard and select a project first

#### If No Awards Found:
```
[Commercial Dashboard] No awards found for project: xxx
```
**Fix:** Awards need to be created via Award Report page

#### If No Quotes Fetched:
```
[Commercial Dashboard] Quotes fetched: { quotes: [], quotesError: {...}, count: 0 }
```
**Fix:** RLS issue on quotes table or quotes don't exist

#### If Supplier Info Missing:
```
[Commercial Dashboard] ⚠️ No supplier info found for quote: xxx
```
**Fix:** Quote record may be missing or RLS blocking access

#### If Baseline Generation Fails:
```
[Commercial Control] Failed to generate baseline for award xxx: Error...
```
**Fix:** Check quote_items exist and have valid data

---

## VERIFICATION QUERIES

Run these queries in Supabase SQL Editor to verify data:

### 1. Check Your User ID
```sql
SELECT auth.uid() as my_user_id;
```

### 2. Check Your Organizations
```sql
SELECT
  o.id,
  o.name,
  om.role_name
FROM organisation_members om
INNER JOIN organisations o ON o.id = om.organisation_id
WHERE om.user_id = auth.uid()
  AND om.status = 'active';
```

### 3. Check Your Current Project
```sql
SELECT
  up.current_project_id,
  up.current_organisation_id,
  p.name as project_name,
  p.trade,
  o.name as org_name
FROM user_preferences up
LEFT JOIN projects p ON p.id = up.current_project_id
LEFT JOIN organisations o ON o.id = up.current_organisation_id
WHERE up.user_id = auth.uid();
```

### 4. Check Awards for Your Current Project
```sql
WITH my_project AS (
  SELECT current_project_id
  FROM user_preferences
  WHERE user_id = auth.uid()
)
SELECT
  aa.id as award_id,
  aa.final_approved_supplier,
  aa.final_approved_quote_id,
  aa.approved_at,
  q.supplier_name,
  COUNT(qi.id) as quote_items_count,
  SUM(qi.quantity * qi.unit_price) as quote_total
FROM award_approvals aa
CROSS JOIN my_project mp
LEFT JOIN quotes q ON q.id = aa.final_approved_quote_id
LEFT JOIN quote_items qi ON qi.quote_id = q.id
WHERE aa.project_id = mp.current_project_id
GROUP BY aa.id, aa.final_approved_supplier, aa.final_approved_quote_id, aa.approved_at, q.supplier_name;
```

### 5. Check Commercial Baselines
```sql
WITH my_project AS (
  SELECT current_project_id
  FROM user_preferences
  WHERE user_id = auth.uid()
)
SELECT
  aa.final_approved_supplier,
  COUNT(cbi.id) as baseline_items,
  SUM(cbi.line_amount) as total_baseline_value
FROM award_approvals aa
CROSS JOIN my_project mp
LEFT JOIN commercial_baseline_items cbi ON cbi.award_approval_id = aa.id AND cbi.is_active = true
WHERE aa.project_id = mp.current_project_id
GROUP BY aa.final_approved_supplier;
```

---

## EXPECTED RESULTS

### For Summit Construction Group - Harbour Tower Project:

**Awards:** 4 award approvals
**Suppliers:** ProShield Systems, FireSafe (multiple awards)
**Quote Items:** 100+ items per quote
**Baseline Items:** Should auto-generate on dashboard load

### Expected Dashboard Display:

```
Trade Performance

PASSIVE FIRE
ProShield Systems
Contract Value: $1,538,755.68
Progress: 0%
Remaining: $1,538,755.68
VOs: 0 pending

[Export Base Tracker] [Export VO Tracker]
```

---

## TROUBLESHOOTING

### Problem: Console shows "Awards query result: { awards: [], count: 0 }"

**Possible Causes:**
1. **No awards exist for project** - Create awards via Award Report page
2. **RLS blocking access** - Check organization membership
3. **Wrong project selected** - Switch to project with awards

**Fix:**
```sql
-- Verify you can see awards
SELECT COUNT(*) as award_count
FROM award_approvals aa
INNER JOIN projects p ON p.id = aa.project_id
WHERE p.organisation_id IN (
  SELECT organisation_id
  FROM organisation_members
  WHERE user_id = auth.uid() AND status = 'active'
);
```

### Problem: Console shows "Quotes fetched: { quotes: [], count: 0 }"

**Possible Causes:**
1. **Quotes deleted or don't exist**
2. **RLS blocking quote access**
3. **Quote IDs in awards are invalid**

**Fix:**
```sql
-- Check if quotes exist and are accessible
SELECT
  q.id,
  q.supplier_name,
  q.organisation_id,
  om.user_id as can_access
FROM quotes q
LEFT JOIN organisation_members om ON om.organisation_id = q.organisation_id
  AND om.user_id = auth.uid()
  AND om.status = 'active'
WHERE q.id IN (
  SELECT final_approved_quote_id
  FROM award_approvals
  WHERE project_id = (SELECT current_project_id FROM user_preferences WHERE user_id = auth.uid())
);
```

### Problem: Baseline generation fails

**Check:**
1. Quote has quote_items
2. quote_items have valid quantity and unit_price
3. User has permission to insert into commercial_baseline_items

**Verify:**
```sql
SELECT
  qi.id,
  qi.description,
  qi.quantity,
  qi.unit_price,
  (qi.quantity * qi.unit_price) as line_total
FROM quote_items qi
WHERE qi.quote_id = 'YOUR-QUOTE-ID-HERE'
LIMIT 10;
```

---

## BUILD STATUS

```bash
✓ 2048 modules transformed
✓ built in 25.34s
✅ NO ERRORS
```

---

## NEXT STEPS

1. **Refresh the Commercial Control dashboard**
2. **Open browser console (F12)**
3. **Check console logs** - Look for the log patterns above
4. **Run verification queries** - Use SQL queries to check data
5. **Report findings** - Share console logs if issue persists

### If Still Not Working:

Take a screenshot of:
1. Browser console logs
2. Results of verification queries
3. Current project/organization selection

This will help identify the exact point of failure.

---

## SUCCESS INDICATORS

✅ Console shows: `[Commercial Dashboard] Found X awards`
✅ Console shows: `[Commercial Dashboard] Quote map created with X entries`
✅ Console shows: `[Commercial Dashboard] ✅ Added group: {...}`
✅ Console shows: `[Commercial Dashboard] Setting X trade metrics`
✅ Dashboard displays trade cards with supplier names and values

---

**The comprehensive logging will pinpoint exactly where the data flow breaks!**
