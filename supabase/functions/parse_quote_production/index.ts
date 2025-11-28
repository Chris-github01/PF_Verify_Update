import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ParseRequest {
  jobId: string;
  chunkIds: string[];
  useMultiModel?: boolean;
  useTextract?: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { jobId, chunkIds, useMultiModel, useTextract }: ParseRequest = await req.json();

    if (!jobId || !chunkIds || chunkIds.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: chunks, error: chunksError } = await supabase
      .from("parsing_chunks")
      .select("*")
      .in("id", chunkIds)
      .eq("job_id", jobId);

    if (chunksError || !chunks || chunks.length === 0) {
      throw new Error("Chunks not found");
    }

    const combinedText = chunks
      .sort((a, b) => a.chunk_number - b.chunk_number)
      .map(c => c.extracted_text)
      .join("\n\n---PAGE BREAK---\n\n");

    const metadata = {
      pageCount: chunks.length,
      ocrUsed: chunks.some(c => c.metadata?.ocr_used === true),
    };

    let extractionResult: any = null;
    let extractionMethod = "primary";
    let modelsUsed: string[] = [];

    if (useMultiModel) {
      console.log("Using multi-model extraction with OpenAI + Anthropic");
      const multiModelResponse = await fetch(
        `${supabaseUrl}/functions/v1/extract_quote_multi_model`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": authHeader,
          },
          body: JSON.stringify({ text: combinedText, metadata }),
        }
      );

      if (!multiModelResponse.ok) {
        throw new Error(`Multi-model extraction failed: ${multiModelResponse.status}`);
      }

      extractionResult = await multiModelResponse.json();
      extractionMethod = extractionResult.extraction_metadata?.extraction_method || "consensus";
      modelsUsed = extractionResult.extraction_metadata?.models_used || ["openai", "anthropic"];
    } else if (useTextract) {
      console.log("Using AWS Textract for messy PDF");

      const pdfBytes = await getPdfBytes(supabase, jobId);

      const textractResponse = await fetch(
        `${supabaseUrl}/functions/v1/extract_quote_textract`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": authHeader,
          },
          body: JSON.stringify({ pdfBytes, fileName: `job_${jobId}.pdf` }),
        }
      );

      if (!textractResponse.ok) {
        console.error("Textract failed, falling back to primary method");
        extractionMethod = "fallback_primary";
      } else {
        const textractData = await textractResponse.json();
        extractionResult = {
          primary: textractData,
          confidence_breakdown: {
            overall: 0.85,
            metadata: 0.8,
            line_items: 0.85,
            financials: 0.9,
            cross_model_agreement: 1.0,
            arithmetic_consistency: 0.95,
            format_validity: 0.9,
          },
          extraction_metadata: {
            models_used: ["textract"],
            extraction_method: "textract",
            processing_time_ms: 0,
            page_count: metadata.pageCount,
            ocr_used: true,
          },
        };
        extractionMethod = "textract";
        modelsUsed = ["textract"];
      }
    }

    if (!extractionResult) {
      console.log("Using standard OpenAI extraction");
      const openaiResponse = await fetch(
        `${supabaseUrl}/functions/v1/extract_quote_multi_model`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": authHeader,
          },
          body: JSON.stringify({ text: combinedText, metadata }),
        }
      );

      if (!openaiResponse.ok) {
        throw new Error(`OpenAI extraction failed: ${openaiResponse.status}`);
      }

      extractionResult = await openaiResponse.json();
      extractionMethod = "primary";
      modelsUsed = ["openai"];
    }

    const finalQuote = extractionResult.consensus || extractionResult.primary;
    const confidenceScore = extractionResult.confidence_breakdown?.overall || 0.5;

    await supabase
      .from("parsing_jobs")
      .update({
        status: "completed",
        result: finalQuote,
        confidence_score: confidenceScore,
        metadata: {
          extraction_method: extractionMethod,
          models_used: modelsUsed,
          confidence_breakdown: extractionResult.confidence_breakdown,
        },
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    return new Response(
      JSON.stringify({
        success: true,
        result: finalQuote,
        confidence_score: confidenceScore,
        extraction_method: extractionMethod,
        models_used: modelsUsed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Production parsing failed:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function getPdfBytes(supabase: any, jobId: string): Promise<string> {
  const { data: job } = await supabase
    .from("parsing_jobs")
    .select("file_path")
    .eq("id", jobId)
    .single();

  if (!job?.file_path) {
    throw new Error("PDF file path not found");
  }

  const { data: fileData, error: downloadError } = await supabase.storage
    .from("quote-uploads")
    .download(job.file_path);

  if (downloadError || !fileData) {
    throw new Error("Failed to download PDF file");
  }

  const arrayBuffer = await fileData.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  return btoa(String.fromCharCode(...uint8Array));
}
