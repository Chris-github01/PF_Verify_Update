# Request Revisions Feature - Complete Implementation

## Overview

A comprehensive "Request Revisions" feature has been added to VerifyTrade, enabling post-analysis supplier negotiations in full compliance with NZ Government Procurement Rules (4th edition, Rule 40 - Post-tender clarifications).

## Compliance Framework

This feature is designed to maintain **fairness, transparency, and equity** throughout the revision request process:

- **Rule 40 Compliance**: Post-tender clarifications allowed for scope adjustments
- **Equal Treatment**: All suppliers with gaps receive similar opportunities
- **No Price Revelation**: Focus exclusively on scope completeness, not price negotiation
- **Audit Trail**: All revision requests logged with timestamps and details
- **Documented Process**: Every action tracked for compliance reporting

## Key Features

### 1. Database Schema

**New Tables:**
- `revision_requests` - Master table tracking all revision requests
  - Links to project and award report
  - Stores deadline, status, requesting user
  - Audit timestamps for compliance

- `revision_request_suppliers` - Individual supplier revision details
  - Quote-specific gap analysis
  - Generated email content
  - PDF generation status
  - Response tracking

**Security:**
- Row Level Security (RLS) enabled on all tables
- Organisation-based access control
- Platform admin oversight capabilities

### 2. Per-Supplier Gap Report Generator

**Location:** `src/lib/reports/supplierGapReport.ts`

**Features:**
- **Confidential Reports**: Each supplier only sees their own gaps
- **Professional HTML Format**: Print-to-PDF ready
- **Detailed Gap Analysis**:
  - System/category breakdown
  - Estimated impact statements
  - Specific items missing
- **Coverage Metrics**: Visual coverage percentage badges
- **Compliance Notice**: Built-in procurement rules reference
- **Branded**: Verify+ branding with orange accent

**Gap Report Sections:**
- Supplier & project metadata
- Coverage percentage (color-coded: green/yellow/red)
- Items quoted vs. total
- Detailed scope gaps listing
- Next steps guidance
- Deadline prominently displayed
- Procurement compliance notice

### 3. AI-Powered Email Generator

**Location:** `src/lib/revisions/emailGenerator.ts`

**Features:**
- **Intelligent Content**: Uses Claude/OpenAI to generate professional emails
- **Context-Aware**: Tailors message based on gap count and coverage
- **Compliant Language**: Automatically includes procurement rule references
- **Fallback System**: Built-in templates if AI unavailable
- **Customizable**: Supports sender name, position, company branding

**Email Template Elements:**
- Professional subject line
- Personalized greeting
- Thank you for submission
- Clear explanation of gaps (or high coverage acknowledgment)
- PDF attachment reference
- Revision deadline emphasis
- "Apples-to-apples" comparison focus
- Contact information for questions
- Compliance statement
- Professional sign-off

### 4. Revision Request Modal

**Location:** `src/components/RevisionRequestModal.tsx`

**Three-Step Workflow:**

#### Step 1: Select Suppliers & Set Deadline
- **Compliance Notice**: Blue banner explaining NZ procurement rules
- **Deadline Picker**: Calendar input with 7-day default (Rule 29 compliant)
- **Supplier Cards**:
  - Visual selection with checkboxes
  - Coverage percentage (color-coded)
  - Items quoted vs. total
  - Gap count display
  - Auto-selects suppliers with gaps > 0
- **Batch Actions**: Select All / Deselect All buttons

#### Step 2: Preview Emails & PDFs
- **Review Before Send**: See all emails before committing
- **Per-Supplier Preview**:
  - Supplier name and metrics
  - Email subject line
  - Full email body preview
  - Download PDF button for gap report
- **Edit Capability**: Back button to modify selection
- **Final Review**: Green confirmation banner

#### Step 3: Send Requests
- **Loading State**: Spinner with status message
- **Database Recording**: Saves all requests to database
- **Audit Trail**: Logs user, timestamp, all details
- **Success Notification**: Toast message confirmation

### 5. Integration Points

**Award Report Pages:**

Both `AwardReportEnhanced.tsx` and `AwardReportV2.tsx` now include:

- **"Request Revisions" Button**:
  - Located between "Recalculate" and "Approve Award"
  - Blue styling to distinguish from approval actions
  - Mail icon for clear identification

- **Modal Trigger**: Opens RevisionRequestModal with full context

- **Supplier Gap Data**:
  - Automatically calculates gaps from award summary
  - Extracts scope gap details from quote intelligence
  - Maps to modal-compatible format

## User Workflow

### From Award Report Page:

1. **Review Analysis**: Examine supplier comparison and gaps
2. **Click "Request Revisions"**: Blue button in header
3. **Select Suppliers**: Choose which suppliers need clarification
   - Pre-selected: All with gaps > 0
   - Optional: Include high-coverage suppliers for equity
4. **Set Deadline**: Pick date (default 7 days, adjustable)
5. **Preview**: Review AI-generated emails and downloadable PDFs
6. **Download PDFs**: Optional preview of gap reports
7. **Send Requests**: Confirm to save to database
8. **Success**: Requests logged for follow-up

### Post-Request:

- **Database Record**: All requests stored in `revision_requests` table
- **Audit Trail**: Queryable for compliance reporting
- **Email Content**: Saved for future reference
- **Status Tracking**: Can be updated as responses arrive

## Sample Output

### For Supplier "OF1" with 75% Coverage and 5 Gaps:

**Email Subject:**
```
Request for Clarification on Scope Gaps – December Test Project Quote
```

**Email Body:**
```
Dear OF1 Team,

Thank you for your submission on the December Test passive fire protection project. We appreciate the detail provided in your quote.

Upon review, our analysis has identified 5 potential scope gaps in your submission compared to the project baseline. These appear to be omissions rather than pricing decisions, and we're giving you an opportunity to review and provide a revised quote to ensure completeness.

Attached is a customized PDF report highlighting the specific items/systems that may have been missed. This is based solely on your quote and the project requirements – no information from other suppliers is included.

Please review the attached and submit any revisions addressing these gaps by December 26, 2025. Revisions should focus on adding missed items for an apples-to-apples comparison, without changes to existing pricing unless directly related to the gaps.

If you have questions, reply to this email. We aim for a fair and transparent procurement process in accordance with NZ Government Procurement Rules.

Best regards,
[Your Name]
Quantity Surveyor
VerifyTrade

Date: December 19, 2025
```

**PDF Report Includes:**
- Verify+ branded header
- "Confidential - For OF1 Only" notice
- Coverage: 75% (yellow badge)
- Items: 15 of 20 quoted
- Gap listing:
  - Fire Doors - Missing: 3 systems
  - Cavity Barriers - Incomplete specifications
  - etc.
- Next steps: 4-point action list
- Compliance footer

### For Supplier "OF2" with 100% Coverage:

**Email Emphasizes:**
- Strong alignment noted
- Opportunity to confirm/review
- Equity in process (all suppliers given chance)
- No pressure to change pricing

## Technical Implementation

### Database Relationships:

```
revision_requests (1) ←→ (many) revision_request_suppliers
        ↓
    projects
        ↓
    award_reports (optional)
```

### Security Model:

- **Authenticated Users**: Can view/create requests for their organisation's projects
- **Platform Admins**: Full visibility for audit/support
- **RLS Policies**: Enforce organisation boundaries
- **Function Security**: `SECURITY DEFINER` with `search_path = public`

### Type Safety:

All components use TypeScript interfaces:
- `SupplierGapData` - Supplier metrics and gaps
- `EmailGenerationParams` - AI email generation inputs
- `SupplierGapReportData` - PDF report data structure

## Future Enhancements (Not Implemented)

The current implementation **prepares** revision requests but does not:
1. Send actual emails (requires email service integration)
2. Track supplier responses
3. Manage revised quote uploads
4. Compare original vs. revised quotes

These features can be added by:
- Integrating with EmailJS or similar service
- Adding file upload for revised quotes
- Creating comparison views for before/after analysis
- Adding status updates (pending → sent → responded → expired)

## Procurement Compliance Notes

### What This Feature DOES:
✅ Provides equal opportunity for all suppliers to complete submissions
✅ Focuses on scope completeness (not price negotiation)
✅ Maintains confidentiality (suppliers don't see competitor info)
✅ Documents all communications for audit
✅ Aligns with Rule 40 (post-tender clarifications)
✅ Respects Rule 29 (sufficient time for responses)
✅ Supports Rule 4 (equity and transparency)

### What This Feature DOESN'T DO:
❌ Reveal other suppliers' pricing or strategies
❌ Enable price negotiations or "bid shopping"
❌ Favor any particular supplier
❌ Change the baseline project requirements
❌ Extend beyond clarifications to new procurement

## Testing the Feature

### In Award Report Page:

1. Navigate to any project with completed award report
2. Look for "Request Revisions" button (blue, between Recalculate and Approve)
3. Click to open modal
4. Verify:
   - Suppliers listed with correct coverage %
   - Gaps calculated accurately
   - Deadline defaults to 7 days from today
   - Preview shows appropriate emails
   - PDFs download correctly

### Database Verification:

```sql
-- Check revision requests
SELECT * FROM revision_requests WHERE project_id = 'your-project-id';

-- Check supplier-specific requests
SELECT * FROM revision_request_suppliers WHERE revision_request_id = 'request-id';
```

## Files Modified/Created

### New Files:
- `supabase/migrations/add_revision_request_system.sql` - Database schema
- `src/lib/reports/supplierGapReport.ts` - Gap report generator
- `src/lib/revisions/emailGenerator.ts` - AI email generator
- `src/components/RevisionRequestModal.tsx` - Main modal component

### Modified Files:
- `src/pages/AwardReportEnhanced.tsx` - Added button and modal
- `src/pages/AwardReportV2.tsx` - Added button and modal
- Build system updated with new dependencies

## Summary

This feature provides a **complete, compliant, and professional** solution for requesting quote revisions from suppliers. It:

- Maintains fairness through equal treatment
- Ensures transparency with full documentation
- Focuses on scope completeness, not prices
- Generates professional communications
- Creates audit-ready records
- Integrates seamlessly into existing workflow

The implementation is **production-ready** and awaiting only email service integration to become fully operational.
