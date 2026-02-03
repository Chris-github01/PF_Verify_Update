# Render Deployment Fix

## Problem
Render build fails with "Port scan timeout" because OCR parser requires system dependencies (Tesseract, Poppler) not available in Python runtime.

## Solution: Use Minimal Requirements

### Option 1: Quick Fix (Use Minimal Requirements)

1. **In Render Dashboard**:
   - Go to: https://dashboard.render.com/
   - Select: `verify-pdf-extractor`
   - Click: "Settings"
   - Find: "Build Command"
   - Change to: `pip install -r requirements-minimal.txt`
   - Click: "Save Changes"
   - Click: "Manual Deploy" → "Deploy latest commit"

This installs only pdfplumber and PyMuPDF (no system dependencies needed).

### Option 2: Use Docker (Full Features)

To use all parsers including OCR, you need Docker deployment:

1. **Create Dockerfile** (already exists in repo)
2. **In Render Dashboard**:
   - Create new "Web Service"
   - Choose "Docker" runtime (not Python)
   - Point to Dockerfile
   - Deploy

### Option 3: Disable OCR Parser in Code

If you need to keep the current build command, modify `parsers/ensemble_coordinator.py`:

```python
# Comment out OCR parser import
# from parsers.ocr_parser import OCRParser

# In parse_with_ensemble method, skip OCR:
available_parsers = {
    'pdfplumber': PDFPlumberParser,
    'pymupdf': PyMuPDFParser,
    # 'ocr': OCRParser,  # Disabled - requires Tesseract
}
```

## Testing After Deploy

```bash
# Test health endpoint
curl https://verify-pdf-extractor.onrender.com/health

# Expected response
{
  "status": "healthy",
  "service": "pdf-parser-ensemble",
  "parsers": {
    "pdfplumber": true,
    "pymupdf": true,
    "ocr": false
  }
}
```

## Why This Fixes It

The error "No open ports detected" happens because:
1. Flask app tries to import all parser modules on startup
2. OCR parser imports `pytesseract`
3. `pytesseract` requires Tesseract binary (not installed)
4. Import fails → App crashes → No port binding → Timeout

By using minimal requirements or disabling OCR, the app starts successfully and binds to port.

## Performance Impact

**With minimal requirements** (pdfplumber + PyMuPDF):
- ✅ Works for 95% of quotes
- ✅ Handles tables, text, layouts
- ✅ Fast startup (no heavy dependencies)
- ❌ Can't handle scanned/image PDFs

**With Docker** (all parsers):
- ✅ Handles all PDF types including scanned
- ✅ OCR for image-based documents
- ❌ Larger image size
- ❌ Slower cold starts
