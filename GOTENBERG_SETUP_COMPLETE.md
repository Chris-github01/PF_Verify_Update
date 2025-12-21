# Gotenberg Setup Complete

Your Gotenberg PDF service is configured and ready to use!

## Current Configuration

- **Gotenberg URL**: `https://gotenberg-8-h9vu.onrender.com`
- **Health Status**: Healthy (Chromium + LibreOffice operational)
- **Edge Function**: `generate_pdf_gotenberg` (deployed)
- **Supabase URL**: `https://fkhozhrxeofudpfwziyj.supabase.co`

## Important: Set Supabase Secret

The edge function is deployed, but you need to set the `GOTENBERG_URL` secret in Supabase:

### Option 1: Via Supabase Dashboard (Recommended)

1. Go to https://supabase.com/dashboard/project/fkhozhrxeofudpfwziyj/settings/functions
2. Click on "Edge Functions" in the left sidebar
3. Click on "Manage secrets"
4. Add a new secret:
   - **Name**: `GOTENBERG_URL`
   - **Value**: `https://gotenberg-8-h9vu.onrender.com`
5. Click "Save"

### Option 2: Via Supabase CLI

If you have the Supabase CLI installed and logged in:

```bash
supabase secrets set GOTENBERG_URL=https://gotenberg-8-h9vu.onrender.com
```

## Test Your Setup

### Quick Test in Browser

Open the test file in your browser:

```bash
open test-gotenberg-integration.html
```

Or navigate to it in your project files and open it with a browser.

The test page includes:
1. **Direct Health Check**: Tests Gotenberg service directly
2. **Edge Function Test**: Verifies the edge function is working
3. **PDF Generation Test**: Creates and downloads a test PDF

### Test in Your App

Once the secret is set, test from your application's browser console:

```javascript
// Test health check
const response = await fetch('https://gotenberg-8-h9vu.onrender.com/health');
const health = await response.json();
console.log('Health:', health);
// Expected: { status: "up", ... }

// Test PDF generation via edge function
const pdfResponse = await fetch(
  'https://fkhozhrxeofudpfwziyj.supabase.co/functions/v1/generate_pdf_gotenberg',
  {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      htmlContent: '<h1>Test PDF</h1><p>This is a test.</p>',
      filename: 'test',
      projectName: 'Test Project'
    })
  }
);

if (pdfResponse.ok) {
  const blob = await pdfResponse.blob();
  console.log('PDF generated:', blob.size, 'bytes');
  // Download the PDF
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'test.pdf';
  a.click();
}
```

## How PDF Generation Works

1. **Frontend**: Calls the edge function with HTML content
2. **Edge Function**: Receives HTML and authenticates user
3. **Gotenberg**: Converts HTML to PDF with proper styling
4. **Response**: Returns PDF file to frontend
5. **Download**: Browser downloads the PDF

## Expected Behavior

### First Request (Cold Start)
- **Time**: 30-60 seconds
- **Reason**: Render free tier spins down after 15 min idle
- **Status**: Normal for free tier

### Subsequent Requests
- **Time**: 1-3 seconds
- **Status**: Fast and responsive

## Performance Optimization

### Keep Service Warm (Optional)

To avoid cold starts, ping the health endpoint every 10 minutes:

```bash
# Add to crontab
*/10 * * * * curl -s https://gotenberg-8-h9vu.onrender.com/health > /dev/null
```

Or use a free service like:
- **UptimeRobot**: https://uptimerobot.com
- **Cron-Job.org**: https://cron-job.org

### Upgrade Render Plan

For production use without cold starts:
- **Starter Plan**: $7/month
- **Benefits**: No cold starts, 512MB RAM, always-on

## Troubleshooting

### "GOTENBERG_URL environment variable not set"

**Cause**: Secret not configured in Supabase

**Fix**: Set the secret via dashboard or CLI (see above)

### "Authentication failed"

**Cause**: Invalid or missing auth token

**Fix**: Ensure you're logged in and using a valid session token

### "Gotenberg API error: 500"

**Cause**: Gotenberg service error

**Fix**:
1. Check Gotenberg health: `curl https://gotenberg-8-h9vu.onrender.com/health`
2. Wait 30-60 seconds if cold start
3. Check Render logs for errors

### PDF not downloading

**Cause**: Edge function error or network issue

**Fix**:
1. Check browser console for errors
2. Verify edge function logs in Supabase dashboard
3. Test with the test HTML file

## Next Steps

1. ✅ Gotenberg service deployed and healthy
2. ✅ Edge function deployed
3. ⏳ **Set GOTENBERG_URL secret in Supabase** (do this now!)
4. ⏳ Test with test-gotenberg-integration.html
5. ⏳ Test PDF generation in your app
6. ⏳ (Optional) Set up health check pinging
7. ⏳ (Optional) Upgrade Render plan for production

## Support Resources

- **Gotenberg Docs**: https://gotenberg.dev
- **Supabase Edge Functions**: https://supabase.com/docs/guides/functions
- **Render Docs**: https://render.com/docs

## Success Checklist

- [x] Gotenberg service deployed on Render
- [x] Health check returns `{"status":"up"}`
- [x] Edge function deployed to Supabase
- [x] Local .env file updated
- [ ] GOTENBERG_URL secret set in Supabase
- [ ] Test page confirms working integration
- [ ] PDF downloads successfully from app

Once all items are checked, your PDF generation system is fully operational!
