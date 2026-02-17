# Testing Guide: Consensus Quantity Implementation

## Quick Test (5 minutes)

### 1. Open BOQ Builder
Navigate to: `BOQ Builder` tab in your project

### 2. Open Browser Console
Press **F12** → Click **Console** tab

### 3. Regenerate BOQ
Click **"Regenerate BOQ Builder"** button

### 4. Watch Console Output
You should see detailed logs like:

```
=== BOQ Generation Started ===
Project ID: 95559cdd-2950-451a-ac61-4f7f6d41e6cf
Module Key: passive_fire

Step 1: Fetching quotes...
✓ Tenderers found: 2
  1. FireSafe
  2. ProShield Systems

Step 2: Fetching quote items...
Total quote items found: 245

Step 3: Normalizing items...
normalizeItems: Processing 245 items
normalizeItems: Created 15 unique groups

Creating BOQ line: Ryanfire HP-X (Single TPS / Data Cable) x 8076 ea
  Method: Average | Confidence: High | Spread: 0.0%
  Supplier quantities: [8076.0, 8076.0] across 2 suppliers

Creating BOQ line: SNAP Cast In Collar H100FWS (PVC Pipe) x 2442 ea
  Method: Median + Allowance | Confidence: Low | Spread: 45.3%
  Supplier quantities: [2229.0, 4000.0] across 2 suppliers

Creating BOQ line: Ryanfire Mastic (Cable Bundle) x 62 ea
  Method: Median | Confidence: Medium | Spread: 18.7%
  Supplier quantities: [55.0, 62.0, 68.0] across 3 suppliers
```

---

## What to Look For

### ✅ Success Indicators:

1. **Method is shown for each line:**
   - "Average" for tight agreement
   - "Median" for medium variation
   - "Median + Allowance" for high variation

2. **Confidence levels displayed:**
   - "High" (green) - spread ≤15%
   - "Medium" (amber) - spread 15-35%
   - "Low" (red) - spread >35%

3. **Spread percentages:**
   - Shows how much suppliers disagreed
   - 0% = perfect agreement
   - >35% = significant disagreement

4. **Supplier quantities shown:**
   - Array of quantities from each supplier
   - Should be summed per supplier (not individual line items)

---

## Detailed Testing Checklist

### Test 1: Perfect Agreement
**Expected:** Both suppliers quote same quantity

Look for console output:
```
Method: Average | Confidence: High | Spread: 0.0%
```

**Action:** ✅ Accept - no change needed

---

### Test 2: Tight Agreement (≤15%)
**Expected:** Suppliers within 15% of each other

Look for console output:
```
Method: Average | Confidence: High | Spread: 8.5%
```

**Action:** ✅ Accept - strong consensus

---

### Test 3: Medium Disagreement (15-35%)
**Expected:** Some variation between suppliers

Look for console output:
```
Method: Median | Confidence: Medium | Spread: 23.4%
```

**Action:** ⚠️ Review - check if reasonable

---

### Test 4: High Disagreement (>35%)
**Expected:** Significant variation with risk allowance

Look for console output:
```
Method: Median + Allowance | Confidence: Low | Spread: 67.2%
Supplier quantities: [20.0, 55.0, 60.0]
```

**Action:** ❗ REVIEW REQUIRED
- Why do suppliers disagree so much?
- Issue RFI to clarify scope
- May need independent verification

---

### Test 5: Location Breakdown Aggregation
**Expected:** Multiple line items from same supplier are summed

**Before:**
```
FireSafe - Item A: 6380 ea
FireSafe - Item A: 1682 ea
FireSafe - Item A: 14 ea
Result: 6380 ea (MAX - WRONG!)
```

**After:**
```
Supplier quantities: [8076.0, 8076.0]
(6380 + 1682 + 14 = 8076 per supplier)
Result: 8076 ea (CORRECT!)
```

**Action:** ✅ Verify totals match source quotes

---

## Database Verification

### Check BOQ Lines Table

Run this query in Supabase SQL Editor:

```sql
SELECT
  boq_line_id,
  system_name,
  quantity,
  unit,
  quantity_method,
  quantity_confidence,
  quantity_spread_percent,
  quantity_allowance_percent,
  supplier_quantities
FROM boq_lines
WHERE project_id = 'YOUR_PROJECT_ID'
ORDER BY quantity_confidence DESC, quantity_spread_percent DESC;
```

**Look for:**
1. ✅ All lines have `quantity_method` populated
2. ✅ All lines have `quantity_confidence` populated
3. ✅ `supplier_quantities` is a JSON array
4. ✅ High spread items have `quantity_allowance_percent > 0`

---

## Spot Check Calculations

### Manual Verification Example:

**Item:** Ryanfire HP-X (Single TPS / Data Cable)

**Source Quotes:**
- FireSafe: 6380 + 1682 + 14 = 8076 ea
- ProShield: 6380 + 1682 + 14 = 8076 ea

**Expected Result:**
- Spread: (8076 - 8076) / 8076 × 100 = 0%
- Method: Average (spread ≤15%)
- Quantity: (8076 + 8076) / 2 = 8076 ea
- Confidence: High

**BOQ Table Check:**
```sql
SELECT
  system_name,
  quantity,
  quantity_method,
  quantity_confidence,
  quantity_spread_percent,
  supplier_quantities
FROM boq_lines
WHERE system_name ILIKE '%HP-X%Single%';
```

**Expected Output:**
```
system_name: Ryanfire HP-X (Single TPS / Data Cable)
quantity: 8076
quantity_method: Average
quantity_confidence: High
quantity_spread_percent: 0.00
supplier_quantities: [8076, 8076]
```

✅ **PASS** if all values match

---

## Common Issues & Fixes

### Issue 1: No Method Shown in Console
**Symptom:** Logs show quantity but no "Method: Average" text

**Fix:** Check that `calculateConsensusQuantity()` function is being called

**Verify:**
```javascript
// Should see this in normalizeItems():
const consensusResult = calculateConsensusQuantity(quantities, representative.unit);
```

---

### Issue 2: Quantities Not Summed Per Supplier
**Symptom:** Console shows individual line items, not totals

**Fix:** Check grouping logic sums per `quote_id`

**Verify:**
```javascript
// Should see this in normalizeItems():
const quantitiesPerSupplier = new Map<string, number>();
for (const item of groupItems) {
  const currentQty = quantitiesPerSupplier.get(item.quote_id) || 0;
  quantitiesPerSupplier.set(item.quote_id, currentQty + parseFloat(item.quantity));
}
```

---

### Issue 3: Database Columns Missing
**Symptom:** Error inserting BOQ lines

**Fix:** Ensure migration was applied

**Run:**
```sql
-- Check if columns exist
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'boq_lines'
AND column_name IN ('quantity_method', 'quantity_confidence', 'quantity_spread_percent');
```

**Expected:** 3 rows returned

---

### Issue 4: Confidence Always "Low"
**Symptom:** All items marked as Low confidence

**Fix:** Check spread calculation

**Debug:**
```javascript
console.log('Quantities:', quantities);
console.log('Min:', Math.min(...quantities));
console.log('Max:', Math.max(...quantities));
console.log('Spread:', spread);
```

---

## Acceptance Criteria

### ✅ PASS if:

1. **Console shows detailed logs** with Method/Confidence/Spread for each line
2. **Database columns populated** with consensus metadata
3. **Quantities are logical** and match manual calculations
4. **High spread items flagged** as Low confidence
5. **Location breakdowns summed** correctly per supplier
6. **No errors** in console or database

### ❌ FAIL if:

1. Console logs missing Method/Confidence
2. Database columns NULL or missing
3. Quantities don't match manual calculations
4. All items have same confidence level
5. Location breakdowns not aggregated
6. Errors in console or database

---

## Performance Check

### Expected Timing:
- **Small project (50 items, 2 suppliers):** 2-5 seconds
- **Medium project (200 items, 3 suppliers):** 5-10 seconds
- **Large project (500+ items, 5 suppliers):** 10-20 seconds

If generation takes >30 seconds, check for:
- Database query performance
- Network latency
- Large number of gaps detected

---

## Final Verification Report

After testing, document:

### Items Changed:
| Item | Old Qty | New Qty | Method | Confidence | Reason |
|------|---------|---------|--------|------------|--------|
| Ryanfire HP-X | 6380 | 8076 | Average | High | Summed location breakdown |
| SNAP Collar H100FWS | 2222 | 2442 | Median + Allow | Low | High variation (45% spread) |

### Confidence Distribution:
- ✅ High Confidence: X items (Y%)
- ⚠️ Medium Confidence: X items (Y%)
- ❗ Low Confidence: X items (Y%) - **NEEDS REVIEW**

### Action Items:
1. Review all Low Confidence items
2. Issue RFIs for items with >50% spread
3. Document assumptions in award report
4. Verify critical quantities against drawings (if available)

---

## Support & Troubleshooting

If issues occur:

1. **Check console for errors** (red text)
2. **Verify database migration** applied correctly
3. **Inspect sample BOQ line** in database
4. **Review source quote items** in database
5. **Compare calculations manually** for 2-3 items

Console logs are your friend - they show exactly what's happening!

---

## Success!

When you see:
```
=== BOQ Generation Complete ===
Final stats: {
  lines_created: 36,
  mappings_created: 72,
  gaps_detected: 4
}
```

And all console logs show Method/Confidence/Spread...

**🎉 Implementation is working correctly!**

Review Low Confidence items and you're good to go.
