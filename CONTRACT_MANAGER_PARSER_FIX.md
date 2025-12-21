# Contract Manager Parser Fix - Complete

## Problem Identified

In the Contract Manager reports, some line items were displaying correctly in columns while others were showing all "—" (dashes) or incomplete data.

### Example from Screenshot:

**Row 1 (FAILED):**
```
Ryanfire Mastic (Cable / Cable Bundle) [Service: Electrical | Type: Cables | Qty: 9 ea]
Columns: - - - - - -
```

**Row 2 (WORKED):**
```
Powerpad & Mastic (Intumescent Flush Box)
Columns: Electrical | Flush Box | Intumescent pad | 816 | ea
```

## Root Cause Analysis

The issue had TWO root causes:

### 1. Parser Was Too Strict
The original parser used rigid regex patterns that REQUIRED all fields:
- Service ✓
- Type ✓
- Material ✓ (REQUIRED)
- Qty ✓

If Material was missing, the entire parse failed and all columns showed "—".

### 2. Edge Function Duplicated Attributes
The edge function checked if `item.description` was already formatted with attributes, but if it contained brackets `[...]`, it would either:
- Create double brackets
- Use stale data
- Mix old and new formatting

## Solutions Implemented

### Fix 1: Flexible Parser (contractPrintEngine.ts)

**Old Parser (Rigid):**
```typescript
const patterns = [
  /^(.+?)\s*\[(?:FRR:\s*[^\|]*\s*\|\s*)?Service:\s*(.+?)\s*\|\s*(?:Size:\s*[^\|]*\s*\|\s*)?Type:\s*(.+?)\s*\|\s*Material:\s*(.+?)\s*\|\s*Qty:\s*(\d+(?:\.\d+)?)\s*(.+?)\]$/,
  /^(.+?)\s*\[Service:\s*(.+?)\s*\|\s*Type:\s*(.+?)\s*\|\s*Material:\s*(.+?)\s*\|\s*Qty:\s*(\d+(?:\.\d+)?)\s*(.+?)\]$/,
];
```
Required Material field - if missing, parse failed entirely.

**New Parser (Flexible):**
```typescript
parseDetailString(detailStr: string): NormalizedLineItem {
  // Extract description and attributes section
  const bracketMatch = detailStr.match(/^(.+?)\s*\[(.+)\]$/);

  if (!bracketMatch) {
    return { description: detailStr, service: '—', type: '—', material: '—', quantity: '—', unit: '—' };
  }

  const description = bracketMatch[1].trim();
  const attributesStr = bracketMatch[2];

  // Parse attributes dynamically
  const attributes: Record<string, string> = {};
  const attrParts = attributesStr.split('|').map(p => p.trim());

  attrParts.forEach(part => {
    const colonIndex = part.indexOf(':');
    if (colonIndex > 0) {
      const key = part.substring(0, colonIndex).trim().toLowerCase();
      const value = part.substring(colonIndex + 1).trim();
      attributes[key] = value;
    }
  });

  // Extract quantity and unit
  let quantity = '—';
  let unit = '—';

  if (attributes['qty']) {
    const qtyMatch = attributes['qty'].match(/^(\d+(?:\.\d+)?)\s*(.+)$/);
    if (qtyMatch) {
      quantity = qtyMatch[1];
      unit = qtyMatch[2];
    }
  }

  // Return normalized item with defaults for missing fields
  return {
    description,
    service: attributes['service'] || '—',
    type: attributes['type'] || '—',
    material: attributes['material'] || '—',
    quantity,
    unit,
    notes: attributes['frr'] || attributes['size']
      ? [attributes['frr'] && `FRR: ${attributes['frr']}`, attributes['size'] && `Size: ${attributes['size']}`]
          .filter(Boolean).join(', ')
      : undefined
  };
}
```

**Benefits:**
- ✅ Handles ALL attribute combinations
- ✅ Fields can appear in ANY order
- ✅ Missing fields default to "—" (not fail)
- ✅ Works with Material present or absent
- ✅ Captures FRR and Size as notes

### Fix 2: Smart Edge Function Handling (export_contract_manager/index.ts)

**Old Logic:**
```typescript
const detailParts: string[] = [];

if (item.description) {
  detailParts.push(item.description);
}

const attributes: string[] = [];
// Always add attributes even if description already contains them
```

**New Logic:**
```typescript
// Check if description already contains formatted attributes
if (item.description && item.description.includes('[')) {
  // Description already formatted - use as-is
  system.details.push(item.description);
} else {
  // Description is plain - build combined string from fields
  const detailParts: string[] = [];

  if (item.description) {
    detailParts.push(item.description);
  }

  const attributes: string[] = [];
  if (item.frr) attributes.push(`FRR: ${item.frr}`);
  if (item.service || item.mapped_service_type) {
    attributes.push(`Service: ${item.service || item.mapped_service_type}`);
  }
  if (item.size) attributes.push(`Size: ${item.size}`);
  if (item.subclass) attributes.push(`Type: ${item.subclass}`);
  if (item.material) attributes.push(`Material: ${item.material}`);
  if (item.quantity && item.unit) {
    attributes.push(`Qty: ${item.quantity} ${item.unit}`);
  }

  if (attributes.length > 0) {
    detailParts.push(`[${attributes.join(' | ')}]`);
  }

  if (detailParts.length > 0) {
    system.details.push(detailParts.join(' '));
  }
}
```

**Benefits:**
- ✅ Handles legacy data (already formatted descriptions)
- ✅ Handles new data (plain descriptions + separate fields)
- ✅ No duplicate attributes
- ✅ No double brackets

## Test Results

All test cases now pass:

```bash
Test 1: Full format with FRR and Size
Input: "Floor penetration [FRR: -/120/120 | Service: Sealing | Size: 150mm | Type: Pipe | Material: Rockwool | Qty: 30 No]"
✅ PASSED

Test 2: Standard format with Material
Input: "Wall penetration [Service: Sealing | Type: Service | Material: Intumescent | Qty: 50 No]"
✅ PASSED

Test 3: Missing Material (FAILING IN SCREENSHOT)
Input: "Ryanfire Mastic (Cable / Cable Bundle) [Service: Electrical | Type: Cables | Qty: 9 ea]"
✅ PASSED

Test 4: Working example from screenshot
Input: "Powerpad & Mastic (Intumescent Flush Box) [Service: Electrical | Type: Flush Box | Material: Intumescent pad | Qty: 816 ea]"
✅ PASSED

Test 5: Plain description without attributes
Input: "Cable tray sealing"
✅ PASSED
```

## Supported Format Variations

The parser now handles ALL these variations:

1. **Full format:**
   ```
   Description [FRR: X | Service: Y | Size: Z | Type: W | Material: M | Qty: N Unit]
   ```

2. **Without FRR/Size:**
   ```
   Description [Service: X | Type: Y | Material: Z | Qty: N Unit]
   ```

3. **Without Material (PREVIOUSLY FAILED):**
   ```
   Description [Service: X | Type: Y | Qty: N Unit]
   ```

4. **Plain description:**
   ```
   Description only
   ```

5. **Any field combination in any order:**
   ```
   Description [Type: Y | Service: X | Qty: N Unit]
   ```

## Files Modified

1. **`src/lib/reports/contractPrintEngine.ts`**
   - Lines 81-133: Rewrote `parseDetailString()` method
   - Changed from rigid regex to flexible attribute parsing

2. **`supabase/functions/export_contract_manager/index.ts`**
   - Lines 194-222: Added smart detection for pre-formatted descriptions
   - Prevents duplicate attribute formatting

## Data Flow After Fix

```
Database (quote_items)
  ↓
  description: "Ryanfire Mastic (Cable / Cable Bundle) [Service: Electrical | Type: Cables | Qty: 9 ea]"
  service: "Electrical" (or null if in description)
  subclass: "Cables" (or null if in description)
  material: null
  quantity: 9
  unit: "ea"
  ↓
Edge Function (export_contract_manager)
  ↓
  Detects '[' in description → Uses as-is
  OR
  No '[' → Builds combined string from fields
  ↓
  details: ["Ryanfire Mastic (Cable / Cable Bundle) [Service: Electrical | Type: Cables | Qty: 9 ea]"]
  ↓
Print Engine (contractPrintEngine)
  ↓
  parseDetailString()
  ↓
  Extracts:
    - description: "Ryanfire Mastic (Cable / Cable Bundle)"
    - attributes: { service: "Electrical", type: "Cables", qty: "9 ea" }
  ↓
  Returns:
    {
      description: "Ryanfire Mastic (Cable / Cable Bundle)",
      service: "Electrical",
      type: "Cables",
      material: "—",
      quantity: "9",
      unit: "ea"
    }
  ↓
PDF Table Renders Correctly
  | Description | Service | Type | Material | Qty | Unit |
  | Ryanfire... | Electrical | Cables | — | 9 | ea |
```

## Build Status

✅ Build successful
```bash
npm run build
✓ 2044 modules transformed
✓ built in 15.25s
```

## Expected Results

After deploying these fixes, ALL Contract Manager reports will:

1. ✅ Display complete data in all columns
2. ✅ Handle items with missing Material field
3. ✅ Handle items with missing FRR/Size fields
4. ✅ Work with legacy formatted data
5. ✅ Work with new normalized data
6. ✅ Show "—" for genuinely missing fields (not parsing failures)
7. ✅ Never show duplicate attributes
8. ✅ Parse all field combinations correctly

## Testing Recommendations

1. **Test with existing projects** that showed parsing failures
2. **Verify row 1** from screenshot now displays: `Electrical | Cables | — | 9 | ea`
3. **Verify row 2** continues working: `Electrical | Flush Box | Intumescent pad | 816 | ea`
4. **Generate all 3 pack types:**
   - Junior Pack (Site Team)
   - Senior Report (Management)
   - Pre-let Appendix
5. **Check for any edge cases** with unusual formatting

## Rollback Available

If any issues occur, rollback is still available:
```bash
bash rollback-contract-manager.sh
```

This will restore the original implementation before the unified print engine.

## Summary

**Problem:** Some items showed all "—" because parser required Material field
**Solution:** Made parser flexible to handle any attribute combination
**Result:** All items now parse correctly regardless of which fields are present

✅ **READY FOR DEPLOYMENT**
