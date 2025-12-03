import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CheckResult {
  area: string;
  name: string;
  status: "pass" | "fail" | "fixed";
  detail: string;
  fixHint?: string;
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
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { autoFix } = await req.json();
    const checks: CheckResult[] = [];

    const tables = [
      "organisations",
      "projects",
      "quotes",
      "quote_items",
      "award_reports",
      "parsing_jobs",
      "platform_admins",
      "organisation_members"
    ];

    for (const table of tables) {
      try {
        const { data, error } = await supabase
          .from(table)
          .select("id")
          .limit(1);

        if (error) {
          checks.push({
            area: "Database",
            name: `Table: ${table}`,
            status: "fail",
            detail: `Error: ${error.message}`,
            fixHint: "Run migrations to create missing tables"
          });
        } else {
          checks.push({
            area: "Database",
            name: `Table: ${table}`,
            status: "pass",
            detail: "Table exists and is accessible"
          });
        }
      } catch (err: any) {
        checks.push({
          area: "Database",
          name: `Table: ${table}`,
          status: "fail",
          detail: `Error: ${err.message}`,
          fixHint: "Check database connection and permissions"
        });
      }
    }

    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    
    if (bucketsError) {
      checks.push({
        area: "Storage",
        name: "Storage Access",
        status: "fail",
        detail: `Error: ${bucketsError.message}`,
        fixHint: "Check storage configuration"
      });
    } else {
      const requiredBuckets = ["quotes", "exports"];
      const existingBuckets = buckets?.map(b => b.name) || [];
      
      for (const bucket of requiredBuckets) {
        if (existingBuckets.includes(bucket)) {
          checks.push({
            area: "Storage",
            name: `Bucket: ${bucket}`,
            status: "pass",
            detail: "Bucket exists"
          });
        } else {
          checks.push({
            area: "Storage",
            name: `Bucket: ${bucket}`,
            status: "fail",
            detail: "Bucket does not exist",
            fixHint: "Create storage bucket in Supabase Dashboard"
          });
        }
      }
    }

    const envVars = [
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_ANON_KEY"
    ];

    for (const varName of envVars) {
      const value = Deno.env.get(varName);
      if (value) {
        checks.push({
          area: "Configuration",
          name: varName,
          status: "pass",
          detail: "Environment variable is set"
        });
      } else {
        checks.push({
          area: "Configuration",
          name: varName,
          status: "fail",
          detail: "Environment variable not set",
          fixHint: "Configure in edge function secrets"
        });
      }
    }

    const passed = checks.filter(c => c.status === "pass").length;
    const failed = checks.filter(c => c.status === "fail").length;
    const fixed = checks.filter(c => c.status === "fixed").length;

    return new Response(
      JSON.stringify({
        passed,
        failed,
        fixed,
        checks,
        timestamp: new Date().toISOString()
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error: any) {
    console.error("System check error:", error);
    return new Response(
      JSON.stringify({ 
        error: error.message || "Failed to run system check",
        passed: 0,
        failed: 0,
        fixed: 0,
        checks: [],
        timestamp: new Date().toISOString()
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