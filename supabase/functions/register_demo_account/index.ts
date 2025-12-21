import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface DemoRegistrationRequest {
  name: string;
  email: string;
  phone?: string;
  company: string;
  role?: string;
}

function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function generateUsername(email: string): string {
  const [localPart, domain] = email.split('@');
  const domainName = domain.split('.')[0];
  return `${localPart}-${domainName}`.toLowerCase().replace(/[^a-z0-9-]/g, '');
}

function generateSecureToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

function generatePassword(): string {
  // Use cryptographically secure random number generation
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
  const array = new Uint8Array(20);
  crypto.getRandomValues(array);
  return Array.from(array, byte => chars[byte % chars.length]).join('');
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    const { name, email, phone, company, role }: DemoRegistrationRequest = await req.json();

    // Validate inputs
    if (!name || !email || !company) {
      return new Response(
        JSON.stringify({ error: "Name, email, and company are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Sanitize text inputs to prevent XSS
    const sanitizedName = name.trim().slice(0, 100);
    const sanitizedCompany = company.trim().slice(0, 200);
    const sanitizedPhone = phone?.trim().slice(0, 50) || '';
    const sanitizedRole = role?.trim().slice(0, 100) || 'Demo User';

    // Validate lengths after sanitization
    if (sanitizedName.length === 0 || sanitizedCompany.length === 0) {
      return new Response(
        JSON.stringify({ error: "Name and company cannot be empty" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!validateEmail(email)) {
      return new Response(
        JSON.stringify({ error: "Invalid email address" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check if demo account already exists
    const { data: existingDemo } = await supabase
      .from('demo_accounts')
      .select('id, email, status')
      .eq('email', email.toLowerCase())
      .maybeSingle();

    if (existingDemo) {
      // If expired, we could reactivate it
      if (existingDemo.status === 'expired') {
        const newToken = generateSecureToken();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        await supabase
          .from('demo_accounts')
          .update({
            access_token: newToken,
            token_expires_at: expiresAt.toISOString(),
            status: 'active',
            last_accessed_at: new Date().toISOString()
          })
          .eq('id', existingDemo.id);

        // Send reactivation email
        await supabase.functions.invoke('send_demo_email', {
          body: {
            email: email.toLowerCase(),
            name,
            company,
            token: newToken,
            type: 'reactivation'
          }
        });

        return new Response(
          JSON.stringify({
            success: true,
            message: "Demo account reactivated! Check your email for access details.",
            email: email.toLowerCase()
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      return new Response(
        JSON.stringify({
          error: "An account with this email already exists. Please check your email for access details or contact support."
        }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check if auth user exists (orphaned from previous registration)
    // This handles cleanup of incomplete registrations
    const { data: { users: existingAuthUsers } } = await supabase.auth.admin.listUsers();
    const existingAuthUser = existingAuthUsers.find(u => u.email?.toLowerCase() === email.toLowerCase());

    if (existingAuthUser) {
      console.log('Cleaning up orphaned auth user:', existingAuthUser.id);
      await supabase.auth.admin.deleteUser(existingAuthUser.id);
    }

    // Generate credentials
    const username = generateUsername(email);
    const password = generatePassword();
    const accessToken = generateSecureToken();
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setDate(tokenExpiresAt.getDate() + 7);

    console.log('Creating demo user:', { email: email.toLowerCase(), username });

    // Create user in Supabase Auth
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: email.toLowerCase(),
      password: password,
      email_confirm: true,
      user_metadata: {
        full_name: sanitizedName,
        company: sanitizedCompany,
        role: sanitizedRole,
        is_demo: true
      }
    });

    if (authError || !authUser.user) {
      console.error('Auth creation error:', authError);
      throw new Error(`Failed to create user account: ${authError?.message}`);
    }

    console.log('User created:', authUser.user.id);

    // Create demo organization
    const { data: org, error: orgError } = await supabase
      .from('organisations')
      .insert({
        name: `${sanitizedCompany} (Demo)`,
        is_demo: true,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (orgError || !org) {
      console.error('Organisation creation error:', orgError);
      // Cleanup: delete the user if org creation fails
      await supabase.auth.admin.deleteUser(authUser.user.id);
      throw new Error(`Failed to create organization: ${orgError?.message}`);
    }

    console.log('Organisation created:', org.id);

    // Create demo account record
    const { data: demoAccount, error: demoError } = await supabase
      .from('demo_accounts')
      .insert({
        user_id: authUser.user.id,
        organisation_id: org.id,
        email: email.toLowerCase(),
        full_name: sanitizedName,
        phone: sanitizedPhone || null,
        company_name: sanitizedCompany,
        role: sanitizedRole,
        quotes_processed: 0,
        quote_limit: 2,
        access_token: accessToken,
        token_expires_at: tokenExpiresAt.toISOString(),
        status: 'active',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (demoError || !demoAccount) {
      console.error('Demo account creation error:', demoError);
      // Cleanup
      await supabase.from('organisations').delete().eq('id', org.id);
      await supabase.auth.admin.deleteUser(authUser.user.id);
      throw new Error(`Failed to create demo account: ${demoError?.message}`);
    }

    // Link demo account to organisation
    await supabase
      .from('organisations')
      .update({ demo_account_id: demoAccount.id })
      .eq('id', org.id);

    // Add user as organisation member
    await supabase
      .from('organisation_members')
      .insert({
        organisation_id: org.id,
        user_id: authUser.user.id,
        role: 'owner',
        status: 'active'
      });

    console.log('Demo account created successfully:', demoAccount.id);

    // Send welcome email with access link
    try {
      await supabase.functions.invoke('send_demo_email', {
        body: {
          email: email.toLowerCase(),
          name: sanitizedName,
          company: sanitizedCompany,
          token: accessToken,
          password,
          type: 'welcome'
        }
      });
    } catch (emailError) {
      console.error('Email sending error:', emailError);
      // Don't fail the registration if email fails
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Demo account created successfully! Check your email for access details.",
        email: email.toLowerCase(),
        organisationId: org.id,
        demoAccountId: demoAccount.id
      }),
      {
        status: 201,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error('Registration error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || "Failed to create demo account",
        details: error.toString()
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});