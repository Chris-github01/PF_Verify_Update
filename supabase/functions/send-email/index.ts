import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Resend } from "npm:resend@4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) {
      console.error("[send-email] RESEND_API_KEY is not configured");
      return jsonResponse({ success: false, error: "Email service is not configured" }, 500);
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
    }

    if (
      typeof body !== "object" ||
      body === null ||
      !("to" in body) ||
      !("subject" in body) ||
      !("html" in body)
    ) {
      return jsonResponse(
        { success: false, error: "Missing required fields: to, subject, html" },
        400
      );
    }

    const { to, subject, html } = body as { to: unknown; subject: unknown; html: unknown };

    if (
      (typeof to !== "string" && !Array.isArray(to)) ||
      typeof subject !== "string" ||
      typeof html !== "string"
    ) {
      return jsonResponse(
        { success: false, error: "Invalid field types: to must be string or array, subject and html must be strings" },
        400
      );
    }

    if (!subject.trim() || !html.trim()) {
      return jsonResponse(
        { success: false, error: "Fields subject and html must not be empty" },
        400
      );
    }

    const toAddresses = Array.isArray(to) ? to : [to];
    if (toAddresses.length === 0) {
      return jsonResponse({ success: false, error: "Field to must not be empty" }, 400);
    }

    const resend = new Resend(apiKey);

    const { data, error } = await resend.emails.send({
      from: "VerifyTrade <noreply@mail.verifytrade.co.nz>",
      to: toAddresses,
      subject,
      html,
    });

    if (error) {
      console.error("[send-email] Resend API error:", error.message);
      return jsonResponse({ success: false, error: "Failed to send email" }, 502);
    }

    return jsonResponse({ success: true, id: data?.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[send-email] Unexpected error:", message);
    return jsonResponse({ success: false, error: "Internal server error" }, 500);
  }
});
