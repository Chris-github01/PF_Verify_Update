import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const EMAILJS_SERVICE_ID = Deno.env.get('EMAILJS_SERVICE_ID');
    const EMAILJS_TEMPLATE_ID = Deno.env.get('EMAILJS_TEMPLATE_ID');
    const EMAILJS_PUBLIC_KEY = Deno.env.get('EMAILJS_PUBLIC_KEY');
    const EMAILJS_PRIVATE_KEY = Deno.env.get('EMAILJS_PRIVATE_KEY');

    console.log('Environment variables check:');
    console.log('SERVICE_ID:', EMAILJS_SERVICE_ID ? '✅ Set' : '❌ Missing');
    console.log('TEMPLATE_ID:', EMAILJS_TEMPLATE_ID ? '✅ Set' : '❌ Missing');
    console.log('PUBLIC_KEY:', EMAILJS_PUBLIC_KEY ? '✅ Set' : '❌ Missing');
    console.log('PRIVATE_KEY:', EMAILJS_PRIVATE_KEY ? '✅ Set' : '❌ Missing');

    if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY) {
      return new Response(
        JSON.stringify({
          error: 'EmailJS not configured',
          details: {
            serviceId: !!EMAILJS_SERVICE_ID,
            templateId: !!EMAILJS_TEMPLATE_ID,
            publicKey: !!EMAILJS_PUBLIC_KEY,
            privateKey: !!EMAILJS_PRIVATE_KEY
          }
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const testEmail = {
      service_id: EMAILJS_SERVICE_ID,
      template_id: EMAILJS_TEMPLATE_ID,
      user_id: EMAILJS_PUBLIC_KEY,
      accessToken: EMAILJS_PRIVATE_KEY || undefined,
      template_params: {
        to_email: 'christopher.knight3@gmail.com',
        to_name: 'Christopher Knight',
        subject: '🧪 Test Email from PassiveFire Verify+',
        html_content: `
          <html>
            <body style="font-family: Arial, sans-serif; padding: 20px;">
              <h1 style="color: #667eea;">Test Email</h1>
              <p>This is a test email to verify EmailJS configuration.</p>
              <p>If you received this, EmailJS is working correctly!</p>
            </body>
          </html>
        `,
        company: 'Test Company',
        reply_to: 'support@passivefireverify.com'
      }
    };

    console.log('Sending test email to EmailJS...');
    console.log('Payload:', JSON.stringify(testEmail, null, 2));

    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testEmail)
    });

    const responseText = await response.text();
    console.log('EmailJS Response Status:', response.status);
    console.log('EmailJS Response Body:', responseText);

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'EmailJS API Error',
          status: response.status,
          message: responseText,
          advice: 'Check that your EmailJS template has these variables: to_email, to_name, subject, html_content (with triple braces {{{html_content}}}), company, reply_to'
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Test email sent successfully! Check christopher.knight3@gmail.com',
        emailjsResponse: responseText
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error('Test error:', error);
    return new Response(
      JSON.stringify({
        error: error.message || "Test failed",
        details: error.toString()
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});