# Subcontractor Onboarding System

## Overview

A comprehensive, legally-protected subcontractor onboarding system has been added to the Contract Manager. This feature only appears **after award approval** and provides a guided 3-step process for safely onboarding your awarded subcontractor.

## Key Safety Features

### Legal Protection
- **Non-binding templates** with prominent disclaimers
- **Watermarked PDFs** with "Draft – Legal Review Required"
- **Mandatory user confirmation** checkbox before LOI generation
- **Audit trail logging** of all onboarding events
- **Multiple disclaimer placements** throughout LOI document

### Access Control
- Tab only appears **after award approval**
- RLS policies protect all onboarding data
- Storage policies secure compliance documents
- Audit logs track all user actions

## Features

### 1. Letter of Intent (LOI) Generation

**Purpose**: Generate a non-binding expression of intent to help kickstart subcontractor engagement

**Key Features**:
- Service types automatically pulled from scope matrix (no pricing)
- Editable contact details, timelines, and custom terms
- PDF export with organization logo
- Watermarked "DRAFT – LEGAL REVIEW REQUIRED"
- Multiple legal disclaimers:
  - Top disclaimer box
  - Bottom reconfirmation
  - Footer warning

**User Safety**:
- Mandatory checkbox: "I confirm this is NON-BINDING and I will seek legal review"
- Cannot generate without confirming
- All LOIs saved to database with confirmation flag
- Audit log entry created

**Generated LOI Includes**:
- Organization logo (if available)
- Supplier contact information
- High-level scope summary
- Service types (e.g., "Penetration Seals", "Fire Doors") - **NO PRICING**
- Indicative timelines
- Next steps checklist
- Custom terms field
- Multiple non-binding disclaimers

### 2. Compliance Documents Upload

**Purpose**: Collect required documentation from subcontractor before contract execution

**Document Types**:
- Public Liability Insurance
- Health & Safety Documentation
- Trade License/Certification
- Method Statements

**Features**:
- Upload multiple documents per category
- Track submission status (pending, submitted, verified, rejected)
- Secure storage in `compliance-documents` bucket
- Document verification workflow
- Audit logging of uploads

**Security**:
- RLS policies on storage bucket
- RLS policies on database table
- Only accessible to organization members
- All uploads logged in audit trail

### 3. Handover Packs

**Purpose**: Generate professional handover documentation for different stakeholders

**Available Packs**:

1. **Junior Site Team Pack**
   - Practical scope breakdown by service types
   - Site-specific requirements
   - Quality checkpoints
   - Emphasis on service types (Seals, Doors, Dampers, etc.)

2. **Senior Management Report**
   - Commercial summary
   - Risk assessment
   - Program milestones
   - Executive overview

**Features**:
- PDF generation with print dialog
- Organization logo included
- Service types prominently displayed
- Audit logging of generation

## Database Schema

### New Tables

#### `letters_of_intent`
Stores all generated LOIs with full audit trail
- Supplier details and contact information
- Scope summary and service types (jsonb array)
- Timelines and milestones (jsonb)
- Status tracking (draft, sent, acknowledged)
- Non-binding confirmation flag
- Timestamps for generation, sending, acknowledgment

#### `onboarding_compliance_documents`
Tracks all uploaded compliance documentation
- Document type and file metadata
- Status workflow (pending → submitted → verified/rejected)
- File path in storage bucket
- Verification tracking

#### `onboarding_audit_log`
Complete audit trail of onboarding activities
- Event types: loi_generated, loi_sent, compliance_uploaded, handover_pack_generated
- Event metadata (jsonb)
- User and timestamp tracking

### Storage Bucket

#### `compliance-documents`
Secure, private bucket for compliance files
- Organized by: `{project_id}/{document_type}/{timestamp}_{filename}`
- RLS policies enforce organization membership
- Not publicly accessible

## Security Implementation

### Row Level Security (RLS)

All tables have comprehensive RLS policies:
- **SELECT**: Only organisation members can view
- **INSERT**: Only organisation members can create
- **UPDATE**: Only organisation members can modify
- **DELETE**: Only organisation members can delete

### Storage Security

Compliance documents bucket:
- Not publicly accessible
- Upload policy checks project membership
- View policy checks project membership
- Files organized by project for easy isolation

### Audit Trail

Every significant action is logged:
```sql
SELECT * FROM onboarding_audit_log
WHERE project_id = 'xxx'
ORDER BY created_at DESC;
```

Events tracked:
- `loi_generated` - LOI created with confirmation
- `loi_sent` - LOI sent to subcontractor
- `compliance_uploaded` - Document uploaded
- `handover_pack_generated` - Pack exported

## User Experience

### Access Flow

1. Complete award report
2. **Approve award** (critical step)
3. Navigate to Contract Manager
4. New "Subcontractor Onboarding" tab appears
5. Guided 3-step process with visual progress

### Step Indicators

Visual progress shows:
- Current step highlighted in blue
- Completed steps marked with green checkmark
- Pending steps in gray
- Click any step to navigate

### LOI Workflow

1. Click "Generate Letter of Intent"
2. Fill in form:
   - Contact person details
   - Email address
   - Scope summary (pre-filled)
   - Target start/completion dates
   - Optional custom terms
3. **Mandatory**: Check "I confirm this is NON-BINDING"
4. Click "Generate LOI"
5. Success! Download PDF or regenerate as needed

### PDF Export

All PDFs use print dialog method:
- Opens browser print dialog
- User selects "Save as PDF"
- Works cross-browser
- Includes watermarks and disclaimers

## Legal Disclaimers

### Throughout LOI Document

**Top Disclaimer (Red Box)**:
> ⚠️ IMPORTANT LEGAL DISCLAIMER
>
> This Letter of Intent is a NON-BINDING expression of intent only.
> No contractual relationship is created, implied, or established by this document...

**Bottom Reconfirmation (Red Box)**:
> RECONFIRMATION OF NON-BINDING NATURE
>
> This document creates absolutely no binding obligations, commitments, or liabilities whatsoever...

**Footer Warning**:
> Generated by VerifyTrade Contract Manager
> DRAFT DOCUMENT – NOT FOR DISTRIBUTION WITHOUT LEGAL REVIEW

**Watermark**:
> DRAFT – LEGAL REVIEW REQUIRED (rotated 45°, semi-transparent)

### In Application

**Before Generation (Orange Box)**:
User must check: "I confirm that I understand this is a NON-BINDING document and creates no legal obligations or liabilities. I will seek legal review before sending to the subcontractor."

## Integration Points

### Scope Matrix Integration
- Service types automatically pulled from approved quote items
- No manual entry required
- Ensures consistency with award report

### Organization Settings
- Logo automatically included if uploaded
- Uses existing organization context

### Award Report
- Only accessible after approval
- Pulls supplier name from approved award
- Links to approved quote data

## Technical Implementation

### Frontend Components

1. **OnboardingTab** - Main container with step navigation
2. **LOIStep** - Letter of Intent generation and management
3. **ComplianceStep** - Document upload interface
4. **HandoverStep** - Pack generation interface
5. **generateLOIHtml()** - HTML template for LOI PDF

### Backend Functions

- **log_onboarding_event()** - Audit logging function
- **RLS policies** - Comprehensive security
- **Storage policies** - Document access control

### State Management

- React hooks for local state
- Supabase real-time for data sync
- Audit logging for accountability

## Best Practices

### For Users

1. **Always seek legal review** before sending LOIs
2. **Verify all information** in generated documents
3. **Keep confirmation checkbox honest** - it exists for your protection
4. **Upload compliance docs early** to avoid delays
5. **Use both pack types** for comprehensive handover

### For Administrators

1. **Monitor audit logs** for compliance
2. **Review user confirmations** if disputes arise
3. **Backup compliance documents** regularly
4. **Ensure legal review process** is followed

## Future Enhancements

Potential additions (not implemented):
- Email sending capability with tracking
- Subcontractor portal for acknowledgment
- Document expiry tracking
- Automated reminders for missing documents
- E-signature integration
- Contract template library

## Summary

The Subcontractor Onboarding system provides a **safe, legally-protected** way to engage with awarded subcontractors while maintaining clear boundaries about non-binding intent. The system:

✅ Only appears after approval
✅ Includes comprehensive legal disclaimers
✅ Requires user confirmation before generation
✅ Watermarks all draft documents
✅ Logs all actions in audit trail
✅ Emphasizes service types over pricing
✅ Stores data securely with RLS
✅ Integrates seamlessly with existing features

**This feature protects the organization from legal exposure while facilitating efficient subcontractor onboarding.**
