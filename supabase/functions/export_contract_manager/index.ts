import { createClient } from 'npm:@supabase/supabase-js@2';
import { generateJuniorPackHTML, generateSeniorReportHTML } from './generators.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface HandoverPackData {
  mode: 'site' | 'commercial';
  project: {
    name: string;
    address?: string;
    client?: string;
    mainContractor?: string;
  };
  subcontractor: {
    name: string;
    contact?: string;
    email?: string;
    phone?: string;
  };
  award?: {
    totalAmount: number;
    awardedDate?: string;
  };
  commercial?: {
    paymentTerms: string;
    retentions: string;
    liquidatedDamages: string;
  };
  awardSummary?: any;
  quoteItems?: any[];
  systems: Array<{
    system: string;
    rating: string;
    substrate?: string;
    locations?: string;
    included: string;
  }>;
  inclusions: string[];
  exclusions: string[];
  assumptions: string[];
  allowances: Array<{
    description: string;
    quantity: string;
    unit: string;
    rate?: number;
    total?: number;
    notes?: string;
  }>;
  variations: Array<{
    number: string;
    description: string;
    status: string;
    amount?: number;
  }>;
  generatedAt: string;
  generatedBy?: string;
}

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

    const { data: project } = await supabase
      .from('projects')
      .select('name, client, updated_at, approved_quote_id, organisation_id')
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

    const approvedQuoteId = (project as any)?.approved_quote_id;
    let approvedQuote: any = null;
    let quoteItems: any[] = [];

    if (approvedQuoteId) {
      const { data: quote } = await supabase
        .from('quotes')
        .select('supplier_name, total_amount, updated_at')
        .eq('id', approvedQuoteId)
        .maybeSingle();

      approvedQuote = quote;

      const { data: items } = await supabase
        .from('quote_items')
        .select('scope_category, description, quantity, unit_price, total_price')
        .eq('quote_id', approvedQuoteId)
        .limit(1000);

      quoteItems = items || [];
    }

    const { data: awardReport } = await supabase
      .from('award_reports')
      .select('result_json, generated_at')
      .eq('project_id', projectId)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: systemsData } = await supabase
      .from('scope_matrix_systems')
      .select('*')
      .eq('project_id', projectId);

    const { data: allowancesData } = await supabase
      .from('contract_allowances')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order');

    const { data: inclusionsData } = await supabase
      .from('contract_inclusions')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order');

    const { data: exclusionsData } = await supabase
      .from('contract_exclusions')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order');

    const awardResult = awardReport?.result_json || {};
    const awardSummary = awardResult.awardSummary || {};
    const bestSupplier = awardSummary.suppliers?.[0] || {};

    const supplierName = approvedQuote?.supplier_name || bestSupplier.supplierName || 'TBC';
    const totalAmount = approvedQuote?.total_amount || bestSupplier.adjustedTotal || 0;

    const scopeSystemsMap = new Map<string, any>();
    quoteItems.forEach((item: any) => {
      const category = item.scope_category || 'Other Systems';
      if (!scopeSystemsMap.has(category)) {
        scopeSystemsMap.set(category, {
          service_type: category,
          coverage: 'full',
          item_count: 0,
          details: []
        });
      }
      const system = scopeSystemsMap.get(category)!;
      system.item_count += 1;
      if (item.description) {
        system.details.push(item.description);
      }
    });

    const scopeSystems = Array.from(scopeSystemsMap.values());
    const totalItems = scopeSystems.reduce((sum, sys) => sum + sys.item_count, 0);
    scopeSystems.forEach(system => {
      system.percentage = totalItems > 0 ? (system.item_count / totalItems) * 100 : 0;
    });

    const realAllowances = (allowancesData || []).map(a => ({
      description: a.description,
      quantity: a.quantity,
      unit: a.unit,
      rate: a.rate,
      total: a.total,
      notes: a.notes
    }));

    const inclusions = (inclusionsData || []).map(i => i.description).filter(Boolean);
    const exclusions = (exclusionsData || []).map(e => e.description).filter(Boolean);

    if (mode === 'junior_pack') {
      const htmlContent = generateJuniorPackHTML(
        project.name,
        supplierName,
        scopeSystems,
        inclusions,
        exclusions,
        organisationLogoUrl
      );
      return new Response(
        JSON.stringify({ html: htmlContent }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (mode === 'senior_report') {
      const htmlContent = generateSeniorReportHTML(
        project.name,
        supplierName,
        totalAmount,
        scopeSystems,
        inclusions,
        exclusions,
        organisationLogoUrl
      );
      return new Response(
        JSON.stringify({ html: htmlContent }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid mode' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Export error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Export failed'
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