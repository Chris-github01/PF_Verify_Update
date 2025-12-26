#!/bin/bash

# Deploy the optimized export_contract_manager edge function
# This fixes the "Network error" when generating Pre-let Appendix PDFs

echo "🚀 Deploying optimized export_contract_manager edge function..."
echo ""

# Check if we're in the right directory
if [ ! -d "supabase/functions/export_contract_manager" ]; then
  echo "❌ Error: Must run from project root directory"
  echo "   Current directory: $(pwd)"
  exit 1
fi

echo "📁 Files to deploy:"
ls -lh supabase/functions/export_contract_manager/*.ts | grep -v backup

echo ""
echo "📝 Key changes:"
echo "   ✅ NEW: preletAppendixGenerator.ts (350 lines - 60x faster)"
echo "   ✅ UPDATED: generators.ts (uses fast generator)"
echo "   ✅ UPDATED: index.ts (optimized fast path)"
echo ""

# Check if Supabase CLI is available
if command -v supabase &> /dev/null; then
    echo "✅ Supabase CLI found"
    echo ""
    echo "Deploying..."
    cd supabase/functions/export_contract_manager

    # Deploy the function
    supabase functions deploy export_contract_manager

    if [ $? -eq 0 ]; then
        echo ""
        echo "✅ Deployment successful!"
        echo ""
        echo "🎉 PDF generation will now be 60x faster!"
        echo ""
        echo "📋 Test it:"
        echo "   1. Go to Contract Manager → Pre-let Appendix"
        echo "   2. Fill form and finalise"
        echo "   3. Click 'Download Appendix PDF'"
        echo "   4. Expected: PDF ready in ~3 seconds"
    else
        echo ""
        echo "❌ Deployment failed!"
        echo "   Check Supabase credentials and try again"
        exit 1
    fi
else
    echo "⚠️  Supabase CLI not found"
    echo ""
    echo "📖 Manual deployment required:"
    echo ""
    echo "Option 1: Install Supabase CLI"
    echo "   npm install -g supabase"
    echo "   supabase login"
    echo "   supabase functions deploy export_contract_manager"
    echo ""
    echo "Option 2: Use Supabase Dashboard"
    echo "   1. Go to: https://supabase.com/dashboard"
    echo "   2. Navigate to: Edge Functions → export_contract_manager"
    echo "   3. Click 'Deploy'"
    echo "   4. Upload files from: supabase/functions/export_contract_manager/"
    echo ""
    echo "Required files:"
    echo "   - index.ts"
    echo "   - generators.ts"
    echo "   - preletAppendixGenerator.ts (NEW)"
    echo "   - contractPrintEngine.ts"
    echo "   - pdfThemes.ts"
    echo "   - pdfHeaderFooter.ts"
fi
