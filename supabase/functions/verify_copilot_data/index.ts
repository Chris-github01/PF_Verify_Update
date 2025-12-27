import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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
      throw new Error("No authorization header");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const { projectId } = await req.json();

    if (!projectId) {
      throw new Error("projectId is required");
    }

    const diagnostics: any = {
      projectId,
      timestamp: new Date().toISOString(),
      checks: {},
    };

    // Check 1: Get current user
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();
    diagnostics.checks.user = {
      success: !userError,
      userId: user?.id,
      email: user?.email,
      error: userError?.message,
    };

    // Check 2: Get project
    const { data: project, error: projectError } = await supabaseClient
      .from("projects")
      .select("id, name, organisation_id, client, reference, trade")
      .eq("id", projectId)
      .single();

    diagnostics.checks.project = {
      success: !projectError,
      data: project,
      error: projectError?.message,
    };

    // Check 3: Get organisation membership
    if (project && user) {
      const { data: membership, error: membershipError } = await supabaseClient
        .from("organisation_members")
        .select("id, role, status, organisation_id")
        .eq("organisation_id", project.organisation_id)
        .eq("user_id", user.id)
        .single();

      diagnostics.checks.membership = {
        success: !membershipError,
        data: membership,
        error: membershipError?.message,
      };
    }

    // Check 4: Get quotes with is_latest = true
    const { data: quotesLatest, error: quotesLatestError } =
      await supabaseClient
        .from("quotes")
        .select("id, supplier_name, total_amount, is_latest, revision_number, items_count")
        .eq("project_id", projectId)
        .eq("is_latest", true);

    diagnostics.checks.quotesLatest = {
      success: !quotesLatestError,
      count: quotesLatest?.length || 0,
      data: quotesLatest,
      error: quotesLatestError?.message,
    };

    // Check 5: Get all quotes (no filter)
    const { data: quotesAll, error: quotesAllError } = await supabaseClient
      .from("quotes")
      .select("id, supplier_name, total_amount, is_latest, revision_number, items_count")
      .eq("project_id", projectId);

    diagnostics.checks.quotesAll = {
      success: !quotesAllError,
      count: quotesAll?.length || 0,
      data: quotesAll,
      error: quotesAllError?.message,
    };

    // Check 6: Get quote items for first quote (if any)
    if (quotesAll && quotesAll.length > 0) {
      const firstQuoteId = quotesAll[0].id;
      const { data: items, error: itemsError } = await supabaseClient
        .from("quote_items")
        .select("id, description, quantity, unit_price, total_price")
        .eq("quote_id", firstQuoteId)
        .limit(5);

      diagnostics.checks.quoteItems = {
        success: !itemsError,
        quoteId: firstQuoteId,
        count: items?.length || 0,
        sample: items,
        error: itemsError?.message,
      };
    }

    // Check 7: Direct count queries using service role
    const serviceRoleClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { count: projectQuotesCount } = await serviceRoleClient
      .from("quotes")
      .select("*", { count: "exact", head: true })
      .eq("project_id", projectId);

    diagnostics.checks.serviceRoleCount = {
      totalQuotesInProject: projectQuotesCount,
    };

    // Check 8: Test check_project_access function
    if (user) {
      const { data: accessCheck, error: accessError } =
        await supabaseClient.rpc("check_project_access", {
          project_id: projectId,
          user_id: user.id,
        });

      diagnostics.checks.projectAccessFunction = {
        success: !accessError,
        hasAccess: accessCheck,
        error: accessError?.message,
      };
    }

    // Summary
    diagnostics.summary = {
      userAuthenticated: !!user,
      projectExists: !!project,
      hasMembership:
        diagnostics.checks.membership?.success &&
        diagnostics.checks.membership?.data?.status === "active",
      quotesWithLatestFlag: quotesLatest?.length || 0,
      totalQuotesInProject: quotesAll?.length || 0,
      serviceRoleSeesQuotes: projectQuotesCount || 0,
      canAccessProject: diagnostics.checks.projectAccessFunction?.hasAccess,
    };

    // Recommendations
    diagnostics.recommendations = [];

    if (diagnostics.summary.totalQuotesInProject === 0) {
      diagnostics.recommendations.push(
        "No quotes found in project. Import quotes first."
      );
    } else if (diagnostics.summary.quotesWithLatestFlag === 0) {
      diagnostics.recommendations.push(
        "Quotes exist but is_latest flag is not set. Run: UPDATE quotes SET is_latest = true WHERE project_id = '" +
          projectId +
          "'"
      );
    }

    if (!diagnostics.summary.hasMembership) {
      diagnostics.recommendations.push(
        "User is not an active member of the project's organisation. Check organisation_members table."
      );
    }

    if (!diagnostics.summary.canAccessProject) {
      diagnostics.recommendations.push(
        "check_project_access function returned false. Check RLS policies and organisation membership."
      );
    }

    return new Response(JSON.stringify(diagnostics, null, 2), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (error: any) {
    console.error("Error in verify_copilot_data:", error);
    return new Response(
      JSON.stringify({
        error: error.message,
        stack: error.stack,
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
