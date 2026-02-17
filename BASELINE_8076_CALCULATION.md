# Baseline Calculation: SYS-0006 (8076 No.)

## The Mystery: How did we get 8076?

**Baseline shown:** 8076 No.
**Gap report shows:**
- FireSafe quoted: 14 No. (99.8% below)
- ProShield quoted: 6380 No. (21.0% below)

---

## The Answer: Multiple Quote Lines Aggregated

### Raw Quote Data (from suppliers):

Each supplier provided **multiple separate line items** for "Ryanfire HP-X (Single TPS / Data Cable)":

#### FireSafe breakdown:
```
Line 1: 14 ea
Line 2: 6380 ea
Line 3: 1682 ea
-----------------
Total: 8076 ea ✓
```

#### ProShield Systems breakdown:
```
Line 1: 6380 ea
Line 2: 1682 ea
Line 3: 14 ea
-----------------
Total: 8076 ea ✓
```

**Both suppliers quoted the SAME total: 8076**

---

## Baseline Calculation Method

### Step 1: Aggregate by System
The BOQ generator groups all items with the same system description:
- "Ryanfire HP-X (Single TPS / Data Cable)"

### Step 2: Sum quantities per supplier
```javascript
FireSafe total = 14 + 6380 + 1682 = 8076
ProShield total = 6380 + 1682 + 14 = 8076
```

### Step 3: Calculate consensus
```javascript
Supplier quantities: [8076, 8076]
Spread = 0% (perfect agreement!)
Method: Average
Baseline = 8076 No. ✓
Confidence: High
```

---

## Why the Gap Report Shows Different Numbers

The **scope gap** is reporting **individual line item** quantities, not the aggregated total:

### What happened:
1. BOQ Builder correctly aggregated: **8076 baseline**
2. Tenderer mapping captured only **first matching line**:
   - FireSafe: 14 (captured first line only)
   - ProShield: 6380 (captured first line only)
3. Gap detector compared: 14 vs 8076 and 6380 vs 8076
4. Result: **False positive gaps!**

---

## The Root Issue: BOQ Tenderer Mapping Bug

The `boq_tenderer_map` table should show:

| Supplier | Should Be | Currently Shows |
|----------|-----------|----------------|
| FireSafe | 8076 | **14** ❌ |
| ProShield Systems | 8076 | **6380** ❌ |

**This is a bug in the BOQ generation logic** - the tenderer mapping is not aggregating multiple quote lines correctly.

---

## Consensus Quantity Algorithm (General)

For reference, here's how the baseline is calculated when suppliers **disagree**:

### 3-Tier Method:

#### Tier 1: Spread ≤ 15% → Use Average
```
Example: [100, 105, 110]
Spread = (110-100)/110 = 9.1%
Baseline = (100+105+110)/3 = 105
Confidence: High (strong consensus)
```

#### Tier 2: Spread 15-35% → Use Median
```
Example: [100, 120, 180]
Spread = (180-100)/180 = 44.4%... wait, that's >35%
```

Actually:
```
Example: [100, 115, 125]
Spread = (125-100)/125 = 20%
Baseline = Median = 115
Confidence: Medium (outlier protection)
```

#### Tier 3: Spread > 35% → Use Median + Risk Allowance
```
Example: [50, 200, 180]
Spread = (200-50)/200 = 75%
Median = 180
Risk Allowance = 10% (for "No." units)
Baseline = 180 × 1.10 = 198
Confidence: Low (high disagreement = add contingency)
```

---

## For Your Case (SYS-0006):

### Correct Calculation:
```
Suppliers: [8076, 8076]
Spread: 0%
Method: Average
Baseline: 8076
Confidence: High ✓
```

### Why Gaps Show:
The bug in tenderer mapping makes it **look like** suppliers under-quoted, but they didn't!

---

## The Fix Needed

The BOQ generator needs to:

1. **Group quote items** by system during aggregation
2. **Sum all matching lines** per supplier
3. **Store the aggregated total** in `boq_tenderer_map.tenderer_qty`

### Current (buggy) logic:
```javascript
// Takes only the first matching quote item
const matchingItem = findMatchingItem(boqLine, tendererItems);
tenderer_qty = matchingItem.quantity; // ❌ Only one line
```

### Fixed logic:
```javascript
// Sum ALL matching quote items
const matchingItems = findAllMatchingItems(boqLine, tendererItems);
tenderer_qty = matchingItems.reduce((sum, item) => sum + item.quantity, 0); // ✓ All lines
```

---

## What This Means for Your Analysis

### The Good News:
- Both suppliers **actually quoted 8076** ✓
- Perfect agreement between suppliers ✓
- Baseline is correct ✓

### The Bad News:
- The gap analysis is showing **false positives** ❌
- 47 gaps might include many false alarms ❌
- Need to fix the BOQ generation aggregation logic ❌

---

## Verification Query

To verify this for any BOQ line:

```sql
-- Check if suppliers actually match baseline (aggregated)
SELECT
  bl.boq_line_id,
  bl.system_name,
  bl.quantity as baseline,
  s.name as supplier,
  btm.tenderer_qty as mapped_qty,
  SUM(qi.quantity::numeric) as actual_supplier_total
FROM boq_lines bl
JOIN boq_tenderer_map btm ON btm.boq_line_id = bl.id
JOIN suppliers s ON btm.tenderer_id = s.id
JOIN quotes q ON q.supplier_id = s.id AND q.project_id = bl.project_id
JOIN quote_items qi ON qi.quote_id = q.id
WHERE bl.boq_line_id = 'SYS-0006'
AND bl.project_id = '95559cdd-2950-451a-ac61-4f7f6d41e6cf'
AND qi.description = bl.system_name
GROUP BY bl.id, bl.boq_line_id, bl.system_name, bl.quantity, s.name, btm.tenderer_qty;
```

---

## Summary

**Your baseline of 8076 is correct** - it's the sum of multiple quote line items from each supplier.

The **gap analysis is misleading** because the tenderer mapping only captured partial quantities (individual line items rather than aggregated totals).

This is a **data aggregation bug** in the BOQ generator that needs to be fixed to give you accurate gap analysis.
