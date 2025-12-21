# PDF System - Quick Start Guide

## 30-Second Start

```typescript
import { wrapPdfTemplate, createPdfSection } from './pdfTemplateWrapper';
import { generateAndDownloadPdf } from './pdfGenerator';

// 1. Create content
const content = createPdfSection({
  title: 'My Report',
  content: '<p>Your content here</p>',
});

// 2. Wrap with template
const html = wrapPdfTemplate(content, {
  title: 'Report Title',
  projectName: 'Project Name',
  generatedAt: new Date().toISOString(),
});

// 3. Generate PDF (QA runs automatically)
await generateAndDownloadPdf({
  htmlContent: html,
  filename: 'my_report',
  projectName: 'Project Name',
});
```

That's it! No blank pages, no header overlap, automatic quality checks.

---

## Common Patterns

### Multiple Sections

```typescript
const content = `
  ${createPdfSection({
    title: 'Executive Summary',
    content: '<p>Summary text...</p>',
  })}

  ${createPdfSection({
    title: 'Detailed Analysis',
    content: '<p>Analysis text...</p>',
    pageBreakBefore: true, // Start new page
  })}
`;
```

### Table with Data

```typescript
import { createPdfTable } from './pdfTemplateWrapper';

const table = createPdfTable({
  headers: ['Name', 'Price', 'Score'],
  rows: [
    ['Item 1', '$100', '85'],
    ['Item 2', '$200', '90'],
  ],
  caption: 'My Data Table',
  zebra: true, // Striped rows
});
```

### Highlighted Card

```typescript
import { createPdfCard } from './pdfTemplateWrapper';

const card = createPdfCard({
  title: 'Important Notice',
  content: '<p>This is important...</p>',
  style: 'highlight', // or 'warning' or 'default'
});
```

---

## Utility Classes

```html
<!-- Spacing -->
<div class="pdf-mb-md">Medium margin bottom</div>
<div class="pdf-mt-lg">Large margin top</div>

<!-- Typography -->
<p class="pdf-text-center">Centered text</p>
<p class="pdf-text-small">Small text</p>

<!-- Breaks -->
<div class="pdf-avoid-break">Keep together</div>
<div class="pdf-page-break">Start new page</div>
```

---

## Do's and Don'ts

### ✅ DO

```typescript
// Use helper functions
createPdfSection({ title: 'Section', content: '...' })

// Explicit page breaks where needed
createPdfSection({ title: 'New Page', pageBreakBefore: true })

// Let QA run automatically
await generateAndDownloadPdf({ htmlContent: html, ... })
```

### ❌ DON'T

```html
<!-- Don't use .page with page-break-after -->
<div class="page" style="page-break-after: always;">

<!-- Don't add random page breaks -->
<div style="page-break-before: always;">

<!-- Don't skip QA -->
generatePdfWithGotenberg({ ..., skipQualityCheck: true })
```

---

## Testing Checklist

Generate your PDF and check:
- [ ] No blank pages at the end
- [ ] Headers visible on all pages
- [ ] Tables don't have orphaned headers
- [ ] Page numbers increment correctly
- [ ] No content overlaps header/footer

---

## When Things Go Wrong

### Blank pages appearing?
**Solution:** Let QA remove them automatically (it does by default)

### Headers overlapping content?
**Solution:** Use `wrapPdfTemplate()` instead of custom header

### Tables breaking badly?
**Solution:** Use `createPdfTable()` helper function

### Need help?
**Read:** `PDF_SYSTEM_GUIDE.md` for full documentation
**Check:** Console for QA report during PDF generation
**Example:** See `examplePdfReport.ts` for working code

---

## Full Example

```typescript
import {
  wrapPdfTemplate,
  createPdfSection,
  createPdfTable,
  createPdfCard,
} from './pdfTemplateWrapper';
import { generateAndDownloadPdf } from './pdfGenerator';

export async function generateMyReport(data: MyData) {
  // Build sections
  const summary = createPdfSection({
    title: 'Summary',
    content: createPdfCard({
      style: 'highlight',
      content: `<p>${data.summary}</p>`,
    }),
  });

  const analysis = createPdfSection({
    title: 'Analysis',
    content: createPdfTable({
      headers: ['Item', 'Value'],
      rows: data.items.map(item => [item.name, item.value]),
    }),
    pageBreakBefore: true,
  });

  // Combine all sections
  const content = summary + analysis;

  // Wrap with template
  const html = wrapPdfTemplate(content, {
    title: 'My Report',
    projectName: data.projectName,
    generatedAt: new Date().toISOString(),
    showPageNumbers: true,
  });

  // Generate and download
  await generateAndDownloadPdf({
    htmlContent: html,
    filename: 'my_report',
    projectName: data.projectName,
  });
}
```

---

## API Reference

### `wrapPdfTemplate(content, options)`

| Option | Type | Description |
|--------|------|-------------|
| `title` | string | Document title |
| `projectName` | string | Project name (appears in footer) |
| `generatedAt` | string | ISO date string |
| `showPageNumbers` | boolean | Show page numbers (default: true) |
| `organisationLogoUrl` | string | Optional logo URL |
| `customCss` | string | Additional CSS |

### `createPdfSection(options)`

| Option | Type | Description |
|--------|------|-------------|
| `title` | string | Section title (optional) |
| `content` | string | HTML content |
| `pageBreakBefore` | boolean | Start new page (default: false) |
| `avoidBreak` | boolean | Keep together (default: true) |

### `createPdfTable(options)`

| Option | Type | Description |
|--------|------|-------------|
| `headers` | string[] | Column headers |
| `rows` | string[][] | Data rows |
| `caption` | string | Table caption (optional) |
| `zebra` | boolean | Striped rows (default: true) |

### `createPdfCard(options)`

| Option | Type | Description |
|--------|------|-------------|
| `title` | string | Card title (optional) |
| `content` | string | HTML content |
| `style` | 'default' \| 'highlight' \| 'warning' | Card style |

---

## Learn More

- **Full Guide:** `PDF_SYSTEM_GUIDE.md`
- **Example Code:** `examplePdfReport.ts`
- **Implementation Details:** `PDF_SYSTEM_IMPLEMENTATION.md`

---

**Need help?** Check the console for QA reports when generating PDFs.
