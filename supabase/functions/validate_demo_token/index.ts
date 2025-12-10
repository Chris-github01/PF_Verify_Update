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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { token } = await req.json();

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Token is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data, error } = await supabase
      .from('demo_accounts')
      .select('id, user_id, email, organisation_id, status, token_expires_at')
      .eq('access_token', token)
      .maybeSingle();

    if (error || !data) {
      return new Response(
        JSON.stringify({
          valid: false,
          message: 'Invalid or expired demo access token'
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const isExpired = new Date(data.token_expires_at) < new Date();
    const isActive = data.status === 'active';

    if (isExpired || !isActive) {
      await supabase
        .from('demo_accounts')
        .update({ status: 'expired' })
        .eq('id', data.id);

      return new Response(
        JSON.stringify({
          valid: false,
          message: 'Demo access has expired'
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    await supabase
      .from('demo_accounts')
      .update({ last_accessed_at: new Date().toISOString() })
      .eq('id', data.id);

    return new Response(
      JSON.stringify({
        valid: true,
        email: data.email,
        user_id: data.user_id,
        organisation_id: data.organisation_id
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error('Token validation error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || "Failed to validate token"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});