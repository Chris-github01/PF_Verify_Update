import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PYTHON_PARSER_SERVICE_URL = Deno.env.get("PYTHON_PARSER_SERVICE_URL") || "https://your-python-service.onrender.com";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const projectId = formData.get("projectId") as string;
    const supplierName = formData.get("supplierName") as string;
    const parsersToUse = formData.get("parsers") as string || "pdfplumber,pymupdf,ocr";

    if (!file || !projectId || !supplierName) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: file, projectId, supplierName" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: apiKeyConfig } = await supabase
      .from("system_config")
      .select("value")
      .eq("key", "PYTHON_PARSER_API_KEY")
      .maybeSingle();

    const pythonApiKey = apiKeyConfig?.value;

    if (!pythonApiKey) {
      return new Response(
        JSON.stringify({
          error: "Python parser service not configured",
          instructions: "Add PYTHON_PARSER_API_KEY to system_config table"
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Calling Python ensemble parser service with parsers: ${parsersToUse}`);

    const pythonFormData = new FormData();
    pythonFormData.append("file", file);
    pythonFormData.append("parsers", parsersToUse);

    const response = await fetch(`${PYTHON_PARSER_SERVICE_URL}/parse/ensemble`, {
      method: "POST",
      headers: {
        "X-API-Key": pythonApiKey,
      },
      body: pythonFormData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Python parser service error (${response.status}):`, errorText);

      return new Response(
        JSON.stringify({
          error: "Python parser service unavailable",
          status: response.status,
          message: "The Python parser service is not responding. Please ensure it's deployed and the URL is configured correctly.",
          instructions: [
            "1. Deploy the Python service from python-pdf-service/ folder",
            "2. Add PYTHON_PARSER_SERVICE_URL environment variable to edge functions",
            "3. Add PYTHON_PARSER_API_KEY to system_config table"
          ]
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let ensembleResult;
    try {
      ensembleResult = await response.json();
    } catch (jsonError) {
      const responseText = await response.text();
      console.error("Failed to parse JSON response:", responseText);

      return new Response(
        JSON.stringify({
          error: "Invalid response from Python parser service",
          details: "Service returned non-JSON response. Check Python service logs.",
          responsePreview: responseText.substring(0, 200)
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(
      `Ensemble parsing complete: ${ensembleResult.confidence_breakdown.parsers_succeeded}/${ensembleResult.confidence_breakdown.parsers_attempted} parsers succeeded, ` +
      `overall confidence: ${(ensembleResult.confidence_breakdown.overall * 100).toFixed(1)}%`
    );

    const { data: ensembleRun, error: ensembleError } = await supabase
      .from("parsing_ensemble_runs")
      .insert({
        file_name: file.name,
        parsers_attempted: ensembleResult.confidence_breakdown.parsers_attempted,
        parsers_succeeded: ensembleResult.confidence_breakdown.parsers_succeeded,
        best_parser: ensembleResult.confidence_breakdown.best_parser,
        confidence_score: ensembleResult.confidence_breakdown.overall,
        cross_model_agreement: ensembleResult.confidence_breakdown.cross_model_agreement,
        recommendation: ensembleResult.recommendation,
        extraction_time_ms: ensembleResult.extraction_metadata.total_extraction_time_ms,
        results_json: ensembleResult.all_results,
        consensus_items_json: ensembleResult.consensus_items,
        metadata: {
          ...ensembleResult.extraction_metadata,
          project_id: projectId,
          supplier_name: supplierName,
        },
      })
      .select()
      .single();

    if (ensembleError) {
      console.error("Failed to store ensemble run:", ensembleError);
    } else {
      console.log(`Ensemble run stored with ID: ${ensembleRun?.id}`);
    }

    return new Response(
      JSON.stringify({
        ...ensembleResult,
        ensemble_run_id: ensembleRun?.id,
        project_id: projectId,
        supplier_name: supplierName,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Ensemble parsing failed:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Failed to parse document",
        details: error.toString(),
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
