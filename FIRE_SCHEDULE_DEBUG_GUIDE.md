# Fire Schedule Parser - Debug Guide

## 🐛 Enhanced Logging Added

I've added comprehensive logging to help identify the issue. Here's how to debug:

## 📋 How to Check Logs

### 1. Browser Console (Frontend Logs)

1. Open your browser's Developer Tools (F12 or Right-click → Inspect)
2. Go to the **Console** tab
3. Upload a fire schedule PDF
4. Look for these log messages:

```
✓ Expected logs if working:
- "Calling edge function: https://..."
- "PDF size: XXXXX bytes (base64)"
- "Project ID: ..."
- "Sending request with payload: ..."
- "Parse result received: { success: true, rows: [...] }"
- "Successfully parsed X rows"

❌ Error logs if failing:
- "Edge function error response: 500 ..."
- "Parse failed: ..."
- "Error parsing PDF: ..."
```

### 2. Supabase Edge Function Logs (Backend Logs)

1. Go to https://supabase.com/dashboard
2. Select your project
3. Navigate to **Edge Functions** → **parse_fire_schedule**
4. Click **Logs** tab
5. Look for these messages:

```
✓ Expected logs if working:
- "Incoming request: POST https://..."
- "Parsing request body..."
- "Request body parsed, keys: ..."
- "✓ Valid request - Parsing fire schedule: ..."
- "PDF size: XXXXX bytes (base64)"
- "Step 1: Attempting professional Render PDF parser..."
- "✓ Render parser succeeded" OR "✗ Render parser unavailable - using fallback"
- "Step 2: Sending to OpenAI GPT-4 LMM (PRIMARY INTELLIGENCE)..."
- "Sending XXXXX characters to OpenAI GPT-4 LMM for intelligent parsing..."
- "✓ Success: X rows, XX.X% confidence via ..."

❌ Error logs if failing:
- "Missing required fields. pdfBase64: false/true projectId: false/true"
- "Render parser error (will use fallback): ..."
- "Fallback extraction error: ..."
- "OpenAI API error: ..."
- "Error parsing fire schedule: ..."
```

## 🔍 Common Issues & Solutions

### Issue: "Missing required fields"
**Cause:** Request not sending pdfBase64 or projectId
**Solution:** Check browser console for payload being sent

### Issue: "Failed to extract text from PDF"
**Cause:** PDF is image-based (scanned) or corrupted
**Solution:**
- Ensure PDF contains selectable text (not a scanned image)
- Try re-exporting the PDF
- Use OCR preprocessing if available

### Issue: "OpenAI API error: 401"
**Cause:** OPENAI_API_KEY not configured in Supabase
**Solution:** Contact admin to verify OpenAI API key is set in Supabase secrets

### Issue: "OpenAI API error: 429"
**Cause:** Rate limit or quota exceeded
**Solution:** Wait a few minutes or check OpenAI billing

### Issue: "Render parser failed: 401"
**Cause:** RENDER_PDF_EXTRACTOR_API_KEY not configured
**Solution:** This is OK - fallback will be used automatically

### Issue: "Network error" or timeout
**Cause:** Large PDF or slow connection
**Solution:**
- Try a smaller PDF first
- Check internet connection
- Wait up to 60 seconds for processing

## 🧪 Testing Steps

1. **Test with simple PDF first**
   - Upload a small fire schedule PDF (< 5 pages)
   - Check console logs
   - Verify it reaches the edge function

2. **Check Supabase configuration**
   - Verify VITE_SUPABASE_URL is correct in .env
   - Verify VITE_SUPABASE_ANON_KEY is correct in .env
   - Verify edge function is deployed

3. **Check API keys (Admin only)**
   - OpenAI API key must be set in Supabase secrets
   - Render API key is optional (fallback will work)

4. **Monitor both logs**
   - Browser console for frontend errors
   - Supabase edge function logs for backend errors

## 📞 What to Report

If the issue persists, please provide:

1. **Browser console logs** (screenshot or copy-paste)
2. **Supabase edge function logs** (screenshot or copy-paste)
3. **PDF details:**
   - File size
   - Number of pages
   - Is it text-based or scanned?
4. **Which step fails:**
   - Does request reach edge function?
   - Does Render parser work?
   - Does fallback extraction work?
   - Does OpenAI call work?

## 🎯 Expected Behavior

**Normal Flow:**
1. User uploads PDF → Frontend converts to base64
2. Frontend calls edge function with base64 + projectId
3. Edge function tries Render parser (may succeed or fail)
4. Edge function uses fallback if Render fails
5. Edge function calls OpenAI GPT-4 with extracted data
6. OpenAI returns structured JSON with rows
7. Frontend displays preview table
8. User confirms → Rows saved to Supabase

**Total time:** 10-30 seconds depending on PDF size

## 🔧 Quick Fixes

### If you see "Failed to parse PDF" immediately:
- Check browser console for the actual error
- Look for CORS errors (should be handled)
- Verify edge function is deployed and accessible

### If it hangs/loading forever:
- Check Supabase dashboard for edge function status
- Large PDFs may take 30-60 seconds
- Check browser network tab for failed requests

### If OpenAI fails but Render works:
- Check OpenAI API key in Supabase secrets
- Check OpenAI billing/quota
- Fallback should still work for text extraction
