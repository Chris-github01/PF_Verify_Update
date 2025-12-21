#!/bin/bash

# Gotenberg Configuration Script for Supabase

echo "🚀 Configuring Gotenberg for VerifyTrade..."
echo ""

# Set the Gotenberg URL in Supabase secrets
echo "📝 Setting GOTENBERG_URL in Supabase..."
supabase secrets set GOTENBERG_URL=https://gotenberg-8-h9vu.onrender.com

echo ""
echo "📦 Deploying generate_pdf_gotenberg edge function..."
supabase functions deploy generate_pdf_gotenberg

echo ""
echo "✅ Configuration complete!"
echo ""
echo "🧪 To test, run:"
echo "   curl https://your-supabase-url/functions/v1/generate_pdf_gotenberg \\"
echo "     -H 'Authorization: Bearer YOUR_ANON_KEY' \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"htmlContent\":\"<html><body><h1>Test</h1></body></html>\",\"filename\":\"test\"}'"
echo ""
echo "📋 Or use the health check utility in your app:"
echo "   import { checkGotenbergHealth } from './src/lib/reports/gotenbergHealth';"
echo "   const health = await checkGotenbergHealth();"
echo ""
