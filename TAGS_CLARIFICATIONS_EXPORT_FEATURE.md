# Tags & Clarifications Export Feature

## Overview

A complete Tags & Clarifications management and Excel export system for the Contract Manager module. This feature enables comprehensive tracking and communication of commercial tags, assumptions, risks, and clarifications between Main Contractors and Subcontractors.

---

## Features Implemented

### 1. Database Schema (`contract_tags_clarifications` table)

**Complete data model with 18 fields:**
- Auto-generated tag references (TAG-001, TAG-002, etc.)
- Tag types: Assumption, Clarification, Risk, Hold Point
- Origin tracking (MC vs Subcontractor)
- Resolution timing (Pre-let vs Post-contract)
- Subcontractor response fields (response, position, comment)
- Impact tracking (Cost & Programme)
- Main Contractor close-out fields
- Status workflow (Open → Agreed → To Pre-let → Closed)

**Security:**
- Row Level Security (RLS) enabled
- Organization-based access control
- All CRUD operations protected

**Auto-generated fields:**
- `tag_ref` auto-increments per project (TAG-001, TAG-002...)
- `created_date` defaults to current timestamp
- `updated_at` auto-updates on every change

---

### 2. Excel Export Functionality

**File Generation:**
- Library: `src/lib/export/tagsExcelExport.ts`
- Format: `.xlsx` (Microsoft Excel)
- Filename: `Tags_Clarifications_<ProjectName>_<ContractNo>_<YYYY-MM-DD>.xlsx`

**Excel Features:**
- **Formatted Headers:** Dark background with white text
- **Auto-filter:** Enabled on all columns
- **Freeze Panes:** Top row frozen for scrolling
- **Column Widths:** Optimized for readability
- **Highlighted Sections:** Subcontractor response columns (10-13) in light yellow

**Data Validation (Dropdown Lists):**
1. **Tag Type:** Assumption, Clarification, Risk, Hold Point
2. **Resolution Required At:** Pre-let, Post-contract
3. **Subcontractor Position:** Agree, Disagree, Amend, Clarification Required
4. **Cost Impact:** None, Potential, Confirmed, Variation Required
5. **Programme Impact:** None, Potential, Confirmed
6. **Status:** Open, Agreed, To Pre-let, Closed

---

### 3. User Interface

**Location:**
```
Contract Manager → Inclusions & Exclusions Tab
```

**Primary Export Button:**
- Positioned in page header (top-right)
- Blue styled, prominent placement
- Shows "Exporting..." state during generation
- Auto-disabled when no tags exist
- Tooltip: "No tags or clarifications to export" when disabled

**Tags & Clarifications Section:**
- Expandable/collapsible panel
- Shows count badge (e.g., "5 items")
- Table view with key fields:
  - Tag Ref (monospace font)
  - Type (color-coded badges)
  - Title
  - Status (color-coded)
  - Cost Impact (color-coded)

**Color Coding:**
- **Risk:** Red
- **Hold Point:** Orange
- **Assumption:** Blue
- **Clarification:** Grey
- **Cost Impact (High):** Red
- **Cost Impact (Medium):** Amber
- **Cost Impact (None):** Grey

**Secondary Export Button:**
- Positioned at bottom of Tags section
- Smaller, inline with guidance text
- Same functionality as primary button

**Empty State:**
- Icon + message when no tags exist
- Clear guidance: "Tags will appear here when created"

---

## Excel Output Structure

### Sheet 1: Tags & Clarifications

| Column | Field | Type | Source |
|--------|-------|------|--------|
| A | Main Contractor | Text | Project client name |
| B | Tag Ref | Text | TAG-001, TAG-002... |
| C | Tag Type ▼ | Dropdown | Assumption, Clarification, Risk, Hold Point |
| D | Title | Text | Short label |
| E | Description | Text | Full commercial statement |
| F | Linked Scope Ref | Text | Optional (INC-003, EXC-009) |
| G | Origin | Text | MC or Subcontractor |
| H | Created By | Text | User email |
| I | Created Date | Date | DD/MM/YYYY |
| J | Resolution Required At ▼ | Dropdown | Pre-let, Post-contract |
| **K** | **Subcontractor Response** | **Text** | **Editable (highlighted)** |
| **L** | **Subcontractor Position ▼** | **Dropdown** | **Agree, Disagree, Amend, Clarification Required** |
| **M** | **Subcontractor Comment** | **Text** | **Editable (highlighted)** |
| **N** | **Cost Impact ▼** | **Dropdown** | **None, Potential, Confirmed, Variation Required** |
| **O** | **Programme Impact ▼** | **Dropdown** | **None, Potential, Confirmed** |
| P | Main Contractor Response | Text | MC close-out notes |
| Q | Status ▼ | Dropdown | Open, Agreed, To Pre-let, Closed |
| R | Final Agreed Position | Text | Final resolution |

**Note:** Columns K-O (highlighted yellow) are intended for subcontractor completion.

---

## Usage Workflow

### For Main Contractors

1. **Navigate to Contract Manager**
   - Select project
   - Go to "Inclusions & Exclusions" tab

2. **Create Tags** (future feature - manual entry via database)
   - Currently: Insert via Supabase dashboard or SQL
   - Future: Add "Create Tag" button in UI

3. **Export to Excel**
   - Click "Export Tags & Clarifications (Excel)"
   - File downloads automatically
   - Send to subcontractor for review

4. **Review Responses**
   - Subcontractor fills columns K-O
   - MC receives completed Excel
   - Import responses (future feature)
   - Update status to "Agreed" or "Closed"

### For Subcontractors

1. **Receive Excel File**
   - From Main Contractor via email

2. **Review Each Tag**
   - Read Description (Column E)
   - Check Cost/Programme Impact

3. **Complete Response Columns (K-O)**
   - **K:** Write detailed response
   - **L:** Select position from dropdown
   - **M:** Add clarifying comments
   - **N:** Select cost impact from dropdown
   - **O:** Select programme impact from dropdown

4. **Return to Main Contractor**
   - Save Excel file
   - Email back to MC

---

## Permissions & Access Control

**Who can export:**
- Any authenticated user with access to the project
- Organization membership required (RLS enforced)
- Project must belong to user's organization

**Button States:**
- **Enabled:** When tags exist
- **Disabled:** When no tags exist (with tooltip)
- **Exporting:** Loading state during generation

**Data Privacy:**
- Only tags from current project are exported
- User emails fetched securely
- RLS ensures organization isolation

---

## Technical Implementation

### Files Created/Modified

1. **Database Migration:**
   - `supabase/migrations/[timestamp]_add_tags_clarifications_system.sql`
   - Table, indexes, RLS policies, triggers

2. **Export Library:**
   - `src/lib/export/tagsExcelExport.ts`
   - Excel generation logic
   - Data fetching and formatting

3. **UI Updates:**
   - `src/pages/ContractManager.tsx`
   - Added imports (FileSpreadsheet, MoreVertical, Tag icons)
   - Added state management
   - Added export handler
   - Added Tags & Clarifications UI section

### Dependencies

- `xlsx` (already in package.json)
- `@supabase/supabase-js` (already in package.json)
- `lucide-react` (already in package.json)

---

## Sample Data (for Testing)

```sql
-- Insert sample tags for testing
INSERT INTO contract_tags_clarifications (
  project_id,
  tag_ref,
  tag_type,
  title,
  description,
  origin,
  resolution_required_at,
  cost_impact,
  programme_impact,
  status
) VALUES
  (
    '<your-project-id>',
    'TAG-001',
    'Assumption',
    'Fire stopping materials included',
    'All fire stopping materials (intumescent sealant, fire pillows, collars) are included in our scope and pricing.',
    'MC',
    'Pre-let',
    'None',
    'None',
    'Open'
  ),
  (
    '<your-project-id>',
    'TAG-002',
    'Risk',
    'Access to ceiling void unclear',
    'Drawings indicate limited access to ceiling void. If scaffolding required beyond mobile towers, this will be a variation.',
    'MC',
    'Pre-let',
    'Potential',
    'Potential',
    'Open'
  ),
  (
    '<your-project-id>',
    'TAG-003',
    'Clarification',
    'Testing & commissioning responsibility',
    'Please confirm who is responsible for smoke testing and certification of all fire stopping works.',
    'MC',
    'Pre-let',
    'None',
    'None',
    'Open'
  );
```

---

## Future Enhancements

1. **Create Tag UI**
   - Add modal/form to create tags directly in UI
   - Avoid manual database entry

2. **Edit Tag UI**
   - Inline editing of existing tags
   - Delete functionality

3. **Import Responses**
   - Upload subcontractor's completed Excel
   - Parse and update database automatically

4. **Filtering & Search**
   - Filter by tag type, status, cost impact
   - Search by title or description

5. **Comments/Threads**
   - Conversation thread per tag
   - Timeline of changes

6. **Notifications**
   - Email alerts when tags created
   - Status change notifications

7. **PDF Export**
   - Alternative to Excel
   - Better for read-only distribution

8. **Pre-let Appendix Integration**
   - Auto-populate tags into Pre-let Minute Appendix
   - Link tags to specific inclusions/exclusions

---

## Testing Checklist

- [x] Database migration applies successfully
- [x] Table created with correct schema
- [x] RLS policies enforce organization access
- [x] Auto-generated tag_ref works (TAG-001, TAG-002...)
- [x] UI loads without errors
- [x] Export button appears in header
- [x] Export button disables when no tags
- [x] Tags section expands/collapses
- [x] Empty state displays correctly
- [x] Excel file generates successfully
- [x] Excel filename format correct
- [x] All 18 columns present in export
- [x] Data validation dropdowns work
- [x] Column widths appropriate
- [x] Headers formatted correctly
- [x] Subcontractor columns highlighted
- [x] Build succeeds without errors

---

## Support & Troubleshooting

**Export button not appearing:**
- Check user is authenticated
- Verify user has organization membership
- Check project belongs to user's organization

**Export fails:**
- Check browser console for errors
- Verify Supabase connection
- Ensure tags table has data
- Check RLS policies allow SELECT

**No tags showing in UI:**
- Insert sample data (see above)
- Check project_id matches current project
- Verify RLS policies allow access

**Excel file corrupted:**
- Check xlsx library version
- Try different browser
- Verify all tag data fields are valid

---

## Related Documentation

- [Contract Manager Overview](CONTRACT_MANAGER_REDESIGN_COMPLETE.md)
- [Subcontractor Onboarding](SUBCONTRACTOR_ONBOARDING_FEATURE.md)
- [Pre-let Appendix](AWARD_REPORT_ENHANCEMENTS.md)

---

## Feature Status

✅ **Complete & Production Ready**

All requirements implemented:
1. ✅ Database schema
2. ✅ Excel export functionality
3. ✅ Primary export button (header)
4. ✅ Secondary export button (section footer)
5. ✅ Tags & Clarifications UI
6. ✅ Data validation dropdowns
7. ✅ Column formatting & styling
8. ✅ Permissions & RLS
9. ✅ Empty state handling
10. ✅ Build verification

---

**Last Updated:** December 20, 2024
**Feature Version:** 1.0.0
**Status:** Production Ready
