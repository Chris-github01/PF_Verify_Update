import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const { createClient } = await import("npm:@supabase/supabase-js@2.57.4");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: configData, error: configError } = await supabase
      .from("system_config")
      .select("value")
      .eq("key", "OPENAI_API_KEY")
      .maybeSingle();

    if (configError) {
      throw new Error(`Database error: ${configError.message}`);
    }

    const openaiApiKey = configData?.value || Deno.env.get("OPENAI_API_KEY");

    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({
          ok: false,
          configured: false,
          error: "OPENAI_API_KEY not configured in system_config table",
          message: "Please add your OpenAI API key in Admin > System Config",
          instructions: [
            "1. Go to /admin/system-config",
            "2. Get an API key from https://platform.openai.com/api-keys",
            "3. Paste it into the OPENAI_API_KEY field",
            "4. Click Save Configuration"
          ]
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    console.log('[Test LLM Parser] Testing OpenAI API connection...');

    const testResponse = await fetch("https://api.openai.com/v1/models", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
      },
    });

    if (!testResponse.ok) {
      const errorText = await testResponse.text();
      return new Response(
        JSON.stringify({
          ok: false,
          configured: true,
          error: `OpenAI API error: ${testResponse.status}`,
          message: testResponse.status === 401
            ? "API key is invalid or expired. Please update it in Admin > System Config"
            : `OpenAI API returned error: ${errorText}`,
          apiKeyPrefix: openaiApiKey.substring(0, 10) + "..."
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const modelsData = await testResponse.json();
    const gpt4Available = modelsData.data?.some((m: any) => m.id.includes('gpt-4'));
    const modelCount = modelsData.data?.length || 0;

    console.log('[Test LLM Parser] ✓ OpenAI API connection successful');
    console.log(`[Test LLM Parser] Models available: ${modelCount}`);
    console.log(`[Test LLM Parser] GPT-4 available: ${gpt4Available}`);

    return new Response(
      JSON.stringify({
        ok: true,
        configured: true,
        message: "OpenAI API is configured and working correctly",
        modelCount,
        gpt4Available,
        apiKeyPrefix: openaiApiKey.substring(0, 10) + "...",
        status: "All systems ready for LLM-based quote parsing"
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );

  } catch (error) {
    console.error('[Test LLM Parser] Error:', error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: "Failed to test LLM parser configuration"
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});