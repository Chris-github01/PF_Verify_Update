# Beca Fire Schedule Parser - Testing Guide

## Document Structure

The Beca fire schedule has a **complex multi-level table structure**:

### Page 1: Main Schedule Grid

```
┌──────────────────────────────────────────────────────────────┐
│ ORIENTATION: WALL                                            │
├──────┬──────┬────────┬────────┬──────────────────────────────┤
│      │      │        │        │   SUBSTRATE COLUMNS          │
│Service│Material│Size  │Insul   ├─────────┬──────────┬────────┤
│      │      │        │        │Masonry  │Plaster   │Korok   │
│      │      │        │        │  120    │   60     │   60   │
├──────┼──────┼────────┼────────┼─────────┼──────────┼────────┤
│Fire  │Steel │15-150mm│nil     │PFP009   │PFP005    │PFP001  │
│Hydrant│uninsu│        │        │         │          │        │
│      │lated │        │        │Fire Stop│Fire Stop │Fire    │
│      │      │        │        │Products:│Products: │Stop    │
│      │      │        │        │Ryanfire │Ryanfire  │Products│
│      │      │        │        │502 +    │502 +     │...     │
│      │      │        │        │Mastic   │Mastic    │        │
│      │      │        │        │...      │...       │        │
│      │      │        │        │Substrate│Substrate │Hilti:  │
│      │      │        │        │Req: No  │Req: All: │locally │
│      │      │        │        │wall     │2x 13mm   │thicken │
│      │      │        │        │build up │lining    │...     │
└──────┴──────┴────────┴────────┴─────────┴──────────┴────────┘
```

**Key characteristics:**
- Each service type spans multiple rows
- Each substrate column contains 3 sub-sections:
  1. Fire Stop Reference (PFP code)
  2. Fire Stop Products (product list)
  3. Substrate Requirements (installation notes)

### Page 2: Detailed Reference Table

```
┌───────────┬──────────────┬─────────────────┬─────────────┐
│ Passive   │ Passive Fire │ Passive Fire    │ Limitations │
│ Fire Code │ Type         │ Solutions       │             │
├───────────┼──────────────┼─────────────────┼─────────────┤
│ PFP001    │ 78mm Korok   │ Ryanfire 502    │ Hilti: no   │
│           │ -/60/60      │ board + Mastic  │ more than   │
│           │ Uninsulated  │ + Rokwrap       │ 20mm        │
│           │ metal        │ (V7.1)          │ annular gap │
└───────────┴──────────────┴─────────────────┴─────────────┘
```

**Key characteristics:**
- Simpler structure
- One product solution per row
- Direct PFP code reference

## What the Parser Extracts

### From Main Schedule (Page 1)

For each service/substrate combination:

```json
{
  "solution_id": "PFP009",
  "service_type": "Fire Hydrant - Steel uninsulated",
  "service_size_text": "15-150mm",
  "service_size_min_mm": 15,
  "service_size_max_mm": 150,
  "insulation_thickness_mm": null,
  "system_classification": "Masonry 120",
  "frr_rating": "-/120/120",
  "orientation": "WALL",
  "fire_stop_products": "Ryanfire 502 + Mastic + Rokwrap (V7.1)\nProtecta FR Acrylic (FC353)\nHilti Sealant CP 606",
  "substrate_requirements": "Ryanfire: minimum 2x 13mm lining, aperture fully lined\nProtecta: minimum 2x 13mm lining",
  "test_reference": "PFP009",
  "parse_confidence": 0.85
}
```

### From Detail Table (Page 2)

For each PFP code entry:

```json
{
  "solution_id": "PFP001",
  "system_classification": "78mm Korok -/60/60",
  "service_type": "Uninsulated metal - Copper 25-150mm, Steel 20-150mm",
  "fire_stop_products": "Ryanfire 502 board + Mastic + Rokwrap (V7.1)\nHilti CP606 Firestop Acrylic Sealant + Fibretex 450\nPromat PROMASEAL Bulkhead Batt + PROMASEAL A + PROMASEAL SupaWrap",
  "substrate_requirements": "Hilti: no more than 20mm annular gap",
  "build_up": "Hilti: locally thicken to minimum 100mm thick",
  "parse_confidence": 0.9
}
```

## Expected Parser Behavior

### 1. Page Detection

```
[FireSchedule] Page 1: Schedule start detected
[FireSchedule] Page 2: Schedule content detected
[FireSchedule] Found schedule on pages: [1, 2]
```

### 2. Table Extraction

```
[FireSchedule] Page 1: Strategy 1 (lines_strict) found 1 tables
[FireSchedule] Table on page 1: 45 data rows
[FireSchedule] Page 2: Strategy 1 (lines_strict) found 1 tables
[FireSchedule] Table on page 2: 28 data rows
```

### 3. Row Parsing

```
[FireSchedule] Column mapping: {'service_type': 0, 'material': 1, 'service_size': 2, ...}
[FireSchedule] Parsed 73 schedule rows total
```

### 4. Confidence Scoring

Expected confidence distribution:
- **0.8-1.0** (Excellent): Rows with PFP codes, products, and full details
- **0.6-0.8** (Good): Rows with most fields populated
- **0.4-0.6** (Fair): Rows with some missing data
- **< 0.4** (Poor): Filtered out automatically

## What Success Looks Like

After uploading a Beca fire schedule:

1. **Parse succeeds**
   - `success: true`
   - `total_rows: 60-100` (depending on schedule size)
   - `average_confidence: > 0.7`
   - `low_confidence_count: < 10%`

2. **Data quality**
   - PFP codes extracted correctly (PFP001, PFP002, etc.)
   - Service types combined with materials
   - Product lists captured in full
   - Substrate requirements preserved

3. **Database**
   - Rows inserted into `fire_engineer_schedule_rows`
   - All three new fields populated:
     - `fire_stop_products`
     - `substrate_requirements`
     - `build_up`

## Common Failure Modes & Fixes

### Issue: "No schedule pages found"

**Cause:** PDF doesn't contain expected markers

**Fix:** Check if PDF has:
- "PRE-STITCH - FIRE & SMOKE STOPPING SOLUTIONS"
- "FIRE AND SMOKE STOPPING"
- Page title containing "SCHEDULE" or "TABLE"

If markers are different, add them to `_find_schedule_pages()`.

### Issue: "Found schedule pages but no tables extracted"

**Cause:** Table is an image or uses unconventional structure

**Fix:**
1. Check if PDF is scanned (would need OCR)
2. Verify table has actual lines or consistent spacing
3. Try all 4 extraction strategies - logs will show which ones failed

### Issue: "Extracted tables but couldn't parse rows"

**Cause:** Column structure doesn't match expected format

**Fix:**
1. Check logged column mapping
2. Verify header row is correctly identified
3. May need to add alternative column names to `_identify_columns()`

### Issue: "Low confidence scores"

**Cause:** Missing key fields in extraction

**Fix:**
1. Check which fields are empty in parsed rows
2. Verify column mapping is correct
3. May need to adjust confidence calculation weights

## Testing Checklist

- [ ] Upload Beca fire schedule PDF
- [ ] Verify both pages are detected as schedule pages
- [ ] Check that tables are extracted from both pages
- [ ] Confirm PFP codes are identified (solution_id field)
- [ ] Verify product lists are captured (fire_stop_products)
- [ ] Check substrate requirements are preserved
- [ ] Confirm average confidence > 0.7
- [ ] Verify rows are saved to database
- [ ] Check that all three new fields have data

## Advanced: Handling Variations

Different fire schedule formats may require tweaks:

### Crossfire Style
- Usually has "Passive Solution" column on far right
- May use "System Classification" instead of substrate types
- Test references often in separate column

**Adjustment:** Update column patterns in `_identify_columns()`

### Consultant-Specific Formats
- Some use "FRR" vs "Required FRR"
- Column order may vary
- Product names may be abbreviated

**Adjustment:** Add alternative patterns to column_patterns dict

### Multi-Orientation Schedules
- Separate WALL and FLOOR sections
- May repeat headers
- Orientation should be extracted from section headers

**Current support:** Orientation column if present, otherwise null

## Next Steps If Still Failing

1. **Enable debug mode** - Add more logging to see exact extraction
2. **Export first table** - Check if pdfplumber is seeing the right structure
3. **Manual inspection** - Use pdfplumber directly to test extraction strategies
4. **Consider OCR** - If PDF is image-based, add `ocr_parser.py` fallback
5. **OpenCV detection** - For complex layouts, detect grid visually

## Contact for Support

If the parser fails on your specific schedule format:

1. Share the parsing logs (shows which strategy was tried)
2. Note the document type (Beca, Crossfire, other)
3. Identify if schedule markers are different
4. Check if tables are images vs vector graphics
