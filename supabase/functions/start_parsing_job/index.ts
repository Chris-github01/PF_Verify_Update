import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const projectId = formData.get("projectId") as string;
    const supplierName = formData.get("supplierName") as string;
    const organisationId = formData.get("organisationId") as string;
    const quoteId = formData.get("quoteId") as string | null;
    const dashboardMode = (formData.get("dashboardMode") as string) || "original";
    const trade = (formData.get("trade") as string) || "passive_fire";

    if (!projectId || !supplierName || !file || !organisationId) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: projectId, supplierName, organisationId, or file" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid auth token" }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const { data: membership, error: membershipError } = await supabase
      .from("organisation_members")
      .select("organisation_id")
      .eq("user_id", user.id)
      .eq("organisation_id", organisationId)
      .eq("status", "active")
      .maybeSingle();

    if (!membership) {
      console.error("User not a member of organisation:", { userId: user.id, organisationId, membershipError });
      return new Response(
        JSON.stringify({ error: "User not authorized for this organisation" }),
        {
          status: 403,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }
    const fileName = file.name;
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');

    const fileBuffer = await file.arrayBuffer();
    const fileExtension = fileName.split('.').pop();
    const storagePath = `${projectId}/${Date.now()}-${sanitizedFileName}`;

    console.log("DEPLOYMENT VERSION: 2024-12-01-v4 - Original:", fileName, "Sanitized:", sanitizedFileName, "Path:", storagePath);

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("quotes")
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Failed to upload file:", uploadError);
      return new Response(
        JSON.stringify({ error: `Failed to upload file: ${uploadError.message}` }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    console.log("Creating parsing job:", { projectId, supplierName, fileName, organisationId, userId: user.id, storagePath, quoteId, dashboardMode });

    // Pre-create (or reuse) the quote row immediately so the UI can show a
    // "Processing Quote..." card while Parser V2 runs asynchronously.
    let effectiveQuoteId = quoteId;
    if (!effectiveQuoteId) {
      let revisionNumber = 1;
      if (dashboardMode === "revisions") {
        const { data: latestQuote } = await supabase
          .from("quotes")
          .select("revision_number")
          .eq("project_id", projectId)
          .eq("supplier_name", supplierName)
          .order("revision_number", { ascending: false })
          .limit(1)
          .maybeSingle();
        revisionNumber = latestQuote?.revision_number
          ? (latestQuote.revision_number as number) + 1
          : 2;
      }

      const { data: newQuote, error: quoteErr } = await supabase
        .from("quotes")
        .insert({
          project_id: projectId,
          supplier_name: supplierName,
          organisation_id: organisationId,
          status: "pending",
          parse_status: "processing",
          total_amount: 0,
          total_price: 0,
          created_by: user.id,
          revision_number: revisionNumber,
          trade,
          parser_primary: "v2",
          file_url: storagePath,
        })
        .select("id")
        .single();

      if (quoteErr || !newQuote) {
        console.error("Failed to pre-create quote:", quoteErr);
        return new Response(
          JSON.stringify({ error: `Failed to create quote row: ${quoteErr?.message ?? "unknown"}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      effectiveQuoteId = newQuote.id;
    } else {
      // Reuse existing quote (revision flow) — flip to processing.
      await supabase
        .from("quotes")
        .update({
          parse_status: "processing",
          parser_primary: "v2",
          passive_fire_final: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", effectiveQuoteId);
    }

    const jobData: any = {
      project_id: projectId,
      supplier_name: supplierName,
      filename: fileName,
      file_url: storagePath,
      organisation_id: organisationId,
      user_id: user.id,
      status: "pending",
      progress: 0,
      trade: trade,
      quote_id: effectiveQuoteId,
      metadata: { dashboard_mode: dashboardMode },
    };

    const { data: job, error: jobError } = await supabase
      .from("parsing_jobs")
      .insert(jobData)
      .select()
      .single();

    if (jobError || !job) {
      console.error("Failed to create parsing job:", jobError);
      throw new Error(`Failed to create parsing job: ${jobError?.message}`);
    }

    console.log("Parsing job created:", job.id);

    const processUrl = `${supabaseUrl}/functions/v1/process_parsing_job`;
    console.log("Triggering process_parsing_job at:", processUrl);

    fetch(processUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ jobId: job.id }),
    }).catch(err => {
      console.error("Failed to trigger process_parsing_job:", err);
    });

    return new Response(
      JSON.stringify({
        success: true,
        jobId: job.id,
        message: "Parsing job started successfully"
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
    console.error("Error starting parsing job:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: errorMessage || "Internal server error" }),
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