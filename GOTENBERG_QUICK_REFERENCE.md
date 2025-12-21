# Gotenberg Quick Reference

Quick commands and code snippets for working with Gotenberg PDF generation.

## Setup Commands

### Deploy Gotenberg (Docker)
```bash
docker run -d \
  --name gotenberg \
  --restart=unless-stopped \
  -p 3000:3000 \
  -e GOTENBERG_CHROMIUM_AUTO_START=true \
  -e GOTENBERG_CHROMIUM_MAX_QUEUE_SIZE=50 \
  gotenberg/gotenberg:8
```

### Configure Supabase
```bash
# Set Gotenberg URL
supabase secrets set GOTENBERG_URL=https://your-gotenberg-domain

# Deploy edge function
supabase functions deploy generate_pdf_gotenberg

# Verify deployment
supabase functions list
```

### Local Development
```bash
# Add to .env
echo "GOTENBERG_URL=https://your-gotenberg-domain" >> .env
```

## Code Snippets

### Generate PDF (Simple)
```typescript
import { generateAndDownloadPdf } from '../lib/reports/pdfGenerator';

await generateAndDownloadPdf({
  htmlContent: '<html><body><h1>My Report</h1></body></html>',
  filename: 'MyReport'
});
```

### Generate PDF (Full Options)
```typescript
await generateAndDownloadPdf({
  htmlContent: reportHtml,
  filename: `AwardReport_${projectName}`,
  projectName: 'Project Alpha',
  contractNumber: 'C-2024-001',
  reportType: 'Tender Award Analysis'
});
```

### Check Gotenberg Health
```typescript
import { checkGotenbergHealth, getHealthStatusDisplay } from '../lib/reports/gotenbergHealth';

// Get health status
const health = await checkGotenbergHealth();
console.log(health);
// { available: true, message: "...", responseTime: 234 }

// Get display-friendly status
const status = getHealthStatusDisplay(health);
console.log(status.title); // "PDF Service Online"
console.log(status.description); // "Responding in 234ms"
```

### Add Print CSS
```typescript
import { PDF_PRINT_STYLES, injectPdfStyles } from '../lib/reports/pdfStyles';

// Option 1: Manual injection
const html = `
<html>
<head>
  <style>${PDF_PRINT_STYLES}</style>
</head>
<body>${content}</body>
</html>
`;

// Option 2: Using helper
const html = injectPdfStyles(reportHtml, 'pdf');
```

## HTML Classes

### Prevent Page Breaks
```html
<div class="avoid-break">
  <h2>Section Title</h2>
  <p>This content will stay together on the same page</p>
</div>
```

### Force Page Break
```html
<div class="page-break">
  <h1>This starts on a new page</h1>
</div>
```

### Table Handling
```html
<table>
  <thead>
    <tr><th>Column 1</th><th>Column 2</th></tr>
  </thead>
  <tbody>
    <tr class="avoid-break">
      <td>Row data</td><td>More data</td>
    </tr>
  </tbody>
</table>
```

## Testing Commands

### Test Gotenberg Health
```bash
curl https://your-gotenberg-domain/health
# Expected: {"status":"up"}
```

### Test PDF Generation (curl)
```bash
curl --request POST \
  --url https://your-gotenberg-domain/forms/chromium/convert/html \
  --form files=@test.html \
  --form paperWidth=8.27 \
  --form paperHeight=11.69 \
  --form printBackground=true \
  --output test.pdf
```

### Check Edge Function Logs
```bash
# Via Supabase CLI
supabase functions logs generate_pdf_gotenberg

# Or in Supabase Dashboard:
# Edge Functions → generate_pdf_gotenberg → Logs
```

## Environment Variables

### Supabase Edge Function
```bash
GOTENBERG_URL=https://your-gotenberg-domain
```

### Gotenberg Container
```bash
GOTENBERG_CHROMIUM_AUTO_START=true
GOTENBERG_CHROMIUM_MAX_QUEUE_SIZE=50
GOTENBERG_LOG_LEVEL=INFO
```

## Common Issues & Fixes

### Issue: "GOTENBERG_URL not set"
```bash
supabase secrets set GOTENBERG_URL=https://your-gotenberg-domain
supabase functions deploy generate_pdf_gotenberg
```

### Issue: Timeouts
```typescript
// In edge function index.ts, increase timeout:
const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minutes
```

### Issue: Poor PDF Quality
```html
<!-- Add to HTML head -->
<style>
  * {
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }
</style>
```

### Issue: Page Breaks in Wrong Places
```html
<!-- Prevent breaks -->
<div class="avoid-break">Content</div>

<!-- Force breaks -->
<div class="page-break">New Section</div>
```

## Monitoring

### Health Check Loop
```typescript
// Run every 5 minutes
setInterval(async () => {
  const health = await checkGotenbergHealth();
  if (!health.available) {
    console.error('PDF service down:', health.error);
    // Alert team
  }
}, 5 * 60 * 1000);
```

### Edge Function Metrics
```sql
-- Query Supabase logs
SELECT
  timestamp,
  event_message,
  metadata->>'reportType' as report_type,
  metadata->>'responseTime' as response_time
FROM edge_function_logs
WHERE function_name = 'generate_pdf_gotenberg'
  AND timestamp > NOW() - INTERVAL '24 hours'
ORDER BY timestamp DESC;
```

## PDF Styling Best Practices

### Page Setup
```css
@page {
  size: A4;
  margin: 12mm;
}
```

### Print Colors
```css
* {
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}
```

### Page Breaks
```css
.avoid-break {
  break-inside: avoid;
  page-break-inside: avoid;
}

.page-break {
  break-before: page;
  page-break-before: always;
}
```

### Tables
```css
table {
  break-inside: auto;
  width: 100%;
}

thead {
  display: table-header-group;
}

tr {
  break-inside: avoid;
}
```

## Deployment Checklist

- [ ] Deploy Gotenberg service
- [ ] Verify health endpoint: `curl https://your-gotenberg-domain/health`
- [ ] Set `GOTENBERG_URL` in Supabase
- [ ] Deploy edge function: `supabase functions deploy generate_pdf_gotenberg`
- [ ] Update `.env` for local development
- [ ] Test PDF generation
- [ ] Verify PDF output quality
- [ ] Set up monitoring/alerts

## Support

- **Documentation**: See `GOTENBERG_PDF_SETUP.md` and `GOTENBERG_DEPLOYMENT.md`
- **Gotenberg Docs**: https://gotenberg.dev/docs/getting-started/introduction
- **Edge Function Logs**: Supabase Dashboard → Edge Functions → Logs
- **Health Check**: Use `checkGotenbergHealth()` utility

## Quick Links

| Resource | Link |
|----------|------|
| Gotenberg Health | `https://your-gotenberg-domain/health` |
| Edge Function | `https://your-supabase.co/functions/v1/generate_pdf_gotenberg` |
| Supabase Dashboard | `https://app.supabase.com` |
| Edge Function Logs | Dashboard → Edge Functions → Logs |

---

**TIP**: Bookmark this page for quick reference during development!
