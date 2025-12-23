# Schedule of Rates Export Feature

## Overview

A new professional export function has been added to the Reports section that generates a beautifully formatted Excel workbook containing Schedule of Rates for each supplier.

## Location

**Reports → Award Report → Export Report Dropdown → "Export Schedule of Rates"**

## Features

### ✅ Individual Supplier Sheets
- Each supplier gets their own dedicated worksheet
- Sheet name is the supplier name (max 31 characters)
- Professional layout with company branding

### ✅ Comprehensive Column Structure
1. **Description** - Full item description
2. **Material Type** - Material specification
3. **Service Type** - Classified service category
4. **Unit of Measure** - Unit (ea, m, m², etc.)
5. **Diameter/Size** - Size or diameter measurement
6. **Rate per Unit** - Unit price in currency format

### ✅ Organized by Service Categories
Items are grouped into color-coded sections:
- **Electrical** (Blue) - Electric systems and installations
- **Plumbing** (Purple) - Water, drainage, plumbing
- **Fire** (Red) - Fire protection and sprinklers
- **HVAC** (Orange) - Ventilation and air conditioning
- **Security** (Light Blue) - Security systems and CCTV
- **Data** (Deep Purple) - Network and communications
- **Other** (Green) - Miscellaneous systems

### ✅ Professional Formatting

#### Header Section
- Large title: "SCHEDULE OF RATES"
- Project name prominently displayed
- Supplier name in bold
- Generation date

#### Service Type Sections
- **Bold, colored headers** for each service type
- Color-coded backgrounds (alternating rows)
- Professional commercial manager style

#### Column Headers
- Gray background with bold text
- Clear, centered headers
- Professional borders

#### Data Rows
- Alternating row colors for readability
- Light tint matching service type color
- Currency formatting for rates ($#,##0.00)
- Proper borders and alignment

#### Section Summaries
- Total items count per section
- Sum of rates per section
- Bold formatting for emphasis

#### Footer
- VerifyTrade branding
- Professional signature

### ✅ Excel Features
- **Frozen panes** - Headers stay visible when scrolling
- **Proper column widths** - Optimized for readability
- **Text wrapping** - Long descriptions wrap properly
- **Number formatting** - Currency with 2 decimal places

## Technical Implementation

### File Created
`src/lib/export/scheduleOfRatesExport.ts`

### Service Type Color Scheme
```typescript
Electrical: Blue (#1E88E5)
Plumbing:   Purple (#9C27B0)
Fire:       Red (#F44336)
HVAC:       Orange (#FF9800)
Security:   Light Blue (#2196F3)
Data:       Deep Purple (#673AB7)
Other:      Green (#8BC34A)
```

### Automatic Categorization
The system intelligently categorizes items based on:
- Service type field
- Scope category field
- Keywords in descriptions

### Data Source
- Fetches from `quote_items` table
- Includes all suppliers with quotes for the project
- Ordered by service category and description

## Usage

1. Navigate to **Reports**
2. Select a project and view its **Award Report**
3. Click **"Export Report"** dropdown button
4. Select **"Export Schedule of Rates"**
5. Excel file downloads automatically

### File Naming
`Schedule_of_Rates_{ProjectName}_{Date}.xlsx`

Example: `Schedule_of_Rates_Brink_Lodge_Hotel_20250312.xlsx`

## Example Output Structure

```
SCHEDULE OF RATES
Project: The Brink Lodge Hotel
Supplier: ABC Fire Protection Ltd
Generated: 12 March 2025

╔══════════════════════════════════════════════════╗
║           ELECTRICAL                              ║
╠══════════════════════════════════════════════════╣
Description | Material | Service | Unit | Size | Rate
────────────────────────────────────────────────────
Item 1...   | Copper   | Install | ea   | 25mm | $125.00
Item 2...   | PVC      | Supply  | m    | 50mm | $85.50
────────────────────────────────────────────────────
Total Electrical Items: 25                    $2,450.00

╔══════════════════════════════════════════════════╗
║           PLUMBING                                ║
╠══════════════════════════════════════════════════╣
...
```

## Benefits

### For Commercial Managers
- Professional presentation ready for client review
- Clear rate breakdowns by trade
- Easy to compare across suppliers
- Audit trail for contract documentation

### For Quantity Surveyors
- Quick reference for unit rates
- Service type grouping for budget allocation
- Material specifications clearly visible
- Size/diameter information for accurate costing

### For Project Managers
- Easy to share with subcontractors
- Professional format for contract negotiations
- Clear scope by trade package
- Supports value engineering discussions

## Notes

- Export includes ALL suppliers with quotes for the project
- Each supplier gets a separate worksheet for easy navigation
- Items without service type go to "Other Systems" category
- Rates are displayed with 2 decimal places
- Empty quotes are skipped automatically

## Future Enhancements (Potential)

- Filter by specific suppliers
- Include quantities and totals
- Add comparison sheet across suppliers
- Include allowances and provisional sums
- Export to PDF option
- Custom color schemes per organization
