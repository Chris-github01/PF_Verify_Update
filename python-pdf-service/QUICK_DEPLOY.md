# Quick Deploy to Render.com

## Option 1: One-Click Deploy with render.yaml

1. **Push to GitHub**:
   ```bash
   cd python-pdf-service
   git init
   git add .
   git commit -m "PDF parser service"
   git push origin main
   ```

2. **Deploy on Render**:
   - Go to https://dashboard.render.com
   - Click "New +" → "Blueprint"
   - Connect your GitHub repository
   - Render will automatically detect `render.yaml`
   - Click "Apply"
   - Copy the generated API_KEY from environment variables

## Option 2: Manual Deploy (If Blueprint Doesn't Work)

1. **Go to Render Dashboard**: https://dashboard.render.com

2. **Create New Web Service**:
   - Click "New +" → "Web Service"
   - Connect GitHub or choose "Public Git repository"

3. **Configure Service**:
   - **Name**: `pdf-parser-ensemble`
   - **Region**: Choose closest to you
   - **Branch**: `main`
   - **Root Directory**: Leave blank (or `python-pdf-service` if repo includes parent)
   - **Runtime**: `Python 3`
   - **Build Command**:
     ```
     pip install -r requirements.txt
     ```
   - **Start Command**:
     ```
     gunicorn --bind 0.0.0.0:$PORT --workers 4 --timeout 120 app:app
     ```

4. **Add Environment Variables**:
   - Click "Environment" tab
   - Add: `API_KEY` = `generate-random-key-here` (use strong random string)
   - Add: `PORT` = `5000`

5. **Deploy**:
   - Click "Create Web Service"
   - Wait 5-10 minutes for build
   - Your service will be at: `https://pdf-parser-ensemble-xxxx.onrender.com`

## Option 3: Deploy Without Git

If you can't use Git, use Render's CLI:

```bash
# Install Render CLI
npm install -g render-cli

# Login
render login

# Create service
render services create web \
  --name pdf-parser-ensemble \
  --env python \
  --region oregon \
  --plan free \
  --build-command "pip install -r requirements.txt" \
  --start-command "gunicorn --bind 0.0.0.0:\$PORT --workers 4 --timeout 120 app:app"
```

## After Deployment

### 1. Test the Service

```bash
# Replace with your actual URL
SERVICE_URL="https://pdf-parser-ensemble-xxxx.onrender.com"

# Test health endpoint (no auth needed)
curl $SERVICE_URL/health

# Expected response:
# {"status":"healthy","service":"pdf-parser-ensemble",...}
```

### 2. Get Your API Key

From Render dashboard:
- Go to your service
- Click "Environment"
- Find `API_KEY` value
- Copy it (you'll need it for Supabase)

### 3. Configure Supabase

In Supabase SQL Editor, run:

```sql
-- Add API key to system_config
INSERT INTO system_config (key, value, description, is_sensitive)
VALUES (
  'PYTHON_PARSER_API_KEY',
  'your-api-key-from-render',
  'API key for Python PDF parser service',
  true
) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

### 4. Add Service URL to Supabase

In Supabase Dashboard:
- Go to Project Settings → Edge Functions
- Add environment variable:
  - Key: `PYTHON_PARSER_SERVICE_URL`
  - Value: `https://pdf-parser-ensemble-xxxx.onrender.com`

### 5. Test Full Integration

```bash
# Get your Supabase URL and anon key
SUPABASE_URL="https://your-project.supabase.co"
ANON_KEY="your-supabase-anon-key"

# Test the edge function
curl -X POST $SUPABASE_URL/functions/v1/parse_quote_ensemble \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@test.pdf" \
  -F "projectId=00000000-0000-0000-0000-000000000000" \
  -F "supplierName=Test"
```

## Troubleshooting

### Build Fails: "No module named 'pdfplumber'"

**Fix**: Check that `requirements.txt` is in the root directory and build command is correct.

### Service Starts but Health Check Fails

**Fix**:
1. Check Render logs (Dashboard → Logs)
2. Make sure PORT is set to 5000
3. Verify gunicorn command is correct

### "Tesseract not found" Error

**Fix**: Add to Dockerfile instead (Render free tier doesn't include Tesseract).

For OCR support, use Docker deployment:
1. Build: `docker build -t pdf-parser .`
2. Deploy to Render using Docker runtime instead of Python

### API Key Not Working

**Fix**:
1. Verify API key matches between Render and Supabase
2. Check request includes `X-API-Key` header
3. Check Render logs for authentication errors

### Render Free Tier Limitations

- Service spins down after 15 min of inactivity
- First request after spin-down takes 30-60 seconds
- 750 hours/month free (enough for 1 service)

**Solution**: Upgrade to paid plan ($7/month) for always-on service.

## Quick Reference

### Service URLs
- Health: `GET /health` (no auth)
- Ensemble: `POST /parse/ensemble` (requires auth)
- Auto: `POST /parse/auto` (requires auth)

### Required Headers
```
X-API-Key: your-api-key
Content-Type: multipart/form-data
```

### Request Body
```
file: PDF file (multipart form data)
parsers: pdfplumber,pymupdf,ocr (optional)
```

### Response Format
```json
{
  "best_result": {...},
  "all_results": [...],
  "consensus_items": [...],
  "confidence_breakdown": {
    "overall": 0.85,
    "parsers_succeeded": 2,
    "parsers_attempted": 3,
    "best_parser": "pdfplumber"
  },
  "recommendation": "HIGH_CONFIDENCE_MULTI_PARSER"
}
```

## Need Help?

- Check Render logs: Dashboard → Your Service → Logs
- Check Supabase logs: Dashboard → Edge Functions → Logs
- Test health endpoint first to verify service is running
- Use curl to test API directly before testing through app
