# Contract Summary - Auto-populate Organisation and User Details

## Overview
Enhanced the Contract Manager's Contract Summary to automatically pull through organisation name, project details, and user information from the database, eliminating manual data entry and ensuring consistency.

## Changes Made

### 1. Extended Data Loading

**Updated ProjectInfo interface:**
```typescript
interface ProjectInfo {
  id: string;
  name: string;
  client: string | null;
  updated_at: string;
  organisation_id?: string;    // NEW
  created_by?: string;         // NEW
}
```

**Enhanced project data fetching:**
- Now retrieves `organisation_id` and `created_by` fields from projects table
- These fields enable lookup of organisation and user details

### 2. Organisation Name Integration

**New functionality:**
- Queries `organisations` table using `organisation_id`
- Retrieves organisation name
- Automatically sets as "Main Contractor" if not already configured
- Saves organisation name to project's `main_contractor_name` field on first load

**Example:**
```
Organisation: "Summit Construction Group Ltd"
→ Main Contractor field auto-populated with "Summit Construction Group Ltd"
```

### 3. Project Manager Details

**New feature - displays user who created the project:**
- Uses `get_user_details` RPC function to fetch user information
- Shows user's name and email address
- Displayed in new "Project Manager" section

**Data displayed:**
- **Name:** User's display name or email prefix if name not available
- **Email:** User's email address (e.g., sarah@summitbuilders.co.nz)

### 4. Project Name Display

**New section added:**
- Project name now prominently displayed in Contract Summary
- Pulled from `projects.name` field
- Shows in dedicated card for easy visibility

### 5. Updated Contract Summary Layout

**New grid structure (2 columns):**

**Row 1:**
- Subcontractor (from approved quote)
- Subcontract Sum (total amount)

**Row 2:**
- Main Contractor (auto-populated from organisation)
- Client / End User (from project.client)

**Row 3:**
- Payment Terms (editable)
- Liquidated Damages (editable)

**Row 4:** (NEW)
- Project Name (from project)
- Project Manager (user name + email)

Followed by Financial Breakdown section.

## Data Flow

### Organisation → Main Contractor

1. **Load project data** → Get `organisation_id`
2. **Query organisations table** → Fetch organisation name
3. **Check main_contractor_name** in project
   - If empty → Set to organisation name
   - If exists → Use existing value
4. **Auto-save to database** → Update `main_contractor_name` if was empty
5. **Display in UI** → Show in Main Contractor field (editable)

### User → Project Manager

1. **Load project data** → Get `created_by` (user UUID)
2. **Call get_user_details RPC** → Fetch user information
3. **Extract details:**
   - `display_name` or email prefix → Name
   - `email` → Email address
4. **Display in UI** → Show in Project Manager section

### Project → Project Name

1. **Load project data** → Get `name` field
2. **Display in UI** → Show in Project Name section

## Benefits

### 1. Eliminates Manual Entry
- Organisation name automatically fills Main Contractor field
- No need to type company name repeatedly
- Consistent naming across all projects

### 2. Accurate User Attribution
- Shows who created/manages each project
- Provides contact information for project queries
- Improves accountability and communication

### 3. Complete Project Context
- All key information visible at a glance
- Project name, organisation, client, and manager in one view
- Professional presentation for handover documents

### 4. Data Consistency
- Uses authoritative source (organisations table)
- Prevents typos and variations in company name
- Maintains data integrity across platform

## User Interface

### Main Contractor Field
- **Default value:** Organisation name (auto-populated)
- **Editable:** Yes (can override if needed)
- **Saved to:** `projects.main_contractor_name`
- **Visual:** White text, edit icon on hover

### Project Name Section
- **Label:** "PROJECT NAME"
- **Display:** Project name in large white text
- **Read-only:** Yes
- **Source:** `projects.name`

### Project Manager Section
- **Label:** "PROJECT MANAGER"
- **Display:**
  - Name in large white text
  - Email in smaller gray text below
- **Read-only:** Yes
- **Source:** `auth.users` via `get_user_details` function

## Example Display

```
┌─────────────────────────────────┐  ┌─────────────────────────────────┐
│ SUBCONTRACTOR                   │  │ SUBCONTRACT SUM                 │
│ FireSafe                        │  │ $1,607,505.60                   │
└─────────────────────────────────┘  └─────────────────────────────────┘

┌─────────────────────────────────┐  ┌─────────────────────────────────┐
│ MAIN CONTRACTOR            [✏]  │  │ CLIENT / END USER               │
│ Summit Construction Group Ltd   │  │ Harbour Development Ltd.        │
└─────────────────────────────────┘  └─────────────────────────────────┘

┌─────────────────────────────────┐  ┌─────────────────────────────────┐
│ PAYMENT TERMS              [✏]  │  │ LIQUIDATED DAMAGES         [✏]  │
│ 20th following month, 22 days   │  │ None specified                  │
└─────────────────────────────────┘  └─────────────────────────────────┘

┌─────────────────────────────────┐  ┌─────────────────────────────────┐
│ PROJECT NAME                    │  │ PROJECT MANAGER                 │
│ Harbour Tower Commercial        │  │ Sarah Mitchell                  │
│ Fit-Out                         │  │ sarah@summitbuilders.co.nz      │
└─────────────────────────────────┘  └─────────────────────────────────┘
```

## Technical Implementation

### 1. ContractSummaryTab Component

**New state variables:**
```typescript
const [organisationName, setOrganisationName] = useState<string>('');
const [projectManager, setProjectManager] = useState<{
  name: string;
  email: string;
} | null>(null);
```

**New functions:**
```typescript
loadOrganisationDetails() // Fetches org name
loadProjectManagerDetails() // Fetches user details
```

**Load sequence:**
```typescript
useEffect(() => {
  const loadAllDetails = async () => {
    await loadOrganisationDetails();      // 1. Get org name
    await loadProjectManagerDetails();     // 2. Get user details
    await loadContractSettings();          // 3. Load/save main contractor
  };
  loadAllDetails();
}, [projectInfo?.id, organisationId, projectInfo?.created_by]);
```

### 2. Auto-save Main Contractor

```typescript
// In loadContractSettings()
if (!data.main_contractor_name && organisationName) {
  await supabase
    .from('projects')
    .update({ main_contractor_name: organisationName })
    .eq('id', projectInfo.id);
}
```

This ensures the organisation name is persisted as the main contractor name on first load.

### 3. User Details Lookup

Uses existing `get_user_details` RPC function:
```typescript
const { data, error } = await supabase.rpc('get_user_details', {
  target_user_id: projectInfo.created_by
});
```

Returns user information including:
- `display_name` or derived from email
- `email` address

## Database Schema

### projects table
```sql
-- Existing fields used:
id uuid PRIMARY KEY
name text NOT NULL
client text
organisation_id uuid REFERENCES organisations(id)
created_by uuid REFERENCES auth.users(id)
main_contractor_name text  -- Now auto-populated with org name

-- Fields updated/created:
retention_percentage numeric
payment_terms text
liquidated_damages text
```

### organisations table
```sql
id uuid PRIMARY KEY
name text NOT NULL  -- Used for Main Contractor
```

### auth.users table
```sql
id uuid PRIMARY KEY
email text
-- Accessed via get_user_details() function
```

## Testing Checklist

Verify the following scenarios:

- [ ] Organisation name auto-populates Main Contractor field
- [ ] Main Contractor can still be manually edited if needed
- [ ] Project name displays correctly
- [ ] Project manager name and email display correctly
- [ ] Works for projects with different organisations
- [ ] Works for projects created by different users
- [ ] Handles missing data gracefully (shows "TBC" or "Loading...")
- [ ] Main Contractor saves to database after auto-population
- [ ] Subsequent loads show saved Main Contractor value

## Future Enhancements

Potential improvements:
1. Add project manager editing capability
2. Support for multiple project managers/contacts
3. Add project manager role/title field
4. Show organisation logo in summary
5. Add project start/end dates
6. Include project reference number
7. Show organisation contact details
8. Add project status indicator

## Migration Notes

### For Existing Projects
- Will auto-populate Main Contractor on first load of Contract Summary
- No data loss - existing main_contractor_name values preserved
- Empty main_contractor_name fields will be filled with organisation name

### For New Projects
- Main Contractor automatically set from organisation
- Project Manager automatically captured from creator
- All fields ready for immediate use

## Benefits Summary

**For Users:**
- ✅ Faster contract setup
- ✅ Consistent company naming
- ✅ Clear project attribution
- ✅ Professional appearance
- ✅ Reduced errors

**For System:**
- ✅ Data consistency
- ✅ Audit trail (project creator)
- ✅ Better reporting capabilities
- ✅ Integration-ready data

**For Compliance:**
- ✅ Clear responsibility assignment
- ✅ Contact information readily available
- ✅ Accurate company information
- ✅ Traceable project history
