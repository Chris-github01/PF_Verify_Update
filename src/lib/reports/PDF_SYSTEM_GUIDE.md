# Unified PDF Generation System

## Overview

This guide explains how to use the unified PDF generation system for all reports in VerifyTrade. The system ensures:

- ✅ No blank pages
- ✅ No header/footer overlap
- ✅ Tables break correctly across pages
- ✅ Consistent styling and spacing
- ✅ Automatic quality assurance checks

## Quick Start

```typescript
import { wrapPdfTemplate, createPdfSection, createPdfTable } from './pdfTemplateWrapper';
import { generateAndDownloadPdf } from './pdfGenerator';

// 1. Build your content using helper functions
const content = `
  ${createPdfSection({
    title: 'Executive Summary',
    content: '<p>Your summary here...</p>',
  })}

  ${createPdfSection({
    title: 'Supplier Analysis',
    content: createPdfTable({
      headers: ['Supplier', 'Price', 'Score'],
      rows: [
        ['Supplier A', '$100,000', '85'],
        ['Supplier B', '$120,000', '78'],
      ],
    }),
    pageBreakBefore: true, // Start on new page
  })}
`;

// 2. Wrap with template (adds header/footer)
const html = wrapPdfTemplate(content, {
  title: 'Award Report',
  projectName: 'Project Alpha',
  generatedAt: new Date().toISOString(),
  showPageNumbers: true,
});

// 3. Generate PDF (QA checks run automatically)
await generateAndDownloadPdf({
  htmlContent: html,
  filename: 'award_report',
  projectName: 'Project Alpha',
});
```

## Architecture

### 1. Print Stylesheet (`printStyles.ts`)

Core stylesheet with:
- Fixed A4 page model
- CSS variables for consistent spacing
- Smart page break rules
- Table pagination support

**Key CSS Variables:**
```css
--page-margin-top: 14mm
--page-margin-bottom: 16mm
--header-height: 60px
--footer-height: 40px
--content-padding-top: 70px (prevents header overlap)
--content-padding-bottom: 50px (prevents footer overlap)
```

### 2. Template Wrapper (`pdfTemplateWrapper.ts`)

Provides:
- `wrapPdfTemplate()` - Complete HTML document with header/footer
- `createPdfSection()` - Content sections with optional page breaks
- `createPdfTable()` - Tables with proper pagination
- `createPdfCard()` - Styled cards/panels

### 3. Quality Assurance (`pdfQualityAssurance.ts`)

Automatically:
- Removes empty sections (blank pages)
- Fixes excessive whitespace
- Removes orphaned page breaks
- Validates table structure
- Warns about potential issues

### 4. PDF Generator (`pdfGenerator.ts`)

Handles:
- Gotenberg API calls
- Automatic QA integration
- Fallback to browser print
- Error handling

## Page Break Control

### ❌ DON'T: Force breaks on generic wrappers

```html
<!-- BAD: Creates blank pages -->
<div class="page" style="page-break-after: always;">
  <h2>Section 1</h2>
  <p>Content...</p>
</div>
```

### ✅ DO: Use explicit markers only where needed

```typescript
createPdfSection({
  title: 'Section 2',
  content: '...',
  pageBreakBefore: true, // Explicit intent to start new page
})
```

Or in HTML:
```html
<section class="pdf-page-break">
  <h2>Section 2</h2>
  <p>Content...</p>
</section>
```

## Header & Footer Positioning

### Problem: Overlap

Without proper spacing, headers/footers can overlap content.

### Solution: Fixed positioning + content padding

Headers/footers are `position: fixed`, and content has matching padding:

```css
.pdf-header {
  position: fixed;
  top: 0;
  height: var(--header-height); /* 60px */
}

.pdf-content {
  padding-top: var(--content-padding-top); /* 70px = 60px + 10px buffer */
}
```

This ensures content never flows behind headers/footers.

## Table Pagination

### Features

1. **Repeating headers** on each page
2. **Rows don't split** across pages
3. **Safe breaks** between rows

### Implementation

```typescript
createPdfTable({
  headers: ['Column 1', 'Column 2'],
  rows: [
    ['Data 1', 'Data 2'],
    // ...hundreds of rows - will break correctly
  ],
  zebra: true, // Alternating row colors
})
```

### CSS Rules Applied

```css
thead {
  display: table-header-group; /* Repeat on each page */
}

tr {
  break-inside: avoid; /* Keep rows together */
}
```

## Widows & Orphans Prevention

Prevents awkward text splits at page boundaries:

```css
p, li {
  orphans: 3; /* Min 3 lines at bottom of page */
  widows: 3;  /* Min 3 lines at top of page */
}
```

## Utility Classes

### Spacing

```html
<div class="pdf-mb-md">Margin bottom medium</div>
<div class="pdf-mt-lg">Margin top large</div>
```

Sizes: `xs`, `sm`, `md`, `lg`, `xl`, `2xl`, `3xl` (based on 8px system)

### Typography

```html
<p class="pdf-text-small">Small text</p>
<p class="pdf-text-large">Large text</p>
<p class="pdf-text-center">Centered text</p>
```

### Breaks

```html
<div class="pdf-avoid-break">Keep this together</div>
<div class="pdf-page-break">Start new page</div>
```

## Quality Assurance

QA checks run automatically before PDF generation:

```typescript
const result = preparePdfContent(htmlContent, 'Award Report');
// Logs issues to console
// Returns cleaned HTML
```

### What it checks:

1. **Empty sections** - Removes divs/sections with no content
2. **Excessive whitespace** - Reduces multiple line breaks
3. **Orphaned breaks** - Removes page breaks at end of document
4. **Large content** - Warns if >5MB
5. **Table structure** - Validates `<thead>` exists
6. **Long content** - Warns about very long tables/paragraphs

### Example output:

```
📄 PDF QA Report: Award Report
📊 Statistics: {
  emptySectionsRemoved: 2,
  excessiveWhitespaceFixed: 5,
  orphanedPageBreaksRemoved: 1,
  totalLength: 124523
}
✅ No issues found
```

## Migration Guide

### From Old System

**Old modernPdfTemplate.ts:**
```typescript
// ❌ Ad-hoc page breaks everywhere
<div class="page" style="page-break-after: always;">
```

**New approach:**
```typescript
// ✅ Explicit, intentional breaks only
createPdfSection({
  title: 'Recommendations',
  content: '...',
  pageBreakBefore: true,
})
```

### Update checklist:

1. Replace `.page` wrappers with `createPdfSection()`
2. Remove `page-break-after: always` from CSS
3. Use `pdf-page-break` class only where truly needed
4. Wrap content with `wrapPdfTemplate()` for header/footer
5. Let QA system clean up issues

## Testing

### Test with these scenarios:

1. **Short report** (1-2 pages) - No blank pages at end
2. **Medium report** (5-10 pages) - Headers/footers don't overlap
3. **Long report** (20+ pages) - Tables break correctly, page numbers accurate

### Visual inspection:

- Open generated PDF
- Check for blank pages (shouldn't exist)
- Verify headers visible on all pages
- Confirm tables don't have orphaned headers
- Check page numbers increment correctly

## Advanced Usage

### Custom CSS

```typescript
const customCss = `
  .custom-highlight {
    background: #fef3c7;
    padding: 16px;
    border-left: 4px solid #f59e0b;
  }
`;

const html = wrapPdfTemplate(content, {
  title: 'Report',
  customCss,
});
```

### Skip QA (not recommended)

```typescript
await generateAndDownloadPdf({
  htmlContent: html,
  filename: 'report',
  skipQualityCheck: true, // Skip QA checks
});
```

### Custom header/footer

```typescript
import { wrapPdfContent } from './printStyles';

const html = wrapPdfContent({
  content: myContent,
  header: '<div>Custom Header</div>',
  footer: '<div>Custom Footer</div>',
  customCss: '...',
});
```

## Best Practices

### ✅ DO

- Use semantic HTML (`<section>`, `<table>`, `<p>`)
- Add `pageBreakBefore: true` for major sections
- Use helper functions (`createPdfSection`, `createPdfTable`)
- Let QA system run (don't skip)
- Test with various content lengths

### ❌ DON'T

- Use `.page` class with `page-break-after: always`
- Add arbitrary page breaks "just in case"
- Create custom header/footer without proper padding
- Skip QA checks
- Use inline styles for page breaks

## Troubleshooting

### Problem: Blank pages in output

**Cause:** Empty sections or forced page breaks

**Solution:** Let QA system remove them automatically, or check for empty divs with `page-break` classes

### Problem: Headers overlap content

**Cause:** Missing content padding

**Solution:** Use `wrapPdfContent()` which adds proper padding

### Problem: Table headers don't repeat

**Cause:** Missing `<thead>` or wrong CSS

**Solution:** Use `createPdfTable()` helper or add:
```css
thead { display: table-header-group; }
```

### Problem: Text splits awkwardly

**Cause:** No widow/orphan control

**Solution:** System already includes:
```css
p, li { orphans: 3; widows: 3; }
```

## Support

For issues with the PDF system, check:

1. Console logs from QA system
2. Browser print preview (Cmd/Ctrl+P)
3. Generated HTML (fallback mode)

The system will automatically fallback to browser print if Gotenberg fails, so users can still generate PDFs.
