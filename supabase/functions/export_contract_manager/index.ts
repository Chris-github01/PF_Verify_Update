import { createClient } from 'npm:@supabase/supabase-js@2';
import { generateJuniorPackHTML, generateSeniorReportHTML, generatePreletAppendixHTML, generateSA2017AgreementHTML } from './generators.ts';

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

    const { projectId, mode = 'site', agreementId } = await req.json();

    if (!projectId) {
      throw new Error('projectId is required');
    }

    console.log('Export mode:', mode, 'for project:', projectId);

    const { data: project } = await supabase
      .from('projects')
      .select(`
        name, client, updated_at, approved_quote_id, organisation_id,
        retention_percentage, retention_method, retention_tiers,
        main_contractor_name, payment_terms, liquidated_damages,
        project_manager_name, project_manager_email, project_manager_phone,
        public_liability_insurance, motor_vehicle_insurance,
        subcontractor_name,
        quantity_surveyor_name, quantity_surveyor_phone, quantity_surveyor_email,
        subcontractor_project_manager_name, subcontractor_project_manager_phone, subcontractor_project_manager_email,
        site_manager_name, site_manager_phone, site_manager_email,
        health_safety_officer_name, health_safety_officer_phone, health_safety_officer_email,
        accounts_name, accounts_phone, accounts_email,
        document_controller_name, document_controller_phone, document_controller_email
      `)
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
      let supplierContact = null;

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

        const { data: supplierData } = await supabase
          .from('suppliers')
          .select('contact_name, contact_email, contact_phone, address')
          .eq('name', supplierName)
          .maybeSingle();

        if (supplierData) {
          supplierContact = supplierData;
        }
      }

      const { data: scopeSystemsData } = await supabase
        .from('quote_items')
        .select('service_type, description, quantity, unit, rate, total')
        .eq('project_id', projectId)
        .not('service_type', 'is', null)
        .order('service_type, description');

      const groupedSystems: any = {};
      scopeSystemsData?.forEach((item: any) => {
        if (!groupedSystems[item.service_type]) {
          groupedSystems[item.service_type] = {
            service_type: item.service_type,
            items: [],
            total: 0,
            item_count: 0
          };
        }
        groupedSystems[item.service_type].items.push(item);
        groupedSystems[item.service_type].total += item.total || 0;
        groupedSystems[item.service_type].item_count += 1;
      });

      const scopeSystems = Object.values(groupedSystems);

      const { data: allowancesData } = await supabase
        .from('contract_allowances')
        .select('*')
        .eq('project_id', projectId)
        .eq('include_in_prelet_appendix', true)
        .order('sort_order');

      console.log('[PRELET] Generating HTML...');
      const genStart = Date.now();

      const htmlContent = generatePreletAppendixHTML(
        project.name,
        supplierName,
        totalAmount,
        {
          ...appendixData,
          project: project,
          supplierContact: supplierContact,
          scopeSystems: scopeSystems,
          allowances: allowancesData || []
        },
        organisationLogoUrl
      );

      const genDuration = Date.now() - genStart;
      console.log(`[PRELET] HTML generated in ${genDuration}ms`);

      return new Response(
        JSON.stringify({ html: htmlContent }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (mode === 'sa2017') {
      console.log('[SA-2017] Export started');

      if (!agreementId) {
        throw new Error('agreementId is required for SA-2017 export');
      }

      // Fetch agreement
      const { data: agreement, error: agreementError } = await supabase
        .from('subcontract_agreements')
        .select('*')
        .eq('id', agreementId)
        .maybeSingle();

      if (agreementError || !agreement) {
        throw new Error('Agreement not found');
      }

      // Fetch template
      const { data: template, error: templateError } = await supabase
        .from('contract_templates')
        .select('*')
        .eq('id', agreement.template_id)
        .maybeSingle();

      if (templateError || !template) {
        throw new Error('Template not found');
      }

      // Fetch field definitions
      const { data: fields, error: fieldsError } = await supabase
        .from('subcontract_field_definitions')
        .select('*')
        .eq('template_id', agreement.template_id)
        .order('section, field_order');

      if (fieldsError) {
        throw new Error('Failed to fetch field definitions');
      }

      // Fetch field values
      const { data: values, error: valuesError } = await supabase
        .from('subcontract_field_values')
        .select('*')
        .eq('agreement_id', agreementId);

      if (valuesError) {
        throw new Error('Failed to fetch field values');
      }

      // Create field values map
      const fieldValuesMap: Record<string, any> = {};
      values?.forEach(value => {
        const field = fields?.find(f => f.id === value.field_definition_id);
        if (field) {
          fieldValuesMap[field.field_key] = value;
        }
      });

      // Generate HTML
      console.log('[SA-2017] Generating HTML...');
      const htmlContent = generateSA2017AgreementHTML(
        agreement,
        template,
        fields || [],
        fieldValuesMap,
        project,
        organisationLogoUrl
      );

      console.log('[SA-2017] HTML generated successfully');

      return new Response(
        JSON.stringify({ html: htmlContent }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Only prelet_appendix and sa2017 modes are currently supported' }),
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