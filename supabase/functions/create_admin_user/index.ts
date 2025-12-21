import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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
    // SECURITY: Require authentication from existing platform admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Authentication required" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const token = authHeader.replace("Bearer ", "");

    // Create client with service role for admin operations
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

    // Verify the caller is authenticated
    const { data: { user: caller }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !caller) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid token" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Verify the caller is an active platform admin
    const { data: callerAdmin, error: adminCheckError } = await supabase
      .from('platform_admins')
      .select('id, is_active')
      .eq('user_id', caller.id)
      .eq('is_active', true)
      .single();

    if (adminCheckError || !callerAdmin) {
      return new Response(
        JSON.stringify({ error: "Forbidden: Platform admin access required" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { email, password, name } = await req.json();

    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: "Email and password are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check if user already exists
    const { data: { users: existingUsers } } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers.find(u => u.email?.toLowerCase() === email.toLowerCase());

    if (existingUser) {
      // Update password for existing user
      const { data: updatedUser, error: updateError } = await supabase.auth.admin.updateUserById(
        existingUser.id,
        { password }
      );

      if (updateError) {
        throw new Error(`Failed to update password: ${updateError.message}`);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Password updated successfully",
          userId: existingUser.id,
          email: existingUser.email
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create new user
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: email.toLowerCase(),
      password: password,
      email_confirm: true,
      user_metadata: {
        full_name: name || email.split('@')[0],
      }
    });

    if (authError || !authUser.user) {
      throw new Error(`Failed to create user: ${authError?.message}`);
    }

    // Make them a platform admin
    const { error: adminError } = await supabase
      .from('platform_admins')
      .insert({
        user_id: authUser.user.id,
        email: email.toLowerCase(),
        full_name: name || email.split('@')[0],
        status: 'active'
      });

    if (adminError) {
      throw new Error(`Failed to add platform admin role: ${adminError.message}`);
    }

    // Log security event
    await supabase.rpc('log_security_event', {
      p_event_type: 'admin_creation',
      p_severity: 'critical',
      p_action: 'create_platform_admin',
      p_resource_type: 'platform_admins',
      p_resource_id: authUser.user.id,
      p_details: {
        created_by: caller.email,
        new_admin_email: email.toLowerCase(),
        new_admin_id: authUser.user.id
      }
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: "Platform admin created successfully",
        userId: authUser.user.id,
        email: authUser.user.email
      }),
      {
        status: 201,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || "Failed to process request",
        details: error.toString()
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});