# Quick Start: Integrating Enhanced Award Report

## Overview

You now have a fully enhanced Award Recommendation Report with:
- ✅ Professional visual analytics (pie charts, flowcharts, score breakdowns)
- ✅ Fixed risk scoring (0-10 where higher = better)
- ✅ Approval & Override system with full audit trail
- ✅ Excel export with approval history

## Files Ready to Use

### New Components (All Ready ✅)
- `src/components/ApprovalModal.tsx` - Approval modal
- `src/components/award/EnhancedSupplierTable.tsx` - Enhanced table
- `src/components/award/WeightedScoringBreakdown.tsx` - Score breakdown
- `src/components/award/CoverageBreakdownChart.tsx` - Pie charts
- `src/components/award/MethodologyFlowchart.tsx` - Visual flowchart
- `src/components/award/EnhancedRecommendationsCard.tsx` - Rec cards

### New Pages (Ready ✅)
- `src/pages/AwardReportEnhanced.tsx` - Complete integrated report

### Utilities (Ready ✅)
- `src/lib/reports/awardReportEnhancements.ts` - All calculations

### Database (Applied ✅)
- Migration `add_award_approvals_system` - Already applied

## Step 1: Update Your Routing

Find where you currently render `AwardReport` and replace it with `AwardReportEnhanced`.

### Example (React Router)

**BEFORE:**
```tsx
import AwardReport from './pages/AwardReport';

<Route path="/award-report/:projectId" element={
  <AwardReport
    projectId={projectId}
    onToast={showToast}
    onNavigate={navigate}
  />
} />
```

**AFTER:**
```tsx
import AwardReportEnhanced from './pages/AwardReportEnhanced';

<Route path="/award-report/:projectId" element={
  <AwardReportEnhanced
    projectId={projectId}
    organisationId={currentOrgId}  // REQUIRED: Add this
    onToast={showToast}
    onNavigate={navigate}
  />
} />
```

### Example (Direct Component)

**BEFORE:**
```tsx
import AwardReport from './pages/AwardReport';

<AwardReport
  projectId={selectedProject.id}
  reportId={reportId}
  onToast={handleToast}
  onNavigate={handleNavigate}
  dashboardMode="original"
/>
```

**AFTER:**
```tsx
import AwardReportEnhanced from './pages/AwardReportEnhanced';

<AwardReportEnhanced
  projectId={selectedProject.id}
  organisationId={selectedProject.organisation_id}  // REQUIRED
  reportId={reportId}
  onToast={handleToast}
  onNavigate={handleNavigate}
/>
```

## Step 2: Get Organisation ID

The enhanced report needs `organisationId` for approval tracking.

### Option A: From Project Data

```tsx
const { data: project } = await supabase
  .from('projects')
  .select('id, name, organisation_id')
  .eq('id', projectId)
  .single();

<AwardReportEnhanced
  projectId={projectId}
  organisationId={project.organisation_id}  // ← Here
  ...
/>
```

### Option B: From Context

```tsx
import { useOrganisation } from './lib/organisationContext';

function MyComponent() {
  const { currentOrganisation } = useOrganisation();

  return (
    <AwardReportEnhanced
      projectId={projectId}
      organisationId={currentOrganisation.id}  // ← Here
      ...
    />
  );
}
```

### Option C: From User Session

```tsx
const { data: membership } = await supabase
  .from('organisation_members')
  .select('organisation_id')
  .eq('user_id', user.id)
  .eq('status', 'active')
  .single();

<AwardReportEnhanced
  projectId={projectId}
  organisationId={membership.organisation_id}  // ← Here
  ...
/>
```

## Step 3: Test It Out

### Visual Enhancements (Should See Immediately)
1. Open any award report
2. You should see:
   - ✅ Colorful methodology flowchart (5 stages)
   - ✅ Enhanced supplier table with variance % and normalized price
   - ✅ Weighted scoring breakdown per supplier
   - ✅ Pie charts showing coverage by system category
   - ✅ Top 5 scope gaps with estimated costs
   - ✅ Enhanced recommendation cards with savings metrics

### Approval System (Test Flow)
1. Click **"Approve Award"** button (top right)
2. Modal opens showing:
   - AI recommendation summary
   - Dropdown to select final supplier
3. **Test Scenario A: Confirm AI Recommendation**
   - Keep AI's recommended supplier selected
   - Click "Approve Award"
   - See green banner: "Award Approved"
4. **Test Scenario B: Override AI Recommendation**
   - Select different supplier from dropdown
   - Yellow warning appears: "Override Justification Required"
   - Choose reason category (e.g., "Past Relationship")
   - Enter detailed explanation
   - Click "Approve Award"
   - See yellow banner: "Award Approved with Override"
5. **Test Excel Export**
   - Click "Export Excel"
   - Open file
   - Check "Approval Audit" sheet for approval data

## Step 4: Optional Customizations

### Custom Score Weights

```tsx
import { type ScoringWeights } from './lib/reports/awardReportEnhancements';

const customWeights: ScoringWeights = {
  price: 30,      // Less weight on price
  compliance: 35, // More weight on compliance
  coverage: 25,   // More weight on coverage
  risk: 10,       // Less weight on risk
};

// You'd need to modify AwardReportEnhanced to accept weights as a prop
```

### Custom Override Reasons

Edit `src/components/ApprovalModal.tsx`:

```tsx
const OVERRIDE_REASONS = [
  { value: 'past_relationship', label: 'Past Relationship' },
  { value: 'not_variation_hungry', label: 'Not Variation Hungry' },
  { value: 'proven_performance', label: 'Proven Performance' },
  { value: 'local_presence', label: 'Local Presence' },
  { value: 'schedule_certainty', label: 'Schedule Certainty' },
  { value: 'capacity_availability', label: 'Capacity & Availability' },
  // ADD YOUR CUSTOM REASONS HERE:
  { value: 'warranty_terms', label: 'Superior Warranty Terms' },
  { value: 'sustainability', label: 'Sustainability Credentials' },
  { value: 'other', label: 'Other' },
];
```

### Custom Close Score Threshold

By default, warns when top 2 scores are within 10 points. To change:

Edit `src/components/ApprovalModal.tsx`:

```tsx
// In useEffect:
const scoreDiff = sortedByScore[0].weightedTotal - sortedByScore[1].weightedTotal;
setShowCloseScoreWarning(scoreDiff <= 15);  // ← Change threshold here
```

Or edit the database function:

```sql
-- Default is 10, but you can change it
SELECT check_close_scores(top_score, second_score, 15);  -- 15 point threshold
```

## Troubleshooting

### "Build errors"
✅ Already tested - build succeeds with no TypeScript errors

### "organisationId is undefined"
❌ Most common issue - make sure you're passing organisationId prop:
```tsx
// Add this:
organisationId={project.organisation_id}  // or from context/session
```

### "Approve button not showing"
- Award may already be approved (check for approval banner)
- Check if user is authenticated
- Verify user is member of organisation

### "Components not rendering"
- Check browser console for errors
- Verify data loaded successfully (check `enhancedSuppliers` array)
- Ensure `awardSummary` is not null

### "Risk scores look wrong"
- This is fixed! Risk Mitigation Score = 10 - (normalized raw risk)
- Higher score = better (less risk)
- 10/10 = minimal risk, 0/10 = high risk

## What Stays the Same

✅ **No changes to**:
- Quote parsing
- Data normalization
- AI extraction engines
- Comparison logic
- Equalisation calculations
- Any other workflows

✅ **Only enhanced**:
- Report visualization
- Scoring transparency
- User approval workflow

## Quick Reference: Props

### AwardReportEnhanced Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `projectId` | string | ✅ Yes | Project UUID |
| `organisationId` | string | ✅ Yes | Organisation UUID (for approvals) |
| `reportId` | string | No | Specific report ID (optional) |
| `onToast` | function | No | Toast notification handler |
| `onNavigate` | function | No | Navigation handler |

## Next Steps

1. ✅ Replace `AwardReport` with `AwardReportEnhanced` in routing
2. ✅ Add `organisationId` prop
3. ✅ Test visual enhancements
4. ✅ Test approval flow (both confirm and override)
5. ✅ Test Excel export
6. ⏳ Add approval data to PDF export (see `APPROVAL_SYSTEM_COMPLETE.md`)
7. ⏳ Train users on new approval workflow

## Need Help?

Refer to complete documentation:
- `AWARD_REPORT_ENHANCEMENTS.md` - Visual enhancements details
- `APPROVAL_SYSTEM_COMPLETE.md` - Complete approval system guide
- `src/lib/reports/awardReportEnhancements.ts` - All calculation functions (fully commented)

## Summary

The enhanced award report is **ready to use**. Just:
1. Import `AwardReportEnhanced` instead of `AwardReport`
2. Add `organisationId` prop
3. Done! 🎉

All visual enhancements and approval functionality will work immediately.
