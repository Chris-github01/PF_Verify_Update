import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface EmailRequest {
  email: string;
  name: string;
  company: string;
  token: string;
  password?: string;
  type: 'welcome' | 'reactivation';
}

function generateWelcomeEmail(name: string, company: string, token: string, password: string, email: string): string {
  const appUrl = Deno.env.get("APP_URL") || "https://app.passivefireverify.com";
  const accessUrl = `${appUrl}/demo-login?token=${token}`;

  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
    .header h1 { margin: 0; font-size: 28px; }
    .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
    .button { display: inline-block; background: #667eea; color: white; padding: 14px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
    .credentials { background: white; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0; border-radius: 4px; }
    .feature { margin: 15px 0; padding-left: 25px; position: relative; }
    .feature:before { content: '✓'; position: absolute; left: 0; color: #667eea; font-weight: bold; }
    .limit-warning { background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 6px; margin: 20px 0; }
    .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🔥 PassiveFire Verify+</h1>
    <p>Your Demo Access is Ready!</p>
  </div>
  
  <div class="content">
    <h2>Hi ${name},</h2>
    
    <p>Welcome to PassiveFire Verify+! Your demo account for <strong>${company}</strong> has been created successfully.</p>
    
    <p><strong>See how Verify+ transforms quote auditing:</strong></p>
    <div class="feature">Automatically audits and normalizes supplier quotes</div>
    <div class="feature">Catches scope gaps and pricing inconsistencies</div>
    <div class="feature">Generates award recommendations in minutes</div>
    <div class="feature">Creates professional comparison reports</div>
    
    <div style="text-align: center;">
      <a href="${accessUrl}" class="button">Access Your Demo Dashboard</a>
    </div>
    
    <div class="credentials">
      <strong>🔐 Alternative Login (if magic link expires):</strong><br>
      Email: <code>${email}</code><br>
      Password: <code>${password}</code><br>
      <em>You can change your password after first login</em>
    </div>
    
    <div class="limit-warning">
      <strong>⚠️ Demo Limits:</strong><br>
      Your demo account can upload and process up to <strong>2 quotes</strong>. This lets you experience the full power of Verify+ with real quote data.<br><br>
      Ready for unlimited access? Upgrade to Pro for unlimited quotes, team collaboration, and advanced features.
    </div>
    
    <h3>Getting Started (2 minutes):</h3>
    <ol>
      <li>Click the access button above to log in instantly</li>
      <li>Upload 1-2 supplier quotes (PDF or Excel format)</li>
      <li>Watch Verify+ automatically normalize and compare them</li>
      <li>Generate your first award recommendation report</li>
    </ol>
    
    <p><strong>Need help?</strong> Our team is here to guide you through your demo:<br>
    📧 Email: <a href="mailto:support@passivefireverify.com">support@passivefireverify.com</a><br>
    📞 Phone: +64 3 2466 8605</p>
    
    <p><em>Your demo access expires in 7 days. The magic link above is valid until then.</em></p>
    
    <p>Ready to revolutionize your quote auditing process?</p>
    
    <p>Best regards,<br>
    <strong>The PassiveFire Verify+ Team</strong></p>
  </div>
  
  <div class="footer">
    <p>© 2025 PassiveFire Verify+ | Precision Procurement Tools</p>
    <p>This email was sent to ${email} because you requested a demo.</p>
  </div>
</body>
</html>
  `.trim();
}

function generateReactivationEmail(name: string, company: string, token: string): string {
  const appUrl = Deno.env.get("APP_URL") || "https://app.passivefireverify.com";
  const accessUrl = `${appUrl}/demo-login?token=${token}`;

  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
    .button { display: inline-block; background: #667eea; color: white; padding: 14px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
    .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Welcome Back to Verify+!</h1>
  </div>
  <div class="content">
    <h2>Hi ${name},</h2>
    <p>Your demo account for <strong>${company}</strong> has been reactivated.</p>
    <div style="text-align: center;">
      <a href="${accessUrl}" class="button">Access Your Demo</a>
    </div>
    <p>This access link is valid for 7 days.</p>
    <p>Questions? Email <a href="mailto:support@passivefireverify.com">support@passivefireverify.com</a></p>
  </div>
</body>
</html>
  `.trim();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { email, name, company, token, password, type }: EmailRequest = await req.json();

    const htmlContent = type === 'welcome' 
      ? generateWelcomeEmail(name, company, token, password || '', email)
      : generateReactivationEmail(name, company, token);

    const subject = type === 'welcome'
      ? '🔥 Your PassiveFire Verify+ Demo Access is Ready!'
      : '🔥 Your PassiveFire Verify+ Demo Has Been Reactivated';

    // Send email via EmailJS
    const EMAILJS_SERVICE_ID = Deno.env.get('EMAILJS_SERVICE_ID');
    const EMAILJS_TEMPLATE_ID = Deno.env.get('EMAILJS_TEMPLATE_ID');
    const EMAILJS_PUBLIC_KEY = Deno.env.get('EMAILJS_PUBLIC_KEY');
    const EMAILJS_PRIVATE_KEY = Deno.env.get('EMAILJS_PRIVATE_KEY');

    if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY) {
      console.warn('⚠️ EmailJS not configured - logging email instead');
      console.log('===== EMAIL TO SEND =====');
      console.log('To:', email);
      console.log('Subject:', subject);
      console.log('HTML:', htmlContent);
      console.log('========================');

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Email logged (EmailJS not configured)',
          recipient: email
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const emailJSPayload = {
      service_id: EMAILJS_SERVICE_ID,
      template_id: EMAILJS_TEMPLATE_ID,
      user_id: EMAILJS_PUBLIC_KEY,
      template_params: {
        to_email: email,
        to_name: name,
        subject: subject,
        html_content: htmlContent,
        company: company,
        reply_to: 'support@passivefireverify.com'
      }
    };

    // If private key is available, add it for server-side authentication
    if (EMAILJS_PRIVATE_KEY) {
      (emailJSPayload as any).accessToken = EMAILJS_PRIVATE_KEY;
    }

    console.log('📧 Sending email via EmailJS...');
    console.log('To:', email);
    console.log('Service ID:', EMAILJS_SERVICE_ID);
    console.log('Template ID:', EMAILJS_TEMPLATE_ID);
    console.log('Has Private Key:', !!EMAILJS_PRIVATE_KEY);

    const emailJSResponse = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailJSPayload)
    });

    const responseText = await emailJSResponse.text();
    console.log('EmailJS Response Status:', emailJSResponse.status);
    console.log('EmailJS Response:', responseText);

    if (!emailJSResponse.ok) {
      console.error('EmailJS error:', responseText);
      throw new Error(`Failed to send email via EmailJS: ${emailJSResponse.status} - ${responseText}`);
    }

    console.log('✅ Email sent successfully to:', email);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Email sent successfully',
        recipient: email
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error('Email error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || "Failed to send email"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});