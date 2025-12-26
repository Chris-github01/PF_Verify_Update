# Pre-let Appendix PDF Export - Issue Diagnosis & Fix

## What Was Fixed

### 1. Improved Error Handling (src/pages/ContractManager.tsx)
Previously, the error from the edge function was being swallowed. Now it properly throws and displays the actual error message from the server.

**Changed:**
- Edge function errors are now logged with `console.error()` and thrown
- The actual error message from the server is displayed to the user
- Better debugging with console logs showing HTML generation success/failure

### 2. Pricing Basis Clauses (supabase/functions/export_contract_manager/contractPrintEngine.ts)
Added complete pricing basis clause generation for Pre-let Appendix documents.

**Features:**
- 7 different pricing basis types with detailed clauses
- Clauses only appear when a pricing basis is selected
- Professional contract-ready language
- Properly integrated into document flow

## Current Issue

The error message **"Failed to generate Pre-let Appendix: Failed to generate Pre-let Appendix HTML content"** indicates the edge function is failing to return HTML.

### Possible Causes:

1. **Edge Function Not Deployed** (Most Likely)
   - The changes to `contractPrintEngine.ts` are in the edge function code
   - Edge functions need to be deployed separately from the frontend
   - The deployed version may not have the latest changes

2. **Data Structure Issue**
   - The Pre-let Appendix data might be incomplete or malformed
   - Missing required fields: `inclusions`, `exclusions`, `pricing_basis`, etc.

3. **Runtime Error in Edge Function**
   - A JavaScript error during HTML generation
   - Will now be visible in the error message with improved error handling

## How to Diagnose

### Step 1: Check Browser Console
After the improved error handling, the browser console will now show:
```
Edge function returned error: { error: "actual error message from server" }
```

This will tell you the exact error from the edge function.

### Step 2: Check Edge Function Logs
If using Supabase Dashboard:
1. Go to Functions
2. Find `export_contract_manager` function
3. Check the logs for any errors
4. Look for `[PRELET]` tagged log messages

### Step 3: Verify Data
Check that the Pre-let Appendix has been saved with:
- Scope summary
- Inclusions/Exclusions
- Pricing basis selected
- Appendix is finalised (`is_finalised = true`)

## Edge Function Deployment

### For Supabase CLI:
```bash
supabase functions deploy export_contract_manager
```

### For Supabase Dashboard:
Edge functions may auto-deploy from git, but check:
1. Functions > export_contract_manager
2. Verify last deployment timestamp
3. Redeploy if needed

## Testing After Fix

1. **Clear Browser Cache** - Ensure you're running the latest frontend code
2. **Check Console** - Open browser DevTools (F12) before clicking "Download Appendix PDF"
3. **Try Generation** - Click the button and check:
   - Console logs for success message: "Pre-let Appendix HTML generated successfully"
   - Or error message with actual server error
4. **Verify PDF** - If successful, PDF should download automatically

## Expected Flow

```
User clicks "Download Appendix PDF"
  ↓
Frontend calls edge function: export_contract_manager (mode: 'prelet_appendix')
  ↓
Edge function fetches Pre-let Appendix data from database
  ↓
Edge function generates HTML using contractPrintEngine.ts
  ↓
Edge function returns: { html: "..." }
  ↓
Frontend calls generateAndDownloadPdf() with HTML content
  ↓
PDF generated via Gotenberg and downloaded to user's device
```

## Files Changed

1. **src/pages/ContractManager.tsx** (line 3553-3565)
   - Improved error handling
   - Better logging
   - Properly throws edge function errors

2. **supabase/functions/export_contract_manager/contractPrintEngine.ts** (lines 1261-1460)
   - Added pricing basis clause generator
   - Updated pricingBasisLabels mapping
   - Integrated clause injection into Pre-let Appendix HTML

3. **supabase/migrations/add_pricing_basis_feature.sql**
   - Added pricing_basis enum field to projects table
   - Added ps_pc_validation_warnings field
   - Additive, non-breaking changes

## Next Steps

1. **Try Again** - With improved error handling, the actual error will now be visible
2. **Check Logs** - Review browser console and edge function logs
3. **Verify Deployment** - Ensure edge function is deployed with latest changes
4. **Report Back** - Share the actual error message from the console for further debugging

## Contact Points for Support

- Edge Function Logs: Supabase Dashboard → Functions → export_contract_manager
- Frontend Errors: Browser DevTools → Console (F12)
- Database Issues: Check prelet_appendix table for data completeness
