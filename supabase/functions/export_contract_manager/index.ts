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
        .select('scope_category, description, quantity, unit, unit_price, total_price, frr, service, size, subclass, material, mapped_service_type, system_label')
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

    const { data: supplierData } = await supabase
      .from('suppliers')
      .select('contact_name, contact_email, contact_phone, address')
      .eq('organisation_id', (project as any).organisation_id)
      .ilike('name', supplierName)
      .maybeSingle();

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

      if (item.description && item.description.includes('[')) {
        system.details.push(item.description);
      } else {
        const detailParts: string[] = [];

        if (item.description) {
          detailParts.push(item.description);
        }

        const attributes: string[] = [];
        if (item.frr) attributes.push(`FRR: ${item.frr}`);
        if (item.service || item.mapped_service_type) {
          attributes.push(`Service: ${item.service || item.mapped_service_type}`);
        }
        if (item.size) attributes.push(`Size: ${item.size}`);
        if (item.subclass) attributes.push(`Type: ${item.subclass}`);
        if (item.material) attributes.push(`Material: ${item.material}`);
        if (item.quantity && item.unit) {
          attributes.push(`Qty: ${item.quantity} ${item.unit}`);
        }

        if (attributes.length > 0) {
          detailParts.push(`[${attributes.join(' | ')}]`);
        }

        if (detailParts.length > 0) {
          system.details.push(detailParts.join(' '));
        }
      }
    });

    const scopeSystems = Array.from(scopeSystemsMap.values());
    const totalItems = scopeSystems.reduce((sum, sys) => sum + sys.item_count, 0);
    scopeSystems.forEach(system => {
      system.percentage = totalItems > 0 ? (system.item_count / totalItems) * 100 : 0;
    });

    const inclusions = (inclusionsData || []).map(i => i.description).filter(Boolean);
    const exclusions = (exclusionsData || []).map(e => e.description).filter(Boolean);

    if (mode === 'junior_pack') {
      const lineItems = quoteItems.map(item => ({
        description: item.description || 'N/A',
        service: item.service || item.subclass || 'N/A',
        material: item.material || 'N/A',
        quantity: item.quantity ?? 'N/A',
        unit: item.unit || 'N/A'
      }));

      let supplierContact = null;
      if ((project as any).organisation_id && supplierName) {
        const { data: supplier } = await supabase
          .from('suppliers')
          .select('contact_name, contact_email, contact_phone, address')
          .eq('organisation_id', (project as any).organisation_id)
          .ilike('name', supplierName)
          .maybeSingle();

        if (supplier) {
          supplierContact = {
            contactName: supplier.contact_name,
            contactEmail: supplier.contact_email,
            contactPhone: supplier.contact_phone,
            address: supplier.address
          };
        }
      }

      const htmlContent = generateJuniorPackHTML(
        project.name,
        supplierName,
        scopeSystems,
        inclusions,
        exclusions,
        organisationLogoUrl,
        lineItems,
        supplierContact
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
        organisationLogoUrl,
        {
        client: (project as any).client,
        mainContractor: (project as any).main_contractor_name,
        retentionPercentage: (project as any).retention_percentage || 3,
        paymentTerms: (project as any).payment_terms,
        liquidatedDamages: (project as any).liquidated_damages,
        projectManager: {
          name: (project as any).project_manager_name,
          email: (project as any).project_manager_email,
          phone: (project as any).project_manager_phone
        },
        supplier: {
          contactName: supplierData?.contact_name,
          contactEmail: supplierData?.contact_email,
          contactPhone: supplierData?.contact_phone,
          address: supplierData?.address
        },
        awardReport: awardResult
      }
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