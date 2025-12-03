import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    if (!openaiKey) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "OPENAI_API_KEY not configured",
          message: "Please add your OpenAI API key in Project Settings → Edge Functions → Secrets"
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

    const response = await fetch("https://api.openai.com/v1/models", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
      },
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Failed to connect to OpenAI API",
          message: "Invalid API key or network error"
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

    const data = await response.json();
    const gpt4Available = data.data?.some((m: any) => m.id.includes("gpt-4"));

    return new Response(
      JSON.stringify({
        ok: true,
        message: "OpenAI API connection successful",
        modelCount: data.data?.length || 0,
        gpt4Available
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: error.message || "Unknown error",
        message: "Failed to test OpenAI connection"
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
});