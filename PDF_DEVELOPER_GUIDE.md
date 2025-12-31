# 📘 PDF LAYOUT SYSTEM - DEVELOPER GUIDE

## 🎯 **Quick Start**

### **Generate a PDF (Simple)**

```typescript
import { generatePdfWithGotenberg } from '@/lib/reports/pdfGenerator';

await generatePdfWithGotenberg({
  htmlContent: '<h2>My Report</h2><p>Content here...</p>',
  filename: 'my-report',
  projectName: 'Project ABC',
  reportType: 'Custom Report',
});
```

That's it! The system handles everything:
- Layout, margins, typography
- Headers/footers with page numbers
- Smart page breaks
- QA validation

---

## 🏗️ **System Architecture**

```
HTML Template
     ↓
cleanLegacyPaginationArtifacts()  ← Remove old .page divs
     ↓
preparePdfContent()                ← QA checks
     ↓
wrapContentWithLayout()           ← Apply deterministic CSS
     ↓
validatePDFLayout()               ← Check for issues
     ↓
Gotenberg Edge Function
     ↓
Professional PDF ✅
```

---

## 📝 **Creating PDF Templates**

### **✅ DO THIS:**

```html
<!-- Semantic HTML, natural flow -->
<h2>Financial Summary</h2>
<div class="section-card avoid-break">
  <h3>Details</h3>
  <table>
    <thead><tr><th>Item</th><th>Value</th></tr></thead>
    <tbody>
      <tr><td>Total</td><td>$500,000</td></tr>
    </tbody>
  </table>
</div>
```

### **❌ DON'T DO THIS:**

```html
<!-- Manual pagination (automatically removed) -->
<div class="page">
  <footer class="pdf-footer" style="position: fixed;">
    Page <span class="page-number"></span>
  </footer>
</div>
<div style="page-break-after: always;"></div>
```

---

## 🎨 **Available CSS Classes**

```css
.avoid-break         /* Prevent page breaks inside */
.allow-break-before  /* Allow page break before if needed */
.page-break          /* Force page break before */
.section-card        /* Styled container */
.system-card         /* Styled container */
.info-box            /* Blue info box */
.warning-box         /* Yellow warning box */
```

---

## 📐 **Typography Scale**

| Element | Size | Usage |
|---------|------|-------|
| H1 | 46pt | Main titles |
| H2 | 28pt | Section headers |
| H3 | 20pt | Subsection headers |
| H4 | 16pt | Card titles |
| Body | 11pt | Paragraph text |
| Caption | 9pt | Small text |
| Footer | 8pt | Footer text |

**Spacing:** XS:8px, SM:16px, MD:24px, LG:32px, XL:48px

---

## 🐛 **Debugging**

```typescript
// In pdfGenerator.ts, add:
const validation = validatePDFLayout(layoutHtml);
console.log('[PDF] Warnings:', validation.warnings);
console.log('[PDF] HTML preview:', layoutHtml.substring(0, 1000));

// To inspect HTML before PDF generation:
const blob = new Blob([layoutHtml], { type: 'text/html' });
window.open(URL.createObjectURL(blob));
```

---

## 📍 **Key Files**

```
src/lib/reports/pdfLayoutSystem.ts          ← Core system (NEW)
src/lib/reports/pdfGenerator.ts             ← Generator (UPDATED)
supabase/functions/generate_pdf_gotenberg/  ← Edge function (UPDATED)
```

---

## 🆘 **Common Issues**

| Issue | Solution |
|-------|----------|
| Blank page numbers | Check Gotenberg is running |
| Duplicate headers | Old CSS being used - check cleaning function |
| Orphan headings | Add `break-after: avoid` to headings |
| Split tables | Add `break-before: auto` to table sections |

---

**Quick Reference:** See `PDF_LAYOUT_QUICK_REFERENCE.md` for detailed examples
**Complete Guide:** See `PDF_LAYOUT_FIX_COMPLETE.md` for full documentation
