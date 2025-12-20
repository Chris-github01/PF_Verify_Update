# Contract Manager - Supplier Contact Details Fix

## Overview
Enhanced the Contract Manager to properly pull through all supplier and contact information from the organization's supplier database, ensuring complete contact details are available for Letter of Intent generation and subcontractor onboarding.

## Changes Made

### 1. Database Migration
**Applied migration:** `add_supplier_contact_details`

Added new fields to support complete contact information:

**letters_of_intent table:**
- `supplier_phone` (text) - Contact phone number
- `supplier_address` (text) - Supplier address

**suppliers table:**
- `contact_name` (text) - Primary contact person name

### 2. Enhanced Data Loading (ContractManager.tsx)

**Updated AwardInfo interface** to include:
```typescript
interface AwardInfo {
  supplier_name: string;
  total_amount: number;
  awarded_date?: string;
  supplier_contact?: string | null;      // NEW
  supplier_email?: string | null;         // NEW
  supplier_phone?: string | null;         // NEW
  supplier_address?: string | null;       // NEW
}
```

**Improved supplier data lookup:**
- Now queries the `suppliers` table to find matching supplier by name
- Retrieves: `contact_name`, `contact_email`, `contact_phone`, `address`, `notes`
- Falls back to extracting contact name from notes field if not in `contact_name`
- All retrieved data is stored in `awardInfo` state

### 3. Letter of Intent Updates

**Updated LetterOfIntent interface:**
```typescript
interface LetterOfIntent {
  // ... existing fields
  supplier_phone?: string | null;
  supplier_address?: string | null;
}
```

**Enhanced form with all contact fields:**
- Contact Person (pre-filled from supplier database)
- Email Address (pre-filled from supplier database)
- Phone Number (pre-filled from supplier database)
- Supplier Address (pre-filled from supplier database)

**Form auto-population:**
- Added `useEffect` hook to automatically populate form fields when `awardInfo` loads
- Fields update when supplier data is retrieved from database
- Only updates if no existing LOI exists

### 4. Display Enhancements

**Form inputs:**
- Added Phone Number input field
- Added Supplier Address input field
- Updated Contact Person placeholder to include role example
- All fields save to database on LOI generation

**Existing LOI display:**
Now shows complete contact information grid:
```
┌─────────────────┬─────────────────────┐
│ Supplier        │ Contact Person      │
│ ProShield Sys   │ John Smith          │
├─────────────────┼─────────────────────┤
│ Email           │ Phone               │
│ john@ps.com     │ +61 400 000 000     │
└─────────────────┴─────────────────────┘

┌─────────────────────────────────────────┐
│ Address                                  │
│ 123 Main St, Sydney NSW 2000            │
└─────────────────────────────────────────┘

┌─────────────────┬─────────────────────┐
│ Target Start    │ Target Completion   │
│ 2/1/2025        │ 6/30/2025           │
└─────────────────┴─────────────────────┘
```

### 5. PDF Generation

**Updated LOI PDF template** to include all contact details:
```html
To: ProShield Systems
123 Main St, Sydney NSW 2000
Attention: John Smith - Operations Manager
Email: john@proshield.com
Phone: +61 400 000 000
```

**PDF displays in order:**
1. Supplier name (header)
2. Address (if available)
3. Attention: Contact person (if available)
4. Email (if available)
5. Phone (if available)

### 6. Database Insert

Updated the LOI creation to save all fields:
```typescript
await supabase.from('letters_of_intent').insert({
  project_id,
  supplier_name,
  supplier_contact,
  supplier_email,
  supplier_phone,        // NEW
  supplier_address,      // NEW
  scope_summary,
  service_types,
  // ... other fields
});
```

## Data Flow

### From Supplier Database → LOI Form

1. **Project has approved quote** → System identifies supplier name
2. **Lookup in suppliers table** → Query by organisation_id and supplier name
3. **Extract contact details:**
   - `contact_name` → Contact Person field
   - `contact_email` → Email field
   - `contact_phone` → Phone field
   - `address` → Address field
4. **Auto-populate form** → Fields pre-filled when user opens LOI step
5. **User can edit** → All fields remain editable
6. **Save to letters_of_intent** → Complete data persisted

### Fallback Strategy

If supplier not found in suppliers table:
- Fields remain empty
- User can manually enter information
- No errors thrown
- System gracefully handles missing data

## Benefits

1. **Reduces manual data entry** - Contact details auto-populate from supplier database
2. **Improves accuracy** - Uses existing verified supplier information
3. **Complete documentation** - PDFs include all necessary contact details
4. **Professional appearance** - LOIs have properly formatted addresses and contact info
5. **Better compliance** - Ensures all required contact information is captured

## Usage Instructions

### For Users

1. **Navigate to Contract Manager** → Subcontractor Onboarding tab
2. **Generate Letter of Intent** → Contact fields auto-populate if supplier exists in database
3. **Review and edit** → Verify/update contact information as needed
4. **Complete form** → Add dates and custom terms
5. **Generate LOI** → PDF includes all contact details

### For Administrators

**To add supplier contact information:**

1. Navigate to supplier management
2. Add or edit supplier record
3. Fill in:
   - `contact_name` - Primary contact person
   - `contact_email` - Supplier email
   - `contact_phone` - Phone number
   - `address` - Full address
4. Information will auto-populate in future LOI generations

## Database Schema

### suppliers table
```sql
CREATE TABLE suppliers (
  id uuid PRIMARY KEY,
  organisation_id uuid NOT NULL,
  name text NOT NULL,
  contact_name text,           -- NEW
  contact_email text,
  contact_phone text,
  address text,
  notes text,
  created_at timestamptz,
  updated_at timestamptz
);
```

### letters_of_intent table
```sql
CREATE TABLE letters_of_intent (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL,
  supplier_name text NOT NULL,
  supplier_contact text,
  supplier_email text,
  supplier_phone text,         -- NEW
  supplier_address text,       -- NEW
  scope_summary text,
  service_types jsonb,
  target_start_date date,
  target_completion_date date,
  key_milestones jsonb,
  next_steps_checklist jsonb,
  custom_terms text,
  status text,
  generated_at timestamptz,
  sent_at timestamptz,
  acknowledged_at timestamptz,
  user_confirmed_nonbinding boolean,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz
);
```

## Testing

Verify the following scenarios:

- [ ] Supplier exists in database → Contact details auto-populate
- [ ] Supplier not in database → Form fields empty, no errors
- [ ] User can edit pre-populated fields
- [ ] All fields save correctly to database
- [ ] Existing LOI displays all contact information
- [ ] PDF includes complete contact details
- [ ] Phone and address format correctly in PDF
- [ ] Empty fields handled gracefully (show "N/A")

## Future Enhancements

Potential improvements:
1. Add contact role/title field to suppliers table
2. Support multiple contacts per supplier
3. Add contact history tracking
4. Implement contact validation (email/phone format)
5. Add supplier contact search/autocomplete
