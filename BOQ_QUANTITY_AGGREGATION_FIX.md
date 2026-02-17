# BOQ Quantity Aggregation - Fix Applied

## Problem Identified

High quantities appeared because items were being **grouped incorrectly**:

### Example: "Ryanfire HP-X (Single TPS / Data Cable)"
**Before Fix:**
- FireSafe had 3 line items: 6380 ea + 1682 ea + 14 ea
- ProShield had 3 line items: 6380 ea + 1682 ea + 14 ea
- System took **MAX**: 6380 ea (wrong!)
- **Should be**: 8076 ea (sum per supplier, then max)

### What Was Happening:
```javascript
// OLD CODE (WRONG):
const maxQty = Math.max(...groupItems.map(i => i.quantity || 0));
// Result: MAX(6380, 1682, 14, 6380, 1682, 14) = 6380
```

This was taking the max **across all individual items** from all suppliers, ignoring that some items should be summed first.

---

## Fix Applied

### New Logic:
```javascript
// NEW CODE (CORRECT):
// 1. Group items by supplier (quote_id)
// 2. Sum quantities per supplier
// 3. Take max across suppliers

const quantitiesPerSupplier = new Map<string, number>();
for (const item of groupItems) {
  const currentQty = quantitiesPerSupplier.get(item.quote_id) || 0;
  quantitiesPerSupplier.set(item.quote_id, currentQty + parseFloat(item.quantity));
}
const maxQty = Math.max(...Array.from(quantitiesPerSupplier.values()));
```

### Result:
- FireSafe: 6380 + 1682 + 14 = **8076 ea**
- ProShield: 6380 + 1682 + 14 = **8076 ea**
- BOQ Line: MAX(8076, 8076) = **8076 ea**

---

## Why This Happens

Suppliers often break down their quotes by:
- **Floor/Level**: "Level 1: 6380 cables, Level 2: 1682 cables, Roof: 14 cables"
- **Area/Zone**: "Core: 6380, Perimeter: 1682, Plant Room: 14"
- **Phase**: "Phase 1: 6380, Phase 2: 1682, Variation: 14"

During PDF parsing, these get extracted as **separate line items** but without location labels, so they appear as:
```
Ryanfire HP-X (Single TPS / Data Cable)  6380 ea
Ryanfire HP-X (Single TPS / Data Cable)  1682 ea
Ryanfire HP-X (Single TPS / Data Cable)  14 ea
```

---

## Expected Changes After Regeneration

### Items That Will INCREASE:
Any item where a supplier quoted the same description multiple times will now show the **sum**:

| Item | Old Qty (max) | New Qty (sum) | Change |
|------|---------------|---------------|--------|
| Ryanfire HP-X (Single TPS / Data Cable) | 6380 | 8076 | +1696 |
| SNAP Cast In Collar H100FWS (PVC Pipe) | 2222 | 2229 | +7 |
| Trafalgar SuperSTOPPER Maxi (Multi-Service) | 1276 | 1276 | 0 (only 1 line) |

### Items That Won't Change:
Items with only 1 line per supplier will remain the same.

---

## Is This Correct?

**Yes**, this is standard BOQ practice:
1. Each supplier quotes their **total scope**
2. Multiple line items with same description = **breakdown by area/phase**
3. BOQ should reflect **total quantity** per supplier
4. Then compare suppliers and take the **maximum scope** (most comprehensive)

---

## How To Verify

After regenerating BOQ, open Console (F12) and look for:

```
Creating BOQ line: Ryanfire HP-X (Single TPS / Data Cable) x 8076 ea
  (from 6 items across 2 suppliers: [8076, 8076])
```

The console now shows:
- Total items matched: 6 (3 per supplier)
- Suppliers: 2
- Quantities per supplier: [8076, 8076]
- Final BOQ quantity: 8076 (max of the two)

---

## Alternative: Keep Breakdown

If you want to **preserve the location breakdown** (3 separate BOQ lines instead of 1), you would need:

1. **Extract location from PDF** during import
2. **Update grouping key** to include location:
   ```javascript
   const key = `${description}|${location}|${service}|${size}`;
   ```

This would create:
- Ryanfire HP-X [Location A] - 6380 ea
- Ryanfire HP-X [Location B] - 1682 ea
- Ryanfire HP-X [Location C] - 14 ea

But without location data in the parsed items, we can't do this.

---

## Testing Steps

1. **Regenerate BOQ** (click "Regenerate BOQ Builder")
2. **Check quantities** - should see changes for items that had multiple lines
3. **Verify in console** - look for "from X items across Y suppliers: [qty1, qty2]"
4. **Compare to source quotes** - manually verify the totals match supplier quotes

---

## Summary

✅ **Fixed**: Quantities now correctly sum per supplier before taking max
✅ **Accurate**: BOQ reflects true supplier scope
✅ **Logged**: Console shows detailed breakdown for verification

**Next**: Regenerate BOQ and review the updated quantities.
