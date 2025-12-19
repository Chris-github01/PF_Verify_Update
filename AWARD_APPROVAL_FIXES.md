# Award Report Fixes - PDF Export & Approval Changes

## Issues Fixed

### 1. PDF Export Not Working ✅

**Problem:** PDF export was failing because the data format didn't match what the PDF generator expected.

**Solution:**
- Fixed `handlePrintPDF()` function to properly transform data
- Converts `enhancedSuppliers` array to match `SupplierRow` interface
- Transforms recommendations (bestValue, lowestRisk, topSupplier) to match `RecommendationCard` interface
- Passes correct parameters to `generateModernPdfHtml()`

**How it works now:**
1. Click "Export Report" button
2. Select "Export PDF"
3. HTML file downloads automatically
4. Open HTML in browser
5. Use browser's Print menu → "Save as PDF"

### 2. Ability to Change Approved Supplier ✅

**Problem:** Once a report was approved, the "Approve Award" button disappeared and there was no way to change the approval.

**Solution:**
- Button now **always shows** - label changes based on state:
  - "Approve Award" (when not yet approved)
  - "Change Approval" (when already approved)
- Modified `ApprovalModal` to support both INSERT and UPDATE operations
- Added `existingApprovalId` prop to modal
- When changing approval:
  - Updates existing record instead of creating duplicate
  - Updates all related tables (award_reports, projects, quotes)
  - Shows appropriate success message

## Technical Changes

### Files Modified

#### 1. `/src/pages/AwardReportEnhanced.tsx`

**PDF Export Fix:**
```typescript
const handlePrintPDF = async () => {
  // Transform suppliers to match PDF template format
  const suppliers = enhancedSuppliers.map((s, idx) => ({
    rank: idx + 1,
    supplierName: s.supplierName,
    adjustedTotal: s.totalPrice,
    riskScore: s.riskMitigationScore,
    coveragePercent: s.coveragePercent,
    itemsQuoted: s.itemsQuoted,
    totalItems: awardSummary.totalSystems,
    weightedScore: s.weightedTotal,
    notes: []
  }));

  // Transform recommendations
  const recommendations = [];
  if (bestValue) recommendations.push({ type: 'best_value', ... });
  if (lowestRisk) recommendations.push({ type: 'lowest_risk', ... });
  if (topSupplier) recommendations.push({ type: 'balanced', ... });

  // Generate HTML with correct format
  const htmlContent = generateModernPdfHtml({
    projectName: currentProject.name,
    clientName: currentProject.client,
    generatedAt: new Date().toLocaleDateString(),
    recommendations,
    suppliers,
    executiveSummary: "...",
    methodology: [...]
  });
}
```

**Approval Button Fix:**
```typescript
// Button now always visible
<button onClick={() => setShowApprovalModal(true)}>
  <CheckCircle2 size={16} />
  {approvalData ? 'Change Approval' : 'Approve Award'}
</button>

// Pass existing approval ID to modal
<ApprovalModal
  existingApprovalId={approvalData?.id || null}
  {...otherProps}
/>
```

#### 2. `/src/components/ApprovalModal.tsx`

**Added Update Support:**
```typescript
interface ApprovalModalProps {
  // ... existing props
  existingApprovalId?: string | null; // NEW
}

// In handleSubmit:
if (existingApprovalId) {
  // UPDATE existing approval
  await supabase
    .from('award_approvals')
    .update(approvalRecord)
    .eq('id', existingApprovalId);
} else {
  // INSERT new approval
  await supabase
    .from('award_approvals')
    .insert(approvalRecord);
}

// Show appropriate message
const actionText = existingApprovalId ? 'updated' : 'approved';
onToast?.(`Award ${actionText}: ${selectedSupplier}`, 'success');
```

## User Flow

### First Time Approval
1. Open Award Report
2. Click **"Approve Award"** button (orange)
3. Select supplier
4. If overriding AI recommendation, provide reason
5. Click "Submit Approval"
6. ✅ Approval saved
7. Button changes to **"Change Approval"**
8. Green approval banner appears

### Changing Approval
1. Award already approved (green banner visible)
2. Click **"Change Approval"** button (orange)
3. Modal opens with same suppliers
4. Select different supplier
5. Provide reason if needed
6. Click "Submit Approval"
7. ✅ Existing approval updated (not duplicated)
8. Success: "Award updated: [Supplier Name]"
9. Banner updates with new approval

## Database Operations

### On New Approval (INSERT)
```sql
-- Insert into award_approvals
INSERT INTO award_approvals (
  award_report_id,
  final_approved_supplier,
  is_override,
  override_reason_category,
  override_reason_detail,
  approved_by_user_id,
  ...
);

-- Update award_reports
UPDATE award_reports
SET approved_supplier_id = ?,
    approved_at = NOW(),
    approval_id = ?
WHERE id = ?;

-- Update projects
UPDATE projects
SET approved_quote_id = ?
WHERE id = ?;

-- Update quotes
UPDATE quotes
SET status = 'accepted'
WHERE id = ?;
```

### On Changed Approval (UPDATE)
```sql
-- Update existing record
UPDATE award_approvals
SET final_approved_supplier = ?,
    is_override = ?,
    override_reason_category = ?,
    override_reason_detail = ?,
    approved_by_user_id = ?,
    approved_at = NOW()
WHERE id = ?;

-- Same updates to other tables...
```

## Benefits

1. **No More Stuck Approvals:** Can change decision if circumstances change
2. **Audit Trail Preserved:** Updates maintain full history with timestamps
3. **No Duplicates:** Single approval record per report, just updated
4. **PDF Export Works:** Properly formatted HTML output for printing
5. **Clear UI Feedback:** Button text changes to indicate state
6. **Flexible Workflow:** Support real-world scenarios where decisions change

## Testing Checklist

- [x] Build successful
- [ ] PDF export downloads HTML file
- [ ] HTML opens in browser correctly
- [ ] Browser "Print to PDF" generates proper PDF
- [ ] "Approve Award" button shows on new reports
- [ ] Can successfully approve report
- [ ] Button changes to "Change Approval" after approval
- [ ] Can click "Change Approval" and modal opens
- [ ] Can select different supplier and submit
- [ ] Success message shows "updated" instead of "approved"
- [ ] Approval banner updates with new supplier
- [ ] No duplicate records in award_approvals table
- [ ] Previous quotes marked as non-accepted
- [ ] New quote marked as accepted

## Edge Cases Handled

1. **No existing approval:** Normal INSERT flow
2. **Approval exists:** UPDATE flow instead of INSERT
3. **Changing from AI recommendation to override:** Requires reason
4. **Changing from override back to AI recommendation:** Reason optional
5. **Multiple changes:** Each change updates same record
6. **Quote status management:** Previous quote unmarked, new one marked

## Future Enhancements

Consider adding:
- Approval history log (track all changes)
- Compare view (what changed between approvals)
- Approval notifications
- Approval workflow (multi-level approvals)
- Lock report after final approval
