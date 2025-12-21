# Test Gotenberg Integration

Your Gotenberg service is live at: **https://gotenberg-8-h9vu.onrender.com**

## Step 1: Configure Supabase

Run these commands:

```bash
# Set the Gotenberg URL
supabase secrets set GOTENBERG_URL=https://gotenberg-8-h9vu.onrender.com

# Deploy the edge function
supabase functions deploy generate_pdf_gotenberg

# Verify it's deployed
supabase functions list
```

Or use the provided script:

```bash
./CONFIGURE_GOTENBERG.sh
```

## Step 2: Test the Service

### Test 1: Direct Gotenberg Test

```bash
curl https://gotenberg-8-h9vu.onrender.com/health
```

Expected response:
```json
{"status":"up"}
```

✅ **Result**: Working! Service is healthy.

### Test 2: Simple PDF Generation

```bash
echo '<html><body><h1>Test PDF</h1></body></html>' > test.html

curl --request POST \
  --url https://gotenberg-8-h9vu.onrender.com/forms/chromium/convert/html \
  --form files=@test.html \
  --form paperWidth=8.27 \
  --form paperHeight=11.69 \
  --form printBackground=true \
  --output test.pdf

# Check the file
ls -lh test.pdf
```

This should create a small PDF file (a few KB).

### Test 3: Test via Edge Function (after deploying)

```bash
# Get your Supabase URL and anon key from .env
SUPABASE_URL="https://fkhozhrxeofudpfwziyj.supabase.co"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

curl --request POST \
  --url "$SUPABASE_URL/functions/v1/generate_pdf_gotenberg" \
  --header "Authorization: Bearer $ANON_KEY" \
  --header "Content-Type: application/json" \
  --data '{
    "htmlContent": "<html><body><h1>Test Report</h1><p>This is a test PDF generated via Gotenberg.</p></body></html>",
    "filename": "test_report",
    "projectName": "Test Project",
    "reportType": "Test Report"
  }' \
  --output test_via_edge_function.pdf

# Check the file
ls -lh test_via_edge_function.pdf
```

### Test 4: Test from Frontend (in Browser Console)

After deploying the edge function, open your app and run in the browser console:

```javascript
// Import the health check utility
import { checkGotenbergHealth, getHealthStatusDisplay } from './src/lib/reports/gotenbergHealth';

// Check health
const health = await checkGotenbergHealth();
console.log('Health:', health);

// Get display status
const status = getHealthStatusDisplay(health);
console.log('Status:', status);

// Expected output:
// Health: { available: true, message: "Gotenberg service is healthy", responseTime: 234 }
// Status: { status: 'healthy', color: 'green', icon: '✓', title: 'PDF Service Online', description: 'Responding in 234ms' }
```

### Test 5: Generate Actual PDF from App

1. Go to any report page (Award Report, Contract Manager, etc.)
2. Click "Download PDF" button
3. PDF should download automatically
4. Verify:
   - PDF opens correctly
   - Layout matches expectations
   - Header/footer present
   - Page breaks work correctly
   - Colors preserved

## Troubleshooting

### Issue: "GOTENBERG_URL not set"

**Cause**: Environment variable not configured in Supabase

**Fix**:
```bash
supabase secrets set GOTENBERG_URL=https://gotenberg-8-h9vu.onrender.com
```

### Issue: Edge function not found

**Cause**: Function not deployed

**Fix**:
```bash
supabase functions deploy generate_pdf_gotenberg
```

### Issue: Authentication error

**Cause**: Missing or invalid auth token

**Fix**: Ensure you're logged in:
```bash
supabase login
```

### Issue: Timeout

**Cause**: Render free tier may have cold starts

**Fix**: Wait 30-60 seconds and try again. First request after idle will be slower.

## Performance Notes

### Render.com Free Tier

Your Gotenberg instance is on Render's free tier:
- ⚠️ **Cold starts**: Service spins down after 15 minutes of inactivity
- ⏱️ **First request**: May take 30-60 seconds to wake up
- ⚡ **Subsequent requests**: Fast (1-3 seconds)

### Recommendations

For production use:
1. **Upgrade to Starter plan ($7/month)**: No cold starts
2. **Add health check pinging**: Keep service warm
3. **Monitor uptime**: Set up alerts for downtime

### Keep Service Warm (Optional)

Add a cron job to ping the health endpoint:

```bash
# crontab -e
*/10 * * * * curl -s https://gotenberg-8-h9vu.onrender.com/health > /dev/null
```

Or use a service like UptimeRobot (free) to ping every 5 minutes.

## Success Criteria

- [x] Gotenberg health endpoint responds with `{"status":"up"}`
- [ ] Supabase secret `GOTENBERG_URL` is set
- [ ] Edge function `generate_pdf_gotenberg` is deployed
- [ ] Direct PDF generation works (Test 2)
- [ ] Edge function PDF generation works (Test 3)
- [ ] Frontend health check works (Test 4)
- [ ] PDF download from app works (Test 5)

## Next Steps

Once all tests pass:

1. **Update README**: Document the Gotenberg URL for your team
2. **Set up monitoring**: Add health checks to your monitoring system
3. **Test all PDF flows**: Award reports, site packs, management reports
4. **Consider upgrading**: If you need consistent performance, upgrade Render plan

## Support

If you encounter issues:
1. Check Gotenberg logs: https://dashboard.render.com (your service logs)
2. Check Supabase logs: Dashboard → Edge Functions → `generate_pdf_gotenberg` → Logs
3. Review documentation: `GOTENBERG_PDF_SETUP.md`
