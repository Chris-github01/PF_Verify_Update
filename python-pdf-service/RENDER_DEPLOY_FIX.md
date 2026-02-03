# CRITICAL: Fix Render Deployment

## Problem
- Service runs out of memory (512MB = FREE tier)
- No open ports detected (gunicorn not binding correctly)

## Solution: Upgrade to Starter Plan + Use Correct Start Command

### Step 1: Wait for Files to Sync
**Wait 2 minutes** for Git auto-commit to push:
- `start.sh` (new startup script)
- `render.yaml` (updated config)

### Step 2: Verify/Upgrade Plan
1. Go to https://dashboard.render.com/
2. Find service: `pdf-parser-ensemble`
3. Click **Settings** tab
4. Under **Instance Type**, check if it says:
   - ❌ **"Free"** (512MB) - THIS IS THE PROBLEM
   - ✅ **"Starter"** (2GB) - THIS IS CORRECT

5. **If it says "Free"**, change it:
   - Click the dropdown under **Instance Type**
   - Select **"Starter"** ($7/month, 2GB RAM)
   - Click **"Save Changes"**

### Step 3: Deploy with Correct Settings
1. Cancel any running deploy
2. Click **"Manual Deploy"** dropdown
3. Select **"Clear build cache & deploy"**
4. Click **Deploy**

### Step 4: Verify Logs
Watch the logs for these SUCCESS indicators:
```
==> Starting PDF Parser Service on port 10000
[INFO] Listening at: http://0.0.0.0:10000
Service is live
```

### Step 5: Test
```bash
curl https://verify-pdf-extractor.onrender.com/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "pdf-parser-ensemble",
  "parsers": {
    "pdfplumber": true,
    "pymupdf": true
  }
}
```

## Why This Fixes It

1. **Starter Plan (2GB)**: PDF parsing requires more than 512MB memory
2. **New start.sh**: Properly binds to Render's PORT environment variable
3. **Preload flag**: Loads app before forking (reduces memory per worker)
4. **Worker optimization**: Uses 1 worker to stay within memory limits

## What Changed

**render.yaml**:
- Changed `env: python` → `runtime: python` (correct syntax)
- Changed `startCommand: ./start.sh` → `startCommand: bash start.sh` (explicit)
- Added `--no-cache-dir` to pip install (saves space)

**start.sh**:
- Explicit PORT binding with debugging output
- Memory-optimized gunicorn flags
- Preload app to reduce memory footprint
