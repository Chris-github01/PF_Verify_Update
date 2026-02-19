# Data Integrity Root Cause Analysis - ProShield Systems Quote

## Executive Summary

**Issue:** Quote value should be ~$1.4M but downstream workflows only see $772,993.70 (53% data loss)

**Root Cause:** Database storage logic correctly stores `total_amount = $1,465,830.60`, but saves incomplete `quote_items` records where items have `quantity = 0` and `unit_price = null`. Downstream workflows calculate totals from `quantity × unit_price`, resulting in $0 for most items.

---

## Data Flow Verification

### Stage 1: Source Document ✓
**File:** ProShield_Systems_Quote.pdf
**Expected Total:** $1,466,734.50
- Heritage Building: $7,241.50
- New Building: $1,440,993.00
- TOTAL: $1,448,234.50
- P&G - PS3 & QA: $18,500.00
- **Grand Total (excluding GST): $1,466,734.50**

### Stage 2: AI Parser Output ⚠️
**Location:** `parsing_jobs.result_data`
**Captured Total:** $1,465,830.60 (∆ -$904 from source)
- Items captured: 123
- Items structure: **All items have `total` field only, `qty` and `unit_price` are NULL**
- Sum of all item totals: $1,465,830.60 ✓

### Stage 3: Database Storage - quotes table ✓
**Location:** `quotes` table
**Stored:** `total_amount = $1,465,830.60` ✓ CORRECT
**Stored:** `items_count = 123` ✓

### Stage 4: Database Storage - quote_items table ❌ **DATA LOSS HERE**
**Location:** `quote_items` table
**Saved:** 112 items (11 filtered out)
**Problem:** Items saved with:
- `quantity = 0` (when qty was null in parser result)
- `unit_price = null` (when unit_price was null in parser result)
- `total_price = [correct value]` ✓

**Result:** Calculation of `quantity × unit_price = 0 × null = 0` for all items!

**Actual sum from `total_price` column:** $772,993.70
**Calculated from `qty × unit_price`:** $772,993.70

This means only 112 of the 123 items had valid qty/unit_price data.

### Stage 5: Downstream Workflows ❌ **INCORRECT CALCULATION**
**Location:** `src/lib/commercial/baselineGenerator.ts` (Lines 157-160)

```typescript
const baseContractValue = baselineItems.reduce(
  (sum, item) => sum + (item.quantity * item.unit_rate),  // ← Uses qty × rate
  0
);
```

**Problem:** This calculates from `quantity × unit_rate` which only works for the 112 items that had valid data, ignoring items where only `total` was available.

**Result:** Base Tracker shows $772,993.70 instead of $1,465,830.60

---

## Root Cause Identified

### The Core Issue

**File:** `supabase/functions/parse_quote_with_extractor/index.ts` (Lines 225-234, 290-302)

1. **Total calculation happens BEFORE filtering** (Line 225-228):
```typescript
const lineItemsTotal = items.reduce((sum: number, item: any) => {
  const itemTotal = parseFloat(item.total || item.amount || "0");
  return sum + itemTotal;
}, 0);  // = $1,465,830.60 (from all 123 items)
```

2. **Then filtering removes 11 items** (Lines 182-221):
   - Removes lump sum items
   - Removes optional items
   - Result: 112 items remain

3. **But `total_amount` uses the pre-filter calculation** (Line 234):
```typescript
const totalAmount = quotedTotal || lineItemsTotal;  // Still $1,465,830.60
```

4. **Items are saved with incomplete data** (Lines 298-301):
```typescript
return {
  quantity: parseFloat(item.qty || item.quantity || "0"),  // ← Becomes 0 when null
  unit_price: unitPrice !== null && unitPrice !== undefined ? parseFloat(unitPrice) : null,  // ← Stays null
  total_price: totalPrice !== null && totalPrice !== undefined ? parseFloat(totalPrice) : null,
};
```

**The Logic Flaw:**
- Items with only `total` field (no qty/unit_price breakdown) are saved with `quantity=0` and `unit_price=null`
- When downstream workflows calculate `quantity × unit_price`, these items contribute $0
- Only items with valid qty and unit_price (112 items) contribute to calculations

---

## Data Integrity Breach Points

| Stage | Data Point | Expected | Actual | Status |
|-------|-----------|----------|--------|--------|
| AI Parser | Grand Total | $1,466,734.50 | $1,465,830.60 | ⚠️ Minor loss |
| quotes.total_amount | Total Amount | $1,465,830.60 | $1,465,830.60 | ✓ CORRECT |
| quote_items count | Item Count | 123 | 112 | ❌ 11 items filtered |
| quote_items.total_price SUM | Items Total | $1,465,830.60 | $772,993.70 | ❌ **MAJOR LOSS** |
| Baseline Generator | Contract Value | $1,465,830.60 | $772,993.70 | ❌ **MAJOR LOSS** |
| Base Tracker | Display Value | $1,465,830.60 | $772,993.70 | ❌ **MAJOR LOSS** |

---

## Why Items Have Only `total` Field

The PDF quote has mixed formatting:
- Some items show: Qty=5, Rate=$159.50, Total=$797.50 ✓
- Other items show: Total=$354,409 only (no qty/rate breakdown) ❌
- The AI parser captures whatever is visible in the PDF

**Example from query results:**
All 123 parsed items have `qty: null` and `unit_price: null`, but `total` is populated.

This suggests the PDF either:
1. Has summary rows without qty/rate breakdown
2. Has grouped totals on certain pages
3. Uses a format where totals are more prominent than qty/rate

---

## The Fix Required

### Option 1: Recalculate Total After Filtering (Preserves parsing logic)

**File:** `supabase/functions/parse_quote_with_extractor/index.ts`

**Change Line 225-234:**
```typescript
// Calculate BEFORE filtering
const lineItemsTotalBeforeFilter = items.reduce((sum: number, item: any) => {
  const itemTotal = parseFloat(item.total || item.amount || "0");
  return sum + itemTotal;
}, 0);

// ... filtering happens here (lines 182-221) ...

// RECALCULATE AFTER filtering
const lineItemsTotal = items.reduce((sum: number, item: any) => {
  const itemTotal = parseFloat(item.total || item.amount || "0");
  return sum + itemTotal;
}, 0);

const quotedTotal = grandTotal || null;
const totalAmount = quotedTotal || lineItemsTotal;  // Now uses post-filter value
```

### Option 2: Save Items With total-only as qty=1, unit_price=total

**File:** `supabase/functions/parse_quote_with_extractor/index.ts`

**Change Lines 290-302:**
```typescript
const quoteItems = items.map((item: any) => {
  const unitPrice = item.unit_price ?? item.unitPrice ?? item.rate;
  const totalPrice = item.total ?? item.amount;
  let quantity = parseFloat(item.qty || item.quantity || "0");
  let finalUnitPrice = unitPrice;

  // FIX: If no qty/unit_price but we have total, convert to qty=1, price=total
  if ((quantity === 0 || !finalUnitPrice) && totalPrice) {
    quantity = 1;
    finalUnitPrice = parseFloat(totalPrice.toString());
  }

  return {
    quote_id: quote.id,
    description: item.description || item.desc || "",
    quantity: quantity,
    unit: item.unit || "ea",
    unit_price: finalUnitPrice !== null && finalUnitPrice !== undefined ? parseFloat(finalUnitPrice.toString()) : null,
    total_price: totalPrice !== null && totalPrice !== undefined ? parseFloat(totalPrice.toString()) : null,
  };
});
```

### Option 3: Use `quotes.total_amount` in Baseline Generator

**File:** `src/lib/commercial/baselineGenerator.ts`

**Change Lines 156-162:**
```typescript
// Fetch the quote's stored total instead of calculating from items
const { data: quoteData } = await supabase
  .from('quotes')
  .select('total_amount')
  .eq('id', quoteId)
  .single();

const baseContractValue = parseFloat(quoteData.total_amount) || 0;
```

---

## Recommended Solution

**Implement Option 2** (Save items with total-only as qty=1, price=total)

**Reasoning:**
1. Preserves the parsing logic (as requested)
2. Fixes data integrity at the storage layer
3. Makes downstream calculations work correctly
4. Items will sum correctly: `1 × total = total` ✓
5. Transparent and auditable

**Impact:**
- `quote_items` will have all 123 items (or however many pass filtering)
- Each item will have valid `quantity` and `unit_price` values
- Calculations of `quantity × unit_price` will match `total_price`
- Base Tracker and all downstream workflows will show $1,465,830.60

---

## Verification Steps

After implementing the fix:

1. ✅ Re-import the ProShield Systems quote
2. ✅ Verify `quotes.total_amount = $1,465,830.60`
3. ✅ Verify all saved items have `quantity > 0` and `unit_price != null`
4. ✅ Verify `SUM(quantity × unit_price) FROM quote_items = $1,465,830.60`
5. ✅ Verify Base Tracker shows $1,465,830.60
6. ✅ Verify baseline generation uses correct value
7. ✅ Verify Commercial Control Dashboard displays $1,465,830.60

---

## Summary

- **Parsing works correctly:** AI captures $1,465,830.60 ✓
- **Storage has a flaw:** Items with only `total` are saved with qty=0, unit_price=null ❌
- **Downstream workflows fail:** They calculate from qty × unit_price = 0 ❌
- **Fix:** Convert total-only items to qty=1, unit_price=total at storage time
- **Result:** All workflows will correctly see $1,465,830.60 ✓
