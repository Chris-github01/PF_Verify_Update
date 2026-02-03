# Two-Step Deployment Plan (512MB → 2GB)

## Problem
You're stuck on **Starter (512MB)** but need **Standard (2GB)** for PDF parsing. Render won't let you upgrade until a deploy succeeds.

## Solution: Bootstrap → Upgrade → Full Deploy

### STEP 1: Deploy Minimal Bootstrap (on 512MB)

**Current Status:** Files are committed and ready:
- `app_minimal.py` - Ultra-lightweight Flask app (just health check)
- `requirements-bootstrap.txt` - Only Flask + gunicorn (no PDF libraries)
- `render.yaml` - Updated to use minimal bootstrap

**Action:**
1. Go to Render dashboard
2. Click **"Manual Deploy"** → **"Clear build cache & deploy"**
3. Wait 2-3 minutes for deploy to complete

**Expected Result:**
```
✓ Build successful
✓ Deploy successful
==> Service is live at https://verify-pdf-extractor.onrender.com
```

Test it:
```bash
curl https://verify-pdf-extractor.onrender.com/health
```

Response:
```json
{
  "status": "healthy",
  "service": "pdf-parser-ensemble",
  "version": "1.0.0-minimal",
  "mode": "bootstrap"
}
```

---

### STEP 2: Upgrade Instance Type

Once Step 1 deploys successfully:

1. Go to **Settings** tab in Render
2. Find **Instance Type** section
3. Change from **"Starter (512MB)"** → **"Standard (2GB)"**
4. Click **"Save Changes"**

✅ **This will work now because the last deploy succeeded**

---

### STEP 3: Deploy Full Version (on 2GB)

Now that you have 2GB of RAM, deploy the full PDF parser:

**Update these files** (or I can do it):

**render.yaml:**
```yaml
services:
  - type: web
    name: pdf-parser-ensemble
    runtime: python
    region: oregon
    plan: standard  # Changed from starter
    buildCommand: pip install --no-cache-dir -r requirements.txt  # Changed from bootstrap
    startCommand: bash start.sh  # Changed from minimal
    envVars:
      - key: API_KEY
        generateValue: true
      - key: PYTHON_VERSION
        value: "3.11"
      - key: MAX_FILE_SIZE_MB
        value: "10"
      - key: ENABLE_MEMORY_OPTIMIZATION
        value: "true"
```

**Deploy:**
1. Click **"Manual Deploy"** → **"Clear build cache & deploy"**
2. Wait 5-7 minutes (installing PDF libraries takes longer)

**Expected Result:**
```bash
curl https://verify-pdf-extractor.onrender.com/health
```

Response:
```json
{
  "status": "healthy",
  "service": "pdf-parser-ensemble",
  "version": "1.0.0",
  "parsers": {
    "pdfplumber": true,
    "pymupdf": true
  }
}
```

---

## Summary

| Step | Action | Memory | Status |
|------|--------|--------|--------|
| 1 | Deploy bootstrap app | 512MB | ✅ Will succeed (minimal deps) |
| 2 | Upgrade instance type | 512MB → 2GB | ✅ Allowed after successful deploy |
| 3 | Deploy full app | 2GB | ✅ Will succeed (enough memory) |

---

## Current Status: Step 1 Ready

All files are committed. Just click **"Manual Deploy"** in Render to proceed.
