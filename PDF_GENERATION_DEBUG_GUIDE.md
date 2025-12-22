# PDF Generation Debug Guide

**Issue**: PDF generation shows "Failed to fetch" error

**Date**: December 22, 2025

---

## Current Error

```
Failed to generate Site Team Pack: Failed to fetch
```

This error means the browser's `fetch()` call is failing before receiving a response from the edge function.

---

## Possible Causes

### 1. Edge Function Not Deployed
The edge function might not be deployed to Supabase.

**Test**:
```bash
# Check if function is deployed
supabase functions list

# Expected output should include:
# - export_contract_manager
```

**Fix**:
```bash
# Deploy the function
supabase functions deploy export_contract_manager
```

### 2. Edge Function URL Wrong
The frontend might be calling the wrong URL.

**Check**: In browser console, look for the fetch URL:
```
Should be: https://[project-ref].supabase.co/functions/v1/export_contract_manager
```

**Fix**: Verify `VITE_SUPABASE_URL` in `.env` file

### 3. CORS Issue
The edge function might not be sending proper CORS headers.

**Check**: Browser console will show CORS error if this is the issue

**Already Fixed**: Edge function has CORS headers:
```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};
```

### 4. Edge Function Crashing on Import
The edge function might crash when trying to import `contractPrintEngine.ts`

**Test**: Check Supabase function logs:
```bash
supabase functions logs export_contract_manager --follow
```

Look for import errors or syntax errors.

### 5. TypeScript Compilation Error
The `.ts` files might have syntax that Deno doesn't support.

**Check**: Look for:
- Browser-specific APIs (window, document, etc.)
- Node.js-specific imports
- Unsupported TypeScript features

---

## Debugging Steps

### Step 1: Test Edge Function Manually

Use curl to test the function directly:

```bash
# Replace with your actual values
SUPABASE_URL="https://your-project.supabase.co"
ANON_KEY="your-anon-key"
PROJECT_ID="your-project-id"

curl -X POST \
  "${SUPABASE_URL}/functions/v1/export_contract_manager" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"projectId\": \"${PROJECT_ID}\", \"mode\": \"junior_pack\"}"
```

**Expected response**:
```json
{
  "html": "<!DOCTYPE html>..."
}
```

**Error responses**:
- `{"error": "..."}`  - Function executed but failed
- No response - Function crashed or not deployed
- CORS error - CORS headers not working

### Step 2: Check Edge Function Logs

```bash
supabase functions logs export_contract_manager --follow
```

Then trigger the PDF generation from the UI.

Look for:
- Import errors
- Runtime errors
- Validation errors
- "Generating junior pack for: ..." log message

### Step 3: Check Browser Console

Open browser DevTools (F12) and go to Console tab.

Look for:
- Fetch URL
- Fetch error message
- Response status code
- Any CORS errors

### Step 4: Check Network Tab

In browser DevTools, go to Network tab:
1. Filter by "Fetch/XHR"
2. Click "Download PDF"
3. Find the `export_contract_manager` request
4. Check:
   - Status code (should be 200)
   - Response headers
   - Response body

---

## Recent Changes

### What Was Fixed (December 22, 2025)

1. **Copied files to edge function directory**:
   - `contractPrintEngine.ts`
   - `pdfThemes.ts`
   - `pdfHeaderFooter.ts`

2. **Updated import paths** in `generators.ts`:
   ```typescript
   // Before:
   import { generateContractPDF } from '../../../src/lib/reports/contractPrintEngine.ts';

   // After:
   import { generateContractPDF } from './contractPrintEngine.ts';
   ```

3. **Added error handling**:
   - Edge function now wraps HTML generation in try-catch
   - Frontend shows detailed error messages
   - Better error logging

---

## Known Working Configuration

The edge function **should** work with these files:

```
supabase/functions/export_contract_manager/
├── index.ts                    # Main edge function
├── generators.ts               # HTML generators
├── contractPrintEngine.ts      # ✅ Copied
├── pdfThemes.ts               # ✅ Copied
├── pdfHeaderFooter.ts         # ✅ Copied
```

**Import chain**:
```
index.ts
  → generators.ts
    → contractPrintEngine.ts
      → pdfThemes.ts
      → pdfHeaderFooter.ts
```

---

## Quick Fixes

### Fix 1: Redeploy Edge Function

If files were recently copied but function wasn't redeployed:

```bash
cd /tmp/cc-agent/60712569/project
supabase functions deploy export_contract_manager
```

### Fix 2: Check Environment Variables

Verify `.env` has correct values:
```
VITE_SUPABASE_URL=https://[your-project].supabase.co
VITE_SUPABASE_ANON_KEY=[your-anon-key]
```

### Fix 3: Clear Cache and Rebuild

```bash
# Clear build cache
rm -rf dist node_modules/.vite

# Rebuild
npm run build
```

---

## Error Message Improvements

The frontend now shows more detailed errors:

**Before**:
```
Failed to generate Site Team Pack: Failed to fetch
```

**After** (with updated code):
```
Failed to generate Site Team Pack: Failed to generate junior pack HTML: [actual error]
```

Or:
```
Failed to generate Site Team Pack: No HTML content received from server
```

Or:
```
Failed to generate Site Team Pack: Export failed with status 500
```

---

## Testing Checklist

After making changes:

- [ ] Edge function files copied to correct location
- [ ] Import paths updated in `generators.ts`
- [ ] Edge function deployed: `supabase functions deploy export_contract_manager`
- [ ] Frontend rebuilt: `npm run build`
- [ ] Browser cache cleared
- [ ] Test Site Team Pack download
- [ ] Test Senior Management Pack download
- [ ] Check browser console for errors
- [ ] Check edge function logs

---

## Next Steps

If the error persists after these changes:

1. **Check if edge function is actually deployed**
   - Run: `supabase functions list`
   - Should see `export_contract_manager` in the list

2. **Check edge function logs for actual error**
   - Run: `supabase functions logs export_contract_manager --follow`
   - Click "Download PDF"
   - Read the error message

3. **Test with curl** (see Step 1 above)
   - If curl works but UI doesn't → Frontend issue
   - If curl fails → Edge function issue

4. **Check for Deno-specific issues**
   - Deno doesn't support all Node.js/browser APIs
   - May need to replace incompatible code

---

## Contact Points

If you see specific error messages, they will help narrow down the issue:

| Error Message | Likely Cause | Solution |
|--------------|--------------|----------|
| "Failed to fetch" | Network/CORS/Not deployed | Check deployment |
| "Export failed with status 500" | Edge function crashed | Check logs |
| "No HTML content received" | Wrong response format | Check edge function response |
| "Failed to generate junior pack HTML" | HTML generation error | Check contractPrintEngine |
| Import error in logs | Missing file | Verify files copied |
| Syntax error in logs | Deno incompatibility | Fix incompatible code |

---

## Summary

The most likely issue is that the edge function wasn't redeployed after copying the new files. Deploy it and test again.

If that doesn't work, check the edge function logs to see the actual error message. The improved error handling should now show the real issue instead of generic "Failed to fetch".
