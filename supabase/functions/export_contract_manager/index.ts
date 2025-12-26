import { createClient } from 'npm:@supabase/supabase-js@2';
import { generateJuniorPackHTML, generateSeniorReportHTML, generatePreletAppendixHTML } from './generators.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const { projectId, mode = 'site' } = await req.json();

    if (!projectId) {
      throw new Error('projectId is required');
    }

    console.log('Export mode:', mode, 'for project:', projectId);

    const { data: project } = await supabase
      .from('projects')
      .select('name, client, updated_at, approved_quote_id, organisation_id, retention_percentage, main_contractor_name, payment_terms, liquidated_damages, project_manager_name, project_manager_email, project_manager_phone')
      .eq('id', projectId)
      .maybeSingle();

    if (!project) {
      throw new Error('Project not found');
    }

    let organisationLogoUrl: string | undefined;
    if ((project as any).organisation_id) {
      const { data: org } = await supabase
        .from('organisations')
        .select('logo_url')
        .eq('id', (project as any).organisation_id)
        .maybeSingle();

      if (org?.logo_url) {
        const { data: urlData } = supabase.storage
          .from('organisation-logos')
          .getPublicUrl(org.logo_url);

        if (urlData?.publicUrl) {
          organisationLogoUrl = urlData.publicUrl;
        }
      }
    }

    if (mode === 'prelet_appendix') {
      console.log('[PRELET] Fast path started');
      const queryStart = Date.now();

      const { data: appendixData, error: appendixError } = await supabase
        .from('prelet_appendix')
        .select('*')
        .eq('project_id', projectId)
        .maybeSingle();

      const queryDuration = Date.now() - queryStart;
      console.log(`[PRELET] Query completed in ${queryDuration}ms`);

      if (appendixError) {
        throw new Error(`Database error: ${appendixError.message}`);
      }

      if (!appendixData) {
        throw new Error('No pre-let appendix found. Please save the appendix first.');
      }

      const approvedQuoteId = (project as any)?.approved_quote_id;
      let supplierName = 'TBC';
      let totalAmount = 0;

      if (approvedQuoteId) {
        const { data: quote } = await supabase
          .from('quotes')
          .select('supplier_name, total_amount')
          .eq('id', approvedQuoteId)
          .maybeSingle();

        if (quote) {
          supplierName = quote.supplier_name;
          totalAmount = quote.total_amount || 0;
        }
      }

      console.log('[PRELET] Generating HTML...');
      const genStart = Date.now();

      const htmlContent = generatePreletAppendixHTML(
        project.name,
        supplierName,
        totalAmount,
        appendixData,
        organisationLogoUrl
      );

      const genDuration = Date.now() - genStart;
      console.log(`[PRELET] HTML generated in ${genDuration}ms`);

      return new Response(
        JSON.stringify({ html: htmlContent }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Only prelet_appendix mode is currently supported' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Export error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Export failed',
        details: error instanceof Error ? error.stack : String(error)
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );
  }
});