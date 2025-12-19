# Award Report Enhancements - QS/Commercial Director Ready

## Overview

The Award Recommendation Report has been comprehensively refactored to be QS/Commercial Director-ready with enhanced analytics, professional visuals, and rigorous scoring methodology.

## Key Enhancements Implemented

### 1. Fixed Risk Score Logic ✅

**Problem**: Risk score was displayed inconsistently, causing confusion about whether higher or lower was better.

**Solution**:
- Clarified that `rawRiskScore` = count of missing items (lower = better)
- Created `riskMitigationScore` = 10 - (normalized rawRiskScore) for display (higher = better)
- Updated all UI elements to show "Risk Mitigation Score" where 10 = minimal risk, 0 = high risk
- Ensured weighted scoring uses properly inverted risk scores

**Files**:
- `src/lib/reports/awardReportEnhancements.ts` - New utility with `calculateRiskMitigationScore()`

### 2. Enhanced Supplier Comparison Table ✅

**New Columns Added**:
- **Normalized Price/System**: Total price divided by systems covered for fair comparison
- **Variance %**: Percentage difference vs. average price across all suppliers
- **Enhanced Visuals**: Color-coded badges, progress bars, and hover states

**Features**:
- Best value and lowest risk suppliers highlighted with badges
- Interactive rows with hover effects
- Variance indicators with up/down arrows and color coding (green = below average, red = above average)
- Coverage progress bars for visual comparison

**Component**: `src/components/award/EnhancedSupplierTable.tsx`

### 3. Weighted Scoring Breakdown Section ✅

**New Section** showing detailed multi-criteria analysis per supplier:

**Columns**:
- **Criterion**: Price, Compliance, Coverage, Risk Mitigation
- **Weight %**: Configurable weighting (default: 40%, 25%, 20%, 15%)
- **Normalized Score**: 0-10 scale for each criterion
- **Weighted Contribution**: Points contributed to total score
- **Total Score**: Sum out of 100

**Scoring Logic**:
```typescript
Price Score: 10 = cheapest, 0 = most expensive (inverse linear)
Compliance Score: 10 - (normalized risk factors * 0.5)
Coverage Score: (coverage % / 100) * 10
Risk Mitigation Score: 10 - (normalized missing items)

Weighted Total =
  (PriceScore × 40%) +
  (ComplianceScore × 25%) +
  (CoverageScore × 20%) +
  (RiskScore × 15%)
```

**Component**: `src/components/award/WeightedScoringBreakdown.tsx`

### 4. Visual Coverage Breakdown ✅

**New Pie/Donut Chart** per supplier showing:
- Systems covered by major category (Fire Detection, Suppression, Passive, etc.)
- Interactive legend with hover effects
- Color-coded segments with percentages

**Top 5 Scope Gaps** with:
- Description of missing item
- Severity indicator (Low/Medium/High)
- Estimated add-on cost (average rate + 20% markup)
- Total estimated gap cost

**Component**: `src/components/award/CoverageBreakdownChart.tsx`

### 5. Visual Methodology Flowchart ✅

**Replaced** long text paragraphs with:
- Colorful 5-stage flowchart
- Icons for each stage (FileUp, Database, SearchCheck, Shield, Award)
- Numbered circles with color coding
- Hover effects and descriptions
- "What This Means for You" bullet points

**5 Stages**:
1. Quote Import & Validation (Blue)
2. Data Normalization (Green)
3. Scope Gap Analysis (Purple)
4. Risk Assessment (Orange)
5. Multi-Criteria Scoring (Red)

**Component**: `src/components/award/MethodologyFlowchart.tsx`

### 6. Enhanced Recommendations ✅

**New Metrics**:
- **Estimated Full-Scope Cost**: Calculated by adding estimated cost for missing items (15% premium)
- **Potential Savings vs. Highest Bid**: Shows dollar amount and percentage saved
- **Price Range**: Displays lowest to highest bid for context

**Three Recommendation Cards**:
- Best Value (Green) - Lowest price
- Lowest Risk (Blue) - Highest compliance/coverage
- Balanced Choice (Orange) - Highest weighted score

Each card shows:
- Current quote price
- Coverage percentage
- Risk mitigation score
- Est. full-scope cost (if coverage < 100%)
- Weighted total score

**Component**: `src/components/award/EnhancedRecommendationsCard.tsx`

## How to Use the New Components

### Integration Example

```tsx
import EnhancedSupplierTable from '../components/award/EnhancedSupplierTable';
import WeightedScoringBreakdown from '../components/award/WeightedScoringBreakdown';
import CoverageBreakdownChart from '../components/award/CoverageBreakdownChart';
import MethodologyFlowchart from '../components/award/MethodologyFlowchart';
import EnhancedRecommendationsCard from '../components/award/EnhancedRecommendationsCard';
import {
  calculatePriceScore,
  calculateComplianceScore,
  calculateCoverageScore,
  calculateRiskMitigationScore,
  calculateWeightedTotal,
  calculateNormalizedPrice,
  calculateVariancePercent,
  generateSystemsBreakdown,
  estimateScopeGapCosts,
  DEFAULT_WEIGHTS,
  type EnhancedSupplierMetrics
} from '../lib/reports/awardReportEnhancements';

// 1. Process supplier data into enhanced metrics
const processSupplierData = (suppliers, comparisonData) => {
  const prices = suppliers.map(s => s.adjustedTotal);
  const averagePrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;
  const lowestPrice = Math.min(...prices);
  const highestPrice = Math.max(...prices);
  const maxRisk = Math.max(...suppliers.map(s => s.riskScore));

  return suppliers.map((supplier, idx) => {
    // Calculate scores (0-10)
    const priceScore = calculatePriceScore(supplier.adjustedTotal, lowestPrice, highestPrice);
    const complianceScore = calculateComplianceScore(supplier.riskScore, maxRisk);
    const coverageScore = calculateCoverageScore(supplier.coveragePercent);
    const riskScore = calculateRiskMitigationScore(supplier.riskScore, maxRisk);

    // Calculate weighted total (0-100)
    const weightedTotal = calculateWeightedTotal(
      priceScore,
      complianceScore,
      coverageScore,
      riskScore,
      DEFAULT_WEIGHTS
    );

    // Get items for this supplier to generate breakdown
    const supplierItems = comparisonData.map(row => ({
      category: row.category || 'General',
      isQuoted: row.suppliers[supplier.supplierName]?.unitPrice !== null
    }));

    const missingItems = comparisonData
      .filter(row => !row.suppliers[supplier.supplierName]?.unitPrice)
      .map(row => ({ description: row.description, category: row.category }));

    return {
      supplierName: supplier.supplierName,
      totalPrice: supplier.adjustedTotal,
      systemsCovered: supplier.itemsQuoted,
      totalSystems: supplier.totalItems,
      coveragePercent: supplier.coveragePercent,

      // Normalized metrics
      normalizedPricePerSystem: calculateNormalizedPrice(supplier.adjustedTotal, supplier.itemsQuoted),
      variancePercent: calculateVariancePercent(supplier.adjustedTotal, averagePrice),
      varianceFromLowest: supplier.adjustedTotal - lowestPrice,

      // Risk scores
      rawRiskScore: supplier.riskScore,
      riskMitigationScore: riskScore,

      // Detailed scores
      priceScore,
      complianceScore,
      coverageScore,
      riskScore,
      weightedTotal,

      // Visuals data
      systemsBreakdown: generateSystemsBreakdown(supplierItems, supplier.totalItems),
      scopeGaps: estimateScopeGapCosts(
        missingItems,
        supplier.adjustedTotal / supplier.itemsQuoted,
        supplier.itemsQuoted,
        supplier.totalItems
      ),

      rank: 0, // Will be set after sorting
      isBestValue: false,
      isLowestRisk: false,
    };
  });
};

// 2. Sort and rank suppliers
const enhancedSuppliers = processSupplierData(suppliers, comparisonData);
enhancedSuppliers.sort((a, b) => b.weightedTotal - a.weightedTotal);
enhancedSuppliers.forEach((s, idx) => {
  s.rank = idx + 1;
  s.isBestValue = s.totalPrice === Math.min(...enhancedSuppliers.map(x => x.totalPrice));
  s.isLowestRisk = s.rawRiskScore === Math.min(...enhancedSuppliers.map(x => x.rawRiskScore));
});

// 3. Render components
<EnhancedRecommendationsCard
  bestValue={enhancedSuppliers.find(s => s.isBestValue)}
  lowestRisk={enhancedSuppliers.find(s => s.isLowestRisk)}
  balanced={enhancedSuppliers[0]}
  highestPrice={Math.max(...enhancedSuppliers.map(s => s.totalPrice))}
  lowestPrice={Math.min(...enhancedSuppliers.map(s => s.totalPrice))}
/>

<MethodologyFlowchart />

<EnhancedSupplierTable
  suppliers={enhancedSuppliers}
  onSupplierClick={(name) => console.log('Clicked', name)}
/>

<WeightedScoringBreakdown
  suppliers={enhancedSuppliers}
  weights={DEFAULT_WEIGHTS}
/>

{enhancedSuppliers.map(supplier => (
  <CoverageBreakdownChart key={supplier.supplierName} supplier={supplier} />
))}
```

## PDF Export Enhancements (Next Phase)

To be implemented in `src/lib/reports/modernPdfTemplate.ts`:

1. **Landscape Orientation** for wide tables
2. **Enhanced Visuals**: Include pie charts, flowchart, score breakdowns
3. **Tighter Spacing**: Remove blank pages, optimize layout
4. **New Sections**:
   - Weighted scoring breakdown table
   - Coverage breakdown per supplier
   - Top 5 scope gaps with estimated costs
   - Financial summary (full-scope costs, savings)

## Interactive Elements (In-App Only)

- **Hover Tooltips**: Show detailed info on hover
- **Clickable Charts**: Click pie chart segments to filter
- **Expandable Sections**: Collapse/expand detailed breakdowns
- **Sortable Tables**: Click headers to sort by column

## Configuration

Default scoring weights can be customized:

```typescript
import { DEFAULT_WEIGHTS, type ScoringWeights } from '../lib/reports/awardReportEnhancements';

const customWeights: ScoringWeights = {
  price: 35,      // Lower priority on price
  compliance: 30, // Higher priority on compliance
  coverage: 25,   // Higher priority on coverage
  risk: 10,       // Lower priority on risk
};
```

## Testing Checklist

- [x] Build succeeds with no TypeScript errors
- [ ] Risk scores display correctly (higher = better)
- [ ] Normalized price per system calculates accurately
- [ ] Variance % shows correct color coding
- [ ] Weighted scoring totals add up to 100
- [ ] Pie chart segments sum to 100%
- [ ] Scope gaps show estimated costs
- [ ] Methodology flowchart renders on all screens
- [ ] Recommendations show savings metrics
- [ ] PDF export includes all new visuals
- [ ] Interactive elements work (hover, click)

## Files Created/Modified

### New Files
- `src/lib/reports/awardReportEnhancements.ts` - Core calculations and utilities
- `src/components/award/EnhancedSupplierTable.tsx` - Enhanced comparison table
- `src/components/award/WeightedScoringBreakdown.tsx` - Detailed scoring breakdown
- `src/components/award/CoverageBreakdownChart.tsx` - Pie chart and scope gaps
- `src/components/award/MethodologyFlowchart.tsx` - Visual process flowchart
- `src/components/award/EnhancedRecommendationsCard.tsx` - Enhanced recommendation cards

### To Be Modified
- `src/pages/AwardReport.tsx` - Integrate new components
- `src/lib/reports/modernPdfTemplate.ts` - Add enhanced visuals to PDF
- `supabase/functions/compute_award_report/index.ts` - Optional: Add more risk metrics

## Risk Score Clarification

**IMPORTANT**: The risk scoring has been clarified and standardized:

- **Raw Risk Score** (`rawRiskScore`): Count of missing items (0 = best, higher = worse)
- **Risk Mitigation Score** (`riskMitigationScore`): Display score (10 = best, 0 = worst)
- **Formula**: `riskMitigationScore = 10 - (rawRiskScore / maxRisk * 10)`

This ensures consistency across all displays and prevents confusion.

## Next Steps

1. **Integrate Components**: Add the new components to `src/pages/AwardReport.tsx`
2. **Update PDF Template**: Enhance `modernPdfTemplate.ts` with new visuals
3. **Add Tooltips**: Implement hover tooltips for interactive elements
4. **Testing**: Comprehensive testing with real project data
5. **Documentation**: Update user guides with new features

## Support

For questions or issues with the new components, refer to:
- Component source code (fully commented)
- Type definitions in `awardReportEnhancements.ts`
- This documentation file
