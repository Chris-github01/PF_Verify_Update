# Commercial Control Base Tracker - Design Specification

## Overview
The Base Tracker is a comprehensive commercial control system that tracks the original contract value against actual progress claims, providing real-time visibility into contract performance, financial exposure, and risk indicators.

## Purpose
- Monitor contract value vs. certified payments
- Track progress claims and certification status
- Identify over/under claiming patterns
- Manage retention and commercial risks
- Provide audit trail for all commercial transactions

---

## Core Data Structure

### Essential Columns (Base Tracker Table)

| Column Name | Data Type | Description | Source | Editable |
|------------|-----------|-------------|---------|----------|
| **Line Number** | Text | Sequential identifier (BT-0001, BT-0002, etc.) | System Generated | No |
| **Description** | Text | Work item description | Quote Items | No |
| **System/Category** | Text | Fire system classification (Detection, Suppression, etc.) | Quote Items (mapped) | No |
| **Scope Category** | Text | Included/Excluded/Allowance | Quote Items | No |
| **Location/Zone** | Text | Building zone or area | Quote Items | Yes |
| **Unit** | Text | Unit of measure (ea, m, m², etc.) | Quote Items | No |
| **Original Qty** | Decimal | Contracted quantity | Quote Items | No |
| **Unit Rate** | Currency | Agreed rate per unit | Quote Items | No |
| **Original Value** | Currency | Qty × Rate (calculated) | Computed | No |
| **Claimed to Date (Qty)** | Decimal | Cumulative quantity claimed | User Input/Claims | Yes |
| **Claimed to Date (Value)** | Currency | Claimed Qty × Rate (calculated) | Computed | No |
| **Certified to Date (Qty)** | Decimal | Quantity approved for payment | User Input/Claims | Yes |
| **Certified to Date (Value)** | Currency | Certified Qty × Rate (calculated) | Computed | No |
| **Remaining Qty** | Decimal | Original - Certified (calculated) | Computed | No |
| **Remaining Value** | Currency | Remaining Qty × Rate (calculated) | Computed | No |
| **% Complete** | Percentage | (Certified / Original) × 100 | Computed | No |
| **Variance Flag** | Status | Over/Under/On Track | Computed Logic | No |
| **Claim Status** | Enum | Draft/Submitted/Certified/Disputed | Workflow | Yes |
| **Last Claim Date** | Date | Date of most recent claim | Claims Data | No |
| **Last Certified Date** | Date | Date of most recent certification | Claims Data | No |
| **Notes** | Text | Commercial notes and comments | User Input | Yes |

### Additional Financial Controls

| Column Name | Data Type | Description | Calculation |
|------------|-----------|-------------|-------------|
| **Retention Amount** | Currency | 5% held until PC | Certified Value × 5% |
| **Net Payment** | Currency | Payment after retention | Certified Value - Retention |
| **Cumulative Paid** | Currency | Total paid to date | Sum of all payments |
| **Outstanding Amount** | Currency | Certified but not paid | Certified - Paid |

### Risk Indicators

| Column Name | Data Type | Description | Logic |
|------------|-----------|-------------|-------|
| **Over Claim Risk** | Boolean | Claimed > Original | Flag if Claimed Qty > Original Qty |
| **Under Claim Risk** | Boolean | Progress < Expected | Flag if % Complete < Expected % |
| **Value at Risk** | Currency | Uncertified claims | Claimed Value - Certified Value |
| **Commercial Flag** | Enum | None/Warning/Critical | Based on variance thresholds |

---

## Export Specifications

### 1. SUPPLIER VERSION (External Export)

**Purpose**: Share with subcontractor for reconciliation and payment applications

**Included Data:**
- Line Number, Description, System/Category
- Location/Zone, Unit
- Original Qty, Unit Rate, Original Value
- Certified to Date (Qty & Value)
- Remaining Qty, Remaining Value
- % Complete
- Last Certified Date
- Retention Amount (if applicable)
- Net Payment (certified less retention)

**Excluded Data** (Confidential):
- Internal notes
- Risk flags and variance indicators
- Claim vs. Certified discrepancies
- Commercial flags
- Model rate comparisons
- Internal cost targets

**Format Options:**
- Excel (.xlsx) - formatted with company branding
- PDF - professional statement format
- CSV - for import into supplier systems

**Features:**
- Read-only protective formatting
- Company logo and project details header
- Clear totals and subtotals
- Payment schedule summary
- Professional presentation suitable for contractual records

---

### 2. INTERNAL VERSION (Commercial Management Export)

**Purpose**: Complete commercial control export for internal project teams and senior management

**Included Data:**
- ALL columns from Supplier Version PLUS:
- Claimed to Date (Qty & Value) - shows what supplier requested
- Variance between Claimed vs. Certified
- Over/Under Claim Flags
- Value at Risk
- Commercial Flags and Risk Indicators
- Internal Notes and Comments
- Claim Status workflow
- Full claim history
- Payment status and outstanding amounts
- Model rate comparisons (if available)
- Margin analysis
- Cost variance vs. budget

**Additional Sections:**
- Executive Summary Dashboard
  - Total Contract Value
  - Total Certified to Date
  - Total Paid to Date
  - Total Retention Held
  - Total Outstanding
  - Variations Approved/Pending
  - Net Forecast Final Cost

- Risk Register
  - Lines with over-claims
  - Lines with under-claims vs. program
  - Commercial disputes
  - High value variances

- Payment Reconciliation
  - Certification history
  - Payment history
  - Retention register
  - Outstanding amounts

**Format Options:**
- Excel (.xlsx) - multiple tabs for different views
- PDF - comprehensive report with charts
- Power BI / Dashboard export

**Security:**
- Marked "COMMERCIAL IN CONFIDENCE"
- Access controlled via RLS
- Audit trail of all exports
- Watermarked with user/timestamp

---

## Data Source Mapping

### Primary Data Sources

1. **Quote Items** (quote_items table)
   - Original contract quantities and rates
   - Scope categories and descriptions
   - System classifications

2. **Commercial Baseline Items** (commercial_baseline_items table)
   - Generated from awarded quote
   - Includes line numbers and organization
   - Links to award approval

3. **Base Tracker Claims** (base_tracker_claims table)
   - Claimed quantities and values
   - Claim dates and status
   - Certification records

4. **Variation Register** (variation_register table)
   - Approved variations affecting baseline
   - Pending variations

5. **Payment Records** (payment_records table - to be created)
   - Payment certificates
   - Retention amounts
   - Payment dates

---

## Business Rules

### Claim Validation Rules

1. **Over-Claim Prevention**
   - Claimed Qty cannot exceed (Original Qty + Approved VO Qty)
   - Warning issued at 95% of original qty
   - Hard stop at 100% (requires variation approval)

2. **Certification Rules**
   - Certified Qty cannot exceed Claimed Qty
   - Only "Submitted" claims can be certified
   - Certification requires approval workflow

3. **Retention Calculation**
   - 5% retention on all certified amounts
   - Retention released at Practical Completion
   - 50% released at PC, 50% at Final Completion (configurable)

4. **Payment Processing**
   - Payment = Certified Value - Retention - Previous Payments
   - Payment cannot exceed certified amount
   - Retention tracked separately

### Risk Flagging Thresholds

| Risk Level | Condition | Action |
|-----------|-----------|---------|
| **GREEN** | On track | No action required |
| **AMBER** | ±5% variance from expected | Monitor closely |
| **RED** | >10% variance or over-claim | Investigation required |
| **CRITICAL** | Over-claim or negative variance | Immediate escalation |

---

## User Permissions

### Role-Based Access

| Role | View | Claim | Certify | Export Supplier | Export Internal |
|------|------|-------|---------|-----------------|-----------------|
| **Supplier** | Own data only | Yes | No | Own data | No |
| **Site Team** | All data | No | No | Yes | No |
| **Contracts Manager** | All data | Yes | Yes | Yes | Yes |
| **Commercial Manager** | All data | Yes | Yes | Yes | Yes |
| **Finance Director** | All data | No | Override | Yes | Yes |
| **Platform Admin** | All orgs | No | No | Yes | Yes |

---

## Export Functionality Implementation

### Technical Requirements

1. **Generate Supplier Export**
   ```typescript
   async function exportBaseTrackerSupplier(params: {
     projectId: string;
     awardApprovalId: string;
     format: 'excel' | 'pdf' | 'csv';
   }): Promise<Blob>
   ```

2. **Generate Internal Export**
   ```typescript
   async function exportBaseTrackerInternal(params: {
     projectId: string;
     awardApprovalId: string;
     format: 'excel' | 'pdf';
     includeDashboard: boolean;
     includeRiskRegister: boolean;
   }): Promise<Blob>
   ```

### Excel Export Structure

#### Supplier Version Tabs:
1. **Contract Summary** - Project header, totals
2. **Base Tracker** - Line item details
3. **Retention Schedule** - Retention amounts and release dates

#### Internal Version Tabs:
1. **Executive Dashboard** - High-level metrics and charts
2. **Base Tracker (Full)** - All columns including internal data
3. **Risk Register** - Flagged items requiring attention
4. **Claim History** - Full claim and certification timeline
5. **Payment Reconciliation** - Payment status and outstanding
6. **Variance Analysis** - Detailed variance breakdowns

---

## Integration Points

### Upstream Systems
- Award Report → Generates initial baseline
- Quote Items → Source of original data
- Supplier Comparison → Rate validation

### Downstream Systems
- Payment Certificates → Feeds payment processing
- Variation Register → Adjusts baseline quantities
- Project Reporting → Financial forecasting
- Audit Trail → Blockchain verification (future)

---

## Next Steps / Implementation Plan

1. **Phase 1: Core Tracker** ✅ (Completed)
   - Create commercial_baseline_items table
   - Link to award approvals
   - Basic line item structure

2. **Phase 2: Claims Management** (Current)
   - Create base_tracker_claims table
   - Claim submission workflow
   - Certification approval process

3. **Phase 3: Export Functionality** (Next)
   - Implement supplier export
   - Implement internal export
   - Excel formatting and branding

4. **Phase 4: Risk & Analytics** (Future)
   - Automated variance detection
   - Risk flagging algorithms
   - Predictive analytics

---

## Success Metrics

- Original Contract Value accurately reflects awarded quote ($1,465,830.60)
- Real-time visibility into certified vs. claimed amounts
- Reduced payment disputes through clear reconciliation
- Audit-ready export formats
- Compliance with construction payment regulations
- Executive dashboard showing financial exposure
