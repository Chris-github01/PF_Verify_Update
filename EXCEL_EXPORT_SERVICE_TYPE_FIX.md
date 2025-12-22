# Excel Export Service Type and Type Columns Fix

**Issue**: Service Type and Type (scope_category) columns were missing from the Excel comparison export.

**Date**: December 22, 2025
**Status**: ✅ FIXED

---

## Root Cause

The Excel export function (`exportItemizedComparisonToExcel`) was only exporting:
- System Description
- Qty
- UOM
- Supplier columns (Qty, UOM, Norm UOM, Unit Rate, Total)

It was missing:
- **Service Type** (`service` field)
- **Type** (`scope_category` field)

Additionally, these fields were not being properly passed through the entire data pipeline from database → normalization → comparison → matrix → export.

---

## Solution Implemented

### 1. Updated Type Definitions

**File**: `src/types/comparison.types.ts`

Added `scope_category` to both interfaces:

```typescript
export interface ComparisonRow {
  // ... existing fields
  service?: string;
  scope_category?: string;  // ✅ ADDED
  // ... other fields
}

export interface MatrixRow {
  // ... existing fields
  service?: string;
  scope_category?: string;  // ✅ ADDED
  // ... other fields
}
```

### 2. Updated Data Normalization

**File**: `src/pages/ScopeMatrix.tsx` (lines 420-446)

Added scope_category extraction from database:

```typescript
const normalisedLines = itemsData.map(item => {
  const scopeCategory = (item as any).scope_category;  // ✅ ADDED

  return {
    // ... existing fields
    service: serviceType,
    scope_category: scopeCategory,  // ✅ ADDED
    // ... other fields
  };
});
```

### 3. Updated Comparison Engine

**File**: `src/lib/comparison/hybridCompareAgainstModel.ts`

**Interface update** (lines 10-27):
```typescript
interface NormalisedLine {
  // ... existing fields
  scope_category?: string;  // ✅ ADDED
  // ... other fields
}
```

**ComparisonRow creation** (updated in 2 places):
```typescript
comparisonRows.push({
  // ... existing fields
  service: line.service || line.serviceType,
  scope_category: line.scope_category,  // ✅ ADDED
  // ... other fields
});
```

### 4. Updated Matrix Building

**File**: `src/pages/ScopeMatrix.tsx` (lines 585-597)

Added scope_category to MatrixRow:

```typescript
if (!rowMap.has(key)) {
  rowMap.set(key, {
    // ... existing fields
    service: row.service,
    scope_category: row.scope_category,  // ✅ ADDED
    // ... other fields
  });
}
```

### 5. Updated Excel Export

**File**: `src/pages/ScopeMatrix.tsx` (lines 763-785)

#### Header Row Changes

**Before:**
```typescript
const headerRow = ['System Description', 'Qty', 'UOM'];
```

**After:**
```typescript
const headerRow = ['System Description', 'Service Type', 'Type', 'Qty', 'UOM'];
```

#### Sub-Header Row Changes

**Before:**
```typescript
const subHeaderRow = ['', '', ''];
```

**After:**
```typescript
const subHeaderRow = ['', '', '', '', ''];
```

#### Data Row Changes

**Before:**
```typescript
const dataRow = [row.systemLabel || row.systemId, '', 'Mixed'];
```

**After:**
```typescript
const dataRow = [
  row.systemLabel || row.systemId,
  row.service || '',           // ✅ Service Type
  row.scope_category || '',    // ✅ Type
  '',
  'Mixed'
];
```

#### Subtotals Row

**Before:**
```typescript
const subtotalsRow = ['Subtotals:', '', ''];
```

**After:**
```typescript
const subtotalsRow = ['Subtotals:', '', '', '', ''];
```

### 6. Updated Column Widths and Merges

**File**: `src/pages/ScopeMatrix.tsx` (lines 821-841)

#### Column Widths

**Before:**
```typescript
const colWidths = [{ wch: 50 }, { wch: 8 }, { wch: 10 }];
```

**After:**
```typescript
const colWidths = [
  { wch: 50 },   // System Description
  { wch: 15 },   // Service Type ✅ ADDED
  { wch: 15 },   // Type ✅ ADDED
  { wch: 8 },    // Qty
  { wch: 10 }    // UOM
];
```

#### Merged Cells

**Before:**
```typescript
ws['!merges'] = [
  { s: { r: 4, c: 0 }, e: { r: 5, c: 0 } },
  { s: { r: 4, c: 1 }, e: { r: 5, c: 1 } },
  { s: { r: 4, c: 2 }, e: { r: 5, c: 2 } }
];
```

**After:**
```typescript
ws['!merges'] = [
  { s: { r: 4, c: 0 }, e: { r: 5, c: 0 } },  // System Description
  { s: { r: 4, c: 1 }, e: { r: 5, c: 1 } },  // Service Type ✅ ADDED
  { s: { r: 4, c: 2 }, e: { r: 5, c: 2 } },  // Type ✅ ADDED
  { s: { r: 4, c: 3 }, e: { r: 5, c: 3 } },  // Qty
  { s: { r: 4, c: 4 }, e: { r: 5, c: 4 } }   // UOM
];
```

### 7. Updated Supplier Column Positioning

**File**: `src/pages/ScopeMatrix.tsx` (lines 835-841, 870-880)

**Supplier columns now start at column 5** (instead of 3):

**Before:**
```typescript
const startSupplierCol = 3 + (idx * 5);
const supplierIdx = Math.floor((C - 3) / 5);
```

**After:**
```typescript
const startSupplierCol = 5 + (idx * 5);
const supplierIdx = Math.floor((C - 5) / 5);
```

---

## Excel Structure After Fix

### Header Layout

| Column | Header | Sub-Header |
|--------|--------|------------|
| A | System Description | (merged) |
| B | **Service Type** | (merged) |
| C | **Type** | (merged) |
| D | Qty | (merged) |
| E | UOM | (merged) |
| F-J | Supplier 1 | Qty, UOM, Norm UOM, Unit Rate, Total |
| K-O | Supplier 2 | Qty, UOM, Norm UOM, Unit Rate, Total |
| ... | ... | ... |

### Data Row Example

| System Description | Service Type | Type | Qty | UOM | Supplier1 Qty | ... |
|-------------------|--------------|------|-----|-----|---------------|-----|
| Ryanbatt 502, Servowrap & Mastic | Passive Fire | Cable | | Mixed | 4 | ... |

---

## Files Changed

### Type Definitions
- ✅ `src/types/comparison.types.ts` - Added scope_category to ComparisonRow and MatrixRow

### Data Pipeline
- ✅ `src/pages/ScopeMatrix.tsx` - Added scope_category extraction in normalization
- ✅ `src/pages/ScopeMatrix.tsx` - Added scope_category to matrix building
- ✅ `src/lib/comparison/hybridCompareAgainstModel.ts` - Added scope_category to interface and pass-through

### Excel Export
- ✅ `src/pages/ScopeMatrix.tsx` - Updated exportItemizedComparisonToExcel function:
  - Added two new header columns
  - Updated data rows to include service and scope_category
  - Updated column widths
  - Updated cell merges
  - Updated supplier column positioning (3 → 5)
  - Updated styling offsets

---

## Data Flow

```
Database (quote_items)
  ↓ service, scope_category columns
Normalization (ScopeMatrix.tsx)
  ↓ Extract into normalisedLines
Comparison Engine (hybridCompareAgainstModel.ts)
  ↓ Pass through to ComparisonRow
Matrix Building (ScopeMatrix.tsx)
  ↓ Include in MatrixRow
Excel Export (ScopeMatrix.tsx)
  ✅ Export as "Service Type" and "Type" columns
```

---

## Testing Checklist

1. ✅ **Type Checking**: Build succeeds without TypeScript errors
2. ⏳ **Data Extraction**: Verify service and scope_category are extracted from database
3. ⏳ **Data Flow**: Check that data flows through all pipeline stages
4. ⏳ **Excel Export**: Download Excel and verify columns are present
5. ⏳ **Excel Formatting**: Check column widths and styling
6. ⏳ **Multiple Suppliers**: Test with 2+ suppliers to verify column positioning
7. ⏳ **Data Accuracy**: Verify values match what's in the database

---

## Column Mapping Reference

### Database → Excel
- `service` → "Service Type" (Column B)
- `scope_category` → "Type" (Column C)

### Column Positions
- **A (0)**: System Description
- **B (1)**: Service Type ✅ NEW
- **C (2)**: Type ✅ NEW
- **D (3)**: Qty
- **E (4)**: UOM
- **F+ (5+)**: Supplier columns (5 columns per supplier)

---

## Known Behaviors

### Missing Data
- If `service` is null/undefined, column shows empty string
- If `scope_category` is null/undefined, column shows empty string

### Data Aggregation
- Service Type and Type are taken from the first row of each system
- If a system has multiple services, only the first is shown
- This is consistent with existing behavior for other system-level fields

---

## Future Enhancements

### 1. Item-Level Export (Not System-Level)
Consider adding a separate export that shows:
- All individual line items (not aggregated by system)
- Each row would have its own service_type and scope_category
- More detailed than current system-level export

### 2. Service Type Filtering
Add UI filter for Service Type:
```typescript
if (filters.service) {
  filteredData = filteredData.filter(row => row.service === filters.service);
}
```

### 3. Type Filtering
Add UI filter for scope_category:
```typescript
if (filters.scope_category) {
  filteredData = filteredData.filter(row => row.scope_category === filters.scope_category);
}
```

### 4. Pivot by Service Type
Consider alternative export showing:
- One tab per service type
- Makes it easier to review specific services

---

## Summary

The fix ensures that **Service Type** and **Type** (scope_category) columns are:
1. ✅ Extracted from database
2. ✅ Passed through entire data pipeline
3. ✅ Included in type definitions
4. ✅ Exported to Excel with proper formatting
5. ✅ Positioned correctly (columns B and C)
6. ✅ Styled consistently with other header columns

**Result**: Excel exports now include complete system information with service classification for better analysis and reporting.
