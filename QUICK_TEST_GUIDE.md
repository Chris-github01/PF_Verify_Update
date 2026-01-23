# Quick Test Guide - Trade Module Isolation

## 🎯 What You'll Verify

This 5-minute test confirms your trade modules are completely isolated and data persists correctly.

## Step-by-Step Test

### Phase 1: Verify Passive Fire Data Exists

1. **Look at header** - Should show "Verify+ Passive Fire" with orange color
2. **Check dashboard** - You should see your existing Passive Fire projects
3. **Note count** - Remember how many projects you have
4. **Confirmation**: Your Passive Fire data is safe ✓

### Phase 2: Switch to Electrical (Should Be Empty)

1. **Click center badge** - "Verify+ Passive Fire"
2. **Dropdown appears** - Shows all 5 trade options
3. **Click "⚡ Electrical"** - Yellow option
4. **Page reloads** - Automatic
5. **Header changes** - Now shows "Verify+ Electrical" (yellow)
6. **Dashboard is EMPTY** - This is correct! No Electrical projects yet
7. **Confirmation**: Empty state is expected ✓

### Phase 3: Create Electrical Project

1. **Click "Create New Project"** button
2. **Enter name**: "Test Electrical Project"
3. **Click Create**
4. **Project appears** - You now have 1 Electrical project
5. **Confirmation**: Electrical module working ✓

### Phase 4: Import Electrical Quote (Optional)

1. **Click "Import Quotes"** tab
2. **Upload an electrical contractor quote PDF**
3. **Quote imports** - Processed for Electrical trade
4. **See quote data** - In Review & Clean
5. **Confirmation**: Electrical quotes working ✓

### Phase 5: Switch Back to Passive Fire

1. **Click center badge** - "Verify+ Electrical"
2. **Dropdown appears** - Shows all 5 trades
3. **Click "🔥 Passive Fire"** - Orange option
4. **Page reloads** - Automatic
5. **Header changes** - Back to "Verify+ Passive Fire" (orange)
6. **Your original projects appear** - ALL your Passive Fire data is back!
7. **Count matches** - Same number of projects as Phase 1
8. **Confirmation**: Data persisted! Nothing lost! ✓

### Phase 6: Verify Electrical Data Persisted

1. **Click center badge** - "Verify+ Passive Fire"
2. **Click "⚡ Electrical"** - Yellow option
3. **Page reloads** - Automatic
4. **"Test Electrical Project" is still there** - Data persisted!
5. **Your electrical quote is still there** (if imported)
6. **Confirmation**: Electrical data also persisted! ✓

### Phase 7: Try Another Trade (HVAC)

1. **Click center badge** - "Verify+ Electrical"
2. **Click "💨 HVAC"** - Cyan option
3. **Page reloads** - Automatic
4. **Dashboard is EMPTY** - Correct! No HVAC projects yet
5. **No Electrical data visible** - Correct isolation!
6. **No Passive Fire data visible** - Correct isolation!
7. **Confirmation**: Complete isolation working! ✓

## Expected Results Summary

| Trade | Projects Visible | Quotes Visible | Status |
|-------|------------------|----------------|--------|
| Passive Fire | Your original projects | Your original quotes | ✅ Persisted |
| Electrical | Test Electrical Project | Test quote (if created) | ✅ Persisted |
| HVAC | None (empty) | None (empty) | ✅ Isolated |
| Plumbing | None (empty) | None (empty) | ✅ Isolated |
| Active Fire | None (empty) | None (empty) | ✅ Isolated |

## What This Proves

✅ **Data Isolation**: Each trade module has separate data
✅ **Data Persistence**: Switching back shows original data
✅ **Zero Data Loss**: Nothing disappears when switching
✅ **Clean Separation**: No cross-contamination between trades
✅ **Professional UX**: Smooth transitions, clear indicators

## Visual Indicators

### When You're in Passive Fire:
- Header shows: `🔥 Verify+ Passive Fire` (orange background)
- Only Passive Fire projects visible
- All buttons and actions affect Passive Fire data

### When You're in Electrical:
- Header shows: `⚡ Verify+ Electrical` (yellow background)
- Only Electrical projects visible
- All buttons and actions affect Electrical data

### When You're in HVAC:
- Header shows: `💨 Verify+ HVAC` (cyan background)
- Only HVAC projects visible
- All buttons and actions affect HVAC data

## Database Evidence

After completing the test, run this in Supabase SQL Editor:

```sql
-- Show projects by trade
SELECT
  trade,
  name,
  created_at
FROM projects
WHERE organisation_id = (
  SELECT id FROM organisations
  WHERE name = 'YOUR_ORG_NAME'
  LIMIT 1
)
ORDER BY trade, created_at;
```

**Expected Result:**
```
trade          | name                      | created_at
---------------|---------------------------|---------------------------
electrical     | Test Electrical Project   | 2024-01-23 10:30:00
passive_fire   | Fire Project 1            | 2024-01-15 09:00:00
passive_fire   | Fire Project 2            | 2024-01-20 14:30:00
```

This proves:
- Projects are tagged with correct trade
- Multiple trades coexist in database
- Data is separated by trade field

## Success Criteria

✅ All 7 phases completed without errors
✅ Empty states appear for new trades
✅ Original data reappears when switching back
✅ No data loss or corruption
✅ Header updates correctly for each trade
✅ Dropdown shows all 5 trade options

## If Something Doesn't Work

### Issue: Dropdown doesn't appear
**Fix**: Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)

### Issue: Data appears mixed
**Fix**: Check which trade is selected in header, switch to correct trade

### Issue: Page doesn't reload
**Fix**: Manually refresh, check browser console for errors

### Issue: Can't create project
**Fix**: Verify you're logged in, check organization is selected

## Next Steps After Test

Once verified working:

1. **Create projects in each trade** you plan to use
2. **Import sample quotes** to test each module
3. **Customize rules** per trade (coming soon)
4. **Train team** on trade switching
5. **Go live** with confidence!

## Conclusion

If all phases pass, your system is:
- ✅ **Working correctly**
- ✅ **Production ready**
- ✅ **Completely isolated**
- ✅ **Data safe**

**You can confidently use all 5 trade modules!**

---

**Test Duration**: ~5 minutes
**Last Updated**: 2024-01-23
**Status**: System Operational ✓
