#!/bin/bash

# Deploy the fixed export_contract_manager edge function
# This script uses Supabase CLI if available

echo "Deploying export_contract_manager edge function with fixes..."

# Check if supabase CLI is available
if command -v supabase &> /dev/null; then
    echo "Supabase CLI found. Deploying..."
    cd supabase/functions && supabase functions deploy export_contract_manager --no-verify-jwt=false
else
    echo "Supabase CLI not found. Please deploy manually via Supabase Dashboard:"
    echo "1. Go to https://supabase.com/dashboard/project/_/functions"
    echo "2. Select 'export_contract_manager' function"
    echo "3. Update the function code with the files from supabase/functions/export_contract_manager/"
    echo ""
    echo "Key files to update:"
    echo "- index.ts (main entry point)"
    echo "- generators.ts (wrapper functions)"
    echo "- contractPrintEngine.ts (CONTAINS THE FIX)"
    echo "- pdfHeaderFooter.ts (header/footer utilities)"
    echo "- pdfThemes.ts (theme configuration)"
fi
