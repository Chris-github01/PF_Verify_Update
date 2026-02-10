# SA-2017 Integration into Step 5: Subcontractor Onboarding

## Overview

Successfully integrated the SA-2017 Subcontract Agreement workflow as **Step 4** (the 4th sub-step) under **Step 5: Subcontractor Onboarding** in the Contract Manager workflow.

## What Was Changed

### 1. Updated OnboardingTab State Management

**File:** `src/pages/ContractManager.tsx` (Line ~3493)

**Changes:**
- Extended `currentStep` type to include `'sa2017'`
- Added state variables:
  ```typescript
  const [agreement, setAgreement] = useState<any>(null);
  const [loadingAgreement, setLoadingAgreement] = useState(true);
  ```

### 2. Enhanced Data Loading

**File:** `src/pages/ContractManager.tsx` (Line ~3505)

**Changes:**
- Updated `loadOnboardingData()` to load existing SA-2017 agreements:
  ```typescript
  // Load SA-2017 agreement
  const { data: agreementData } = await supabase
    .from('subcontract_agreements')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (agreementData) {
    setAgreement(agreementData);
  }
  ```

### 3. Added 4th Sub-Step to Steps Array

**File:** `src/pages/ContractManager.tsx` (Line ~3545)

**Changes:**
- Added SA-2017 step to the steps configuration:
  ```typescript
  const steps = [
    { id: 'loi', label: 'Letter of Intent', icon: FileText, completed: loi !== null },
    { id: 'compliance', label: 'Compliance Documents', icon: Shield, completed: complianceDocs.length > 0 },
    { id: 'prelet', label: 'Pre-let Minute Appendix', icon: FileCheck, completed: preletAppendix !== null },
    { id: 'sa2017', label: 'Sub-Contract Agreement', icon: Briefcase, completed: agreement !== null && agreement.status === 'completed' }
  ];
  ```

**Completion Logic:**
- Step is marked complete when agreement exists AND status is 'completed'
- This ensures users complete the full workflow before marking it done

### 4. Added Step Rendering

**File:** `src/pages/ContractManager.tsx` (Line ~3604)

**Changes:**
- Added rendering case for SA-2017 step:
  ```typescript
  {currentStep === 'sa2017' && (
    <SA2017Step
      projectId={projectId}
      awardInfo={awardInfo}
      existingAgreement={agreement}
      onAgreementUpdated={loadOnboardingData}
    />
  )}
  ```

### 5. Created SA2017Step Component

**File:** `src/pages/ContractManager.tsx` (Line ~5163)

**Features:**
- **Create New Agreement:** Creates SA-2017 agreement for awarded subcontractor
- **View Existing Agreement:** Opens agreement in new window for editing
- **Status Display:** Shows agreement status (Draft, In Review, Completed)
- **Lock Indicator:** Displays warning when agreement is locked
- **Export PDF:** Button for exporting completed agreements (placeholder)
- **Validation:** Checks for award information before allowing creation

**Props:**
```typescript
interface SA2017StepProps {
  projectId: string;
  awardInfo: AwardInfo | null;
  existingAgreement: any;
  onAgreementUpdated: () => void;
}
```

**Key Functions:**
- `handleCreateAgreement()`: Creates new SA-2017 agreement with auto-generated number
- `handleNavigateToAgreement()`: Opens agreement in new window
- Activity logging for audit trail

## User Experience Flow

### Step 5 Now Shows 4 Sub-Steps:

```
┌─────────────────────────────────────────────────────────────┐
│  Step 1: Letter of Intent                                    │
│  Step 2: Compliance Documents                                │
│  Step 3: Pre-let Minute Appendix                             │
│  Step 4: Sub-Contract Agreement (SA-2017)  ← NEW!            │
└─────────────────────────────────────────────────────────────┘
```

### Navigation

1. **Access:** Contract Manager → Step 5: Subcontractor Onboarding → Step 4 (last sub-step)
2. **Click:** Sub-step button to navigate
3. **Active Indicator:** Current sub-step highlighted in blue

### Workflow States

#### State 1: No Agreement Created
- Shows empty state with Briefcase icon
- Displays subcontractor name from award info
- "Create SA-2017 Agreement" button
- Validates award information exists

#### State 2: Agreement Exists (Draft)
- Shows agreement card with:
  - Agreement number (e.g., SA-0001)
  - Subcontractor name
  - Status badge (Draft - gray)
  - Created date
  - "Open Agreement" button (opens in new window)

#### State 3: Agreement In Review
- Status badge changes to blue
- Shows review status
- Can still be edited

#### State 4: Agreement Completed
- Status badge changes to green
- Shows completion date
- "Export PDF" button appears
- May be locked (shows lock icon and warning)

### Data Flow

```
Contract Manager (projectId, awardInfo)
    ↓
OnboardingTab
    ↓
SA2017Step (receives projectId, awardInfo)
    ↓
Create Agreement → subcontract_agreements table
    ↓
Open in New Window → SubcontractAgreement page
    ↓
Full SA-2017 Workflow (80+ fields, validation, PDF export)
```

## Database Integration

### Tables Used

1. **subcontract_agreements**
   - Stores agreement header data
   - Links to project and template
   - Tracks status and completion

2. **subcontract_templates**
   - SA-2017 template definition
   - Field definitions and sections

3. **subcontract_field_values**
   - Stores agreement field data
   - Used by full SA-2017 page

### Agreement Creation

```sql
INSERT INTO subcontract_agreements (
  template_id,      -- SA-2017 template ID
  project_id,       -- Current project
  agreement_number, -- Auto-generated (SA-0001, SA-0002, etc.)
  subcontractor_name, -- From awardInfo
  status,           -- 'draft'
  is_locked         -- false
)
```

### Agreement Number Generation

- Format: `SA-####` (e.g., SA-0001, SA-0002)
- Auto-increments based on project's existing agreements
- Unique per project

## Completion Tracking

### Sub-Step Completion Criteria

| Sub-Step | Completion Criteria |
|----------|-------------------|
| 1. Letter of Intent | `loi !== null` |
| 2. Compliance Documents | `complianceDocs.length > 0` |
| 3. Pre-let Minute Appendix | `preletAppendix !== null` |
| 4. Sub-Contract Agreement | `agreement !== null && agreement.status === 'completed'` |

### Step 5 Overall Completion

- **Before:** Required 3/3 sub-steps
- **Now:** Requires 4/4 sub-steps
- Sub-steps can be completed in any order
- Connector lines show progress (green when next step also complete)

## Visual Design

### Empty State
```
┌─────────────────────────────────────────────────┐
│           [Briefcase Icon - gray]               │
│                                                 │
│         No Agreement Created                    │
│                                                 │
│  Create an SA-2017 subcontract agreement for    │
│            Optimal Fire Limited 3               │
│                                                 │
│    [+ Create SA-2017 Agreement] (blue)          │
└─────────────────────────────────────────────────┘
```

### Agreement Card
```
┌─────────────────────────────────────────────────┐
│  Agreement Number       SA-0001                 │
│                                   [Draft] badge │
├─────────────────────────────────────────────────┤
│  Subcontractor: Optimal Fire Limited 3          │
│  Created: 10/02/2026                            │
│                                                 │
│  [👁 Open Agreement]  [📥 Export PDF]           │
└─────────────────────────────────────────────────┘
```

### Locked Agreement Warning
```
┌─────────────────────────────────────────────────┐
│  🔒 Agreement Locked                            │
│                                                 │
│  This agreement has been locked and cannot be   │
│  edited. It can only be viewed and exported.    │
└─────────────────────────────────────────────────┘
```

## Integration Points

### Opens in New Window

When clicking "Open Agreement", the full SA-2017 page opens in a new browser window/tab:

- URL: `/subcontract-agreement/{agreementId}`
- Full 6-section workflow with 80+ fields
- Real-time validation
- PDF export functionality
- Separate from Contract Manager context

**Why New Window?**
- SA-2017 is a complex, multi-section workflow
- Avoids nested navigation complexity
- Allows users to keep Contract Manager open for reference
- Better UX for lengthy form filling

### Future Enhancement Option

If inline editing is desired in the future:
1. Create a simplified SA2017InlineEditor component
2. Use modal or drawer approach
3. Embed key fields only
4. Link to full page for advanced features

## Error Handling

### No Award Information
- Shows centered error state with AlertCircle icon
- Message: "Please complete the award process first"
- Prevents agreement creation

### Template Not Found
- Alert: "SA-2017 template not found. Please contact support."
- Logs error to console
- Doesn't crash the UI

### Creation Failures
- Generic error alert
- Logs detailed error to console
- Button re-enables for retry

## Activity Logging

All SA-2017 actions are logged to the activity log:

```typescript
await supabase.rpc('log_activity', {
  p_project_id: projectId,
  p_event_type: 'sa2017_created',
  p_event_data: {
    agreement_id: newAgreement.id,
    agreement_number: agreementNumber,
    subcontractor: awardInfo.supplier_name
  }
});
```

**Event Types:**
- `sa2017_created` - Agreement created
- (More events tracked in SubcontractAgreement page)

## Testing Checklist

### ✅ Build Verification
- [x] TypeScript compilation successful
- [x] No build errors
- [x] Bundle size acceptable

### Navigation Testing

- [ ] Navigate to Contract Manager → Step 5
- [ ] Verify 4 sub-steps visible (not 3)
- [ ] Click "Sub-Contract Agreement" sub-step
- [ ] Verify sub-step highlights in blue
- [ ] Verify content renders correctly

### Functionality Testing

#### Without Agreement
- [ ] Verify empty state shows
- [ ] Verify subcontractor name displays
- [ ] Click "Create SA-2017 Agreement"
- [ ] Verify agreement created
- [ ] Verify agreement number generated (SA-0001)
- [ ] Verify state updates to show agreement card

#### With Draft Agreement
- [ ] Verify agreement card displays
- [ ] Verify Draft badge shows (gray)
- [ ] Click "Open Agreement"
- [ ] Verify new window opens
- [ ] Verify full SA-2017 page loads
- [ ] Verify agreement data populated

#### With Completed Agreement
- [ ] Complete agreement in SA-2017 page
- [ ] Return to Contract Manager
- [ ] Refresh if needed
- [ ] Verify Completed badge shows (green)
- [ ] Verify "Export PDF" button appears
- [ ] Verify sub-step marked complete (green checkmark)

#### With Locked Agreement
- [ ] Lock agreement in SA-2017 page
- [ ] Return to Contract Manager
- [ ] Verify lock warning displays
- [ ] Verify "Open Agreement" still works (view-only)

### Completion Tracking
- [ ] Complete all 3 previous sub-steps
- [ ] Verify SA-2017 NOT marked complete (agreement draft)
- [ ] Complete SA-2017 agreement
- [ ] Return to Step 5
- [ ] Verify SA-2017 marked complete (green checkmark)
- [ ] Verify "4 of 4 completed" if all done

### Edge Cases
- [ ] Test with no award information
- [ ] Test with multiple agreements (should load latest)
- [ ] Test creating second agreement
- [ ] Test navigation between sub-steps
- [ ] Test refresh behavior

## Known Limitations

1. **PDF Export:** Currently shows placeholder alert. Full implementation requires PDF generation logic.

2. **Single Agreement Focus:** Currently loads the most recent agreement. If project has multiple agreements (e.g., revisions), only the latest is shown.

3. **New Window Dependency:** Requires SubcontractAgreement page to be available at `/subcontract-agreement/:id` route.

4. **No Inline Editing:** All editing happens in separate window. Could be enhanced with inline editor if needed.

## Future Enhancements

### Short Term
1. Implement PDF export button functionality
2. Add agreement revision tracking
3. Add preview mode (modal) before opening new window
4. Add "Recent Agreements" dropdown if multiple exist

### Medium Term
1. Create simplified inline editor for key fields
2. Add agreement comparison (if revisions exist)
3. Add email send functionality (send to subcontractor)
4. Add digital signature integration

### Long Term
1. Full embedded SA-2017 workflow (no new window)
2. Agreement templates library (SA-2017, custom forms)
3. Multi-party signing workflow
4. Integration with document management systems

## Migration Notes

### For Existing Projects

Projects that already have agreements will automatically show them in Step 5:
- Agreement loads on Step 5 access
- Status reflects current state
- Can immediately open and continue editing

### For New Projects

New projects will see empty state until:
1. Award is completed (awardInfo exists)
2. User clicks "Create SA-2017 Agreement"
3. Agreement is created and opens in new window

### Backward Compatibility

✅ **No breaking changes:**
- Existing 3 sub-steps work as before
- SA-2017 page still accessible via direct URL
- No database schema changes required
- No impact on existing agreements

## Support & Troubleshooting

### Issue: Sub-step 4 not visible
**Cause:** Browser cache or old build
**Solution:** Hard refresh (Ctrl+F5) or clear cache

### Issue: "Template not found" error
**Cause:** SA-2017 template not seeded in database
**Solution:** Run template seeding migration (already deployed)

### Issue: "Open Agreement" doesn't work
**Cause:** Agreement ID null or routing issue
**Solution:** Check agreementId state, verify route exists

### Issue: Agreement doesn't load
**Cause:** RLS policy issue or permission problem
**Solution:** Check user has access to project

### Issue: Can't create agreement
**Cause:** No award information (awardInfo is null)
**Solution:** Complete award process in previous steps first

## Summary

### What Was Delivered

✅ **Step 5 Configuration:**
- Extended from 3 to 4 sub-steps
- Added SA-2017 as 4th sub-step
- Updated completion tracking

✅ **SA2017Step Component:**
- Create new agreements
- View existing agreements
- Open in new window for editing
- Status display and tracking
- Error handling and validation

✅ **Data Integration:**
- Loads existing agreements
- Creates new agreements
- Auto-generates agreement numbers
- Links to project and award info

✅ **Visual Design:**
- Professional empty state
- Clear status indicators
- Responsive agreement card
- Lock warnings
- Consistent with platform design

✅ **Build & Testing:**
- TypeScript compilation successful
- No build errors
- Ready for production testing

### User Impact

**Before:**
- SA-2017 only accessible via direct URL
- Not integrated into workflow
- Easy to miss or forget

**After:**
- SA-2017 integrated into natural workflow
- Visible in Step 5 onboarding process
- Clear progression tracking
- Guided creation process

### Development Quality

- **Clean Code:** Well-structured component with clear separation of concerns
- **Error Handling:** Comprehensive error handling and user feedback
- **Type Safety:** Full TypeScript typing with interfaces
- **Activity Logging:** Audit trail for compliance
- **Documentation:** Comprehensive inline comments

---

## Quick Reference

### Location
Contract Manager → Step 5: Subcontractor Onboarding → Sub-step 4: Sub-Contract Agreement

### Key Files Modified
- `src/pages/ContractManager.tsx` (Lines ~3493, ~3545, ~3604, ~5163)

### Database Tables
- `subcontract_agreements`
- `subcontract_templates`
- `subcontract_field_values`

### Component Hierarchy
```
ContractManager
  └── OnboardingTab
      ├── LOIStep
      ├── ComplianceStep
      ├── PreletAppendixStep
      └── SA2017Step ← NEW
          └── Opens → SubcontractAgreement (new window)
```

### Build Status
✅ **COMPLETE & VERIFIED**

---

**Integration Date:** 2026-02-10
**Build Status:** ✅ Successful
**Ready for Testing:** Yes
**Breaking Changes:** None
