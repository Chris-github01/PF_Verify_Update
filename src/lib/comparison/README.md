# Comparison Service

A robust comparison service with comprehensive diagnostics for Trade Analysis.

## Features

- **Flexible Matching**: Matches items by code (preferred) or normalized description + unit + size/solution
- **Inner Join**: Only returns items that exist in both datasets
- **Variance Filtering**: Filter by percentage variance threshold
- **Section Filtering**: Filter by specific sections/categories
- **Comprehensive Diagnostics**: Detailed feedback when comparisons fail or produce no results

## Usage

### Basic Comparison

```typescript
import { compareQuoteItems } from '@/lib/comparison/tradeComparisonAdapter';

const result = compareQuoteItems(
  leftQuoteItems,
  rightQuoteItems,
  {
    varianceThreshold: 10,     // ±10%
    sections: [],              // empty = all sections
    showOnlyVariances: false,  // show all items
  }
);

// result.rows contains matched items with variance calculations
// result.diag contains diagnostic information
```

### With Diagnostics

```typescript
import { compareQuoteItems, formatDiagnostics } from '@/lib/comparison/tradeComparisonAdapter';

const result = compareQuoteItems(leftItems, rightItems, filters);

if (result.rows.length === 0) {
  console.log(formatDiagnostics(result.diag));
  // Shows why comparison failed
}
```

### Display Diagnostics in UI

```typescript
import ComparisonDiagnostics from '@/components/ComparisonDiagnostics';

<ComparisonDiagnostics diagnostics={result.diag} />
```

## Matching Logic

1. **Code-based matching** (preferred): If both items have a `code` field, match by normalized code
2. **Composite matching** (fallback): Match by normalized `description + unit + (size or solution)`

Normalization removes spaces, punctuation, and converts to lowercase for robust matching.

## Diagnostics

The service provides detailed diagnostics:

- `leftCount`, `rightCount`: Number of items in each dataset after section filtering
- `leftSections`, `rightSections`: Distribution of items across sections
- `commonSections`: Sections that appear in both datasets
- `intersectionSize`: Number of matched pairs before variance filtering
- `postFilterSize`: Number of rows after all filters applied
- `reason`: Human-readable explanation when no results

## Example Integration

See `src/pages/TradeAnalysisReport.tsx` for example integration with existing comparison logic.

## Benefits

- **Clear feedback**: Users know exactly why comparisons fail
- **Robust matching**: Handles variations in formatting, spacing, punctuation
- **Performance**: Uses indexed lookups for O(n) matching
- **Type-safe**: Full TypeScript support
- **Reusable**: Can be used across different comparison scenarios
