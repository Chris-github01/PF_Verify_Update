# Where to Find the "Request Revisions" Feature

## Location

The **Request Revisions** button is located on the **Award Report** page in the **top action bar**.

### Navigation Path:
1. Select a Project
2. Go to **Reports** tab
3. View your Award Report
4. Look at the **top right action bar**

### Button Layout (Top Action Bar):

```
┌─────────────────────────────────────────────────────────────────────┐
│  [ Recalculate ]  [ Request Revisions ]  [ Approve Award ]  [ ⬇ Export Report ]  │
└─────────────────────────────────────────────────────────────────────┘
```

The buttons appear in this order:
1. **Recalculate** - Gray border button with refresh icon
2. **Request Revisions** - 🔵 **BLUE button with mail icon** ← THIS IS IT!
3. **Approve Award** - Orange gradient button with checkmark
4. **Export Report** - Blue gradient dropdown with download icon

## Visual Details

**Request Revisions Button:**
- **Color**: Blue border with blue background (bg-blue-900/30)
- **Icon**: 📧 Mail/envelope icon
- **Text**: "Request Revisions"
- **Position**: Top right of the page, second button from left
- **Style**: Medium prominence with blue accent

## What It Does

When you click "Request Revisions":

1. **Opens Modal** showing all suppliers with scope gaps
2. **Auto-selects** suppliers that have missing items (gaps > 0)
3. **Shows Gap Details**:
   - Coverage percentage
   - Number of items quoted vs total items
   - Number of scope gaps
   - System-by-system breakdown

4. **Generate Emails**:
   - Professional email template for each supplier
   - Lists their specific scope gaps
   - Requests pricing for missing items
   - Asks for final best price
   - Includes PDF attachment option

5. **Set Deadline**: Choose when revisions are due (default: 7 days)

6. **Email Preview**: Review emails before sending

7. **Send & Track**: Emails sent and tracked in database

## Feature Components

### Database Tables:
- `revision_requests` - Master tracking table
- `revision_request_suppliers` - Per-supplier details

### Modal Workflow:
1. **Step 1: Select Suppliers** - Choose which suppliers to contact
2. **Step 2: Preview Emails** - Review generated content
3. **Step 3: Send** - Dispatch emails and log requests

### Generated Content:
- **Subject**: "Revision Request - [Project Name] - Scope Clarification Required"
- **Body**: Professional NZ procurement-compliant email
- **Attachment**: Optional PDF gap report for each supplier

## Compliance Features

✅ **NZ Government Procurement Rules (Rule 40) Compliant**
- Post-tender clarifications allowed
- Equal treatment of all suppliers
- Focus on scope completeness, not price negotiation
- Full audit trail maintained

## Why You Might Not See It

**Possible reasons:**

1. **Wrong Page**: Make sure you're on the **Award Report** page, not:
   - Project Dashboard
   - Scope Matrix
   - Quote Intelligence
   - Other report types

2. **No Report Generated**: The button only appears after generating an award report
   - Go to Reports tab
   - Click "Generate Award Report" if needed

3. **Viewing Older Version**: You might be looking at:
   - `AwardReport.tsx` (original, doesn't have the button)
   - Should be viewing `AwardReportEnhanced.tsx` (has the feature)

4. **Screen Size**: On smaller screens, buttons might wrap or overflow
   - Try scrolling right in the action bar
   - Check if buttons are hidden behind overflow menu

5. **Browser Cache**: Clear browser cache and hard refresh:
   - Windows/Linux: `Ctrl + Shift + R`
   - Mac: `Cmd + Shift + R`

## How to Access the Feature

### Quick Steps:
```
1. Open a project with imported quotes
2. Navigate to: Reports tab
3. Ensure Award Report is generated
4. Look at top-right action bar
5. Click the BLUE "Request Revisions" button
```

### Visual Cue:
Look for the **blue button with a mail icon (📧)** between the gray "Recalculate" and orange "Approve Award" buttons.

## Screenshot Location Reference

**Top Action Bar Section:**
```html
<div className="flex items-center justify-end">
  <div className="flex items-center gap-3">

    <!-- RECALCULATE BUTTON -->
    <button className="...border-slate-600...">
      Recalculate
    </button>

    <!-- REQUEST REVISIONS BUTTON (THIS ONE!) -->
    <button className="...border-blue-600 bg-blue-900/30 text-blue-300...">
      <Mail icon />
      Request Revisions
    </button>

    <!-- APPROVE AWARD BUTTON -->
    <button className="...bg-orange-600...">
      Approve Award
    </button>

    <!-- EXPORT DROPDOWN -->
    <button>Export Report</button>

  </div>
</div>
```

## Related Files

- **Modal Component**: `src/components/RevisionRequestModal.tsx`
- **Page Implementation**: `src/pages/AwardReportEnhanced.tsx` (line 576-582)
- **Email Generator**: `src/lib/revisions/emailGenerator.ts`
- **Gap Report**: `src/lib/reports/supplierGapReport.ts`
- **Documentation**: `REVISION_REQUEST_FEATURE.md`

## Testing the Feature

To test if the feature is working:

1. **Go to Award Report page**
2. **Look for the blue "Request Revisions" button**
3. **Click it** - Modal should open
4. **Verify**: You should see a modal titled "Request Quote Revisions"

If the button is missing:
- Check browser console for errors (F12)
- Verify you're on the correct page
- Check if `showRevisionModal` state exists
- Ensure `RevisionRequestModal` component is imported

## Support

If you still can't find the button:
1. Take a screenshot of your Award Report page
2. Check browser console for any errors
3. Verify the page URL matches: `/reports` tab
4. Ensure you have the latest code deployed

The feature is fully implemented and should be visible on all Award Report pages generated through the standard workflow.
