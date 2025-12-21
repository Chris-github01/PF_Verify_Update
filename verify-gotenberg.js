#!/usr/bin/env node

/**
 * Gotenberg Configuration Verification Script
 * Tests the complete integration pipeline
 */

const SUPABASE_URL = 'https://fkhozhrxeofudpfwziyj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZraG96aHJ4ZW9mdWRwZnd6aXlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxMDE5ODQsImV4cCI6MjA3OTY3Nzk4NH0.AxKGg1BbAzRrD_0a2QxgMoGvNsusHo7-Cdcj49eGmWI';
const GOTENBERG_URL = 'https://gotenberg-8-h9vu.onrender.com';

console.log('🔍 Gotenberg Integration Verification\n');

async function testGotenbergHealth() {
  console.log('1️⃣ Testing Gotenberg service health...');
  try {
    const response = await fetch(`${GOTENBERG_URL}/health`);
    const data = await response.json();

    if (data.status === 'up') {
      console.log('   ✅ Gotenberg service is healthy');
      console.log(`   📊 Details: ${JSON.stringify(data)}\n`);
      return true;
    } else {
      console.log('   ❌ Gotenberg service is unhealthy');
      console.log(`   📊 Details: ${JSON.stringify(data)}\n`);
      return false;
    }
  } catch (error) {
    console.log(`   ❌ Failed to reach Gotenberg: ${error.message}\n`);
    return false;
  }
}

async function testEdgeFunction() {
  console.log('2️⃣ Testing Edge Function configuration...');

  const testHtml = `
    <div style="font-family: sans-serif; padding: 20px;">
      <h1>Configuration Test</h1>
      <p>If you see this as a PDF, Gotenberg is properly configured!</p>
    </div>
  `;

  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/generate_pdf_gotenberg`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          htmlContent: testHtml,
          filename: 'verification-test',
          projectName: 'Verification',
          reportType: 'Test'
        })
      }
    );

    if (response.ok) {
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/pdf')) {
        const blob = await response.arrayBuffer();
        console.log(`   ✅ Edge function working correctly`);
        console.log(`   📄 Generated PDF: ${blob.byteLength} bytes\n`);
        return true;
      } else {
        const text = await response.text();
        console.log(`   ⚠️  Unexpected response type: ${contentType}`);
        console.log(`   📄 Response: ${text.substring(0, 200)}...\n`);
        return false;
      }
    } else {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.log(`   ❌ Edge function error (${response.status})`);
      console.log(`   📄 Error: ${JSON.stringify(error, null, 2)}\n`);

      if (error.error && error.error.includes('GOTENBERG_URL')) {
        console.log('   💡 Tip: The GOTENBERG_URL secret may not be set.');
        console.log('   💡 Secrets should be automatically configured, but you can verify in:');
        console.log('   💡 https://supabase.com/dashboard/project/fkhozhrxeofudpfwziyj/settings/functions\n');
      }

      return false;
    }
  } catch (error) {
    console.log(`   ❌ Request failed: ${error.message}\n`);
    return false;
  }
}

async function main() {
  const healthOk = await testGotenbergHealth();
  const edgeFunctionOk = await testEdgeFunction();

  console.log('═══════════════════════════════════════');
  console.log('📋 Summary:');
  console.log('═══════════════════════════════════════');
  console.log(`Gotenberg Service: ${healthOk ? '✅ Healthy' : '❌ Unhealthy'}`);
  console.log(`Edge Function:     ${edgeFunctionOk ? '✅ Working' : '❌ Not Working'}`);
  console.log('═══════════════════════════════════════\n');

  if (healthOk && edgeFunctionOk) {
    console.log('🎉 All systems operational! Gotenberg is fully configured.');
    console.log('   You can now generate PDFs in your application.\n');
    process.exit(0);
  } else {
    console.log('⚠️  Configuration incomplete. Please check the errors above.\n');

    if (healthOk && !edgeFunctionOk) {
      console.log('🔧 Next steps:');
      console.log('   1. Verify GOTENBERG_URL secret is set in Supabase');
      console.log('   2. Check edge function logs in Supabase dashboard');
      console.log('   3. Redeploy edge function if needed\n');
    }

    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ Verification failed:', error);
  process.exit(1);
});
