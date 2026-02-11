import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface AutofillRequest {
  agreement_id: string;
  project_id: string;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    const { agreement_id, project_id }: AutofillRequest = await req.json();

    console.log('[Autofill SA-2017] Starting autofill for agreement:', agreement_id);

    // Fetch agreement to get template_id and subcontractor name
    const { data: agreement, error: agreementError } = await supabase
      .from('subcontract_agreements')
      .select('template_id, subcontractor_name, agreement_number')
      .eq('id', agreement_id)
      .single();

    if (agreementError || !agreement) {
      console.error('[Autofill SA-2017] Agreement error:', agreementError);
      throw new Error(`Failed to fetch agreement: ${agreementError?.message || 'Agreement not found'}`);
    }

    console.log('[Autofill SA-2017] Agreement found:', agreement.agreement_number);

    // Fetch project details
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select(`
        name,
        description,
        organisation_id,
        project_manager_name,
        project_manager_email,
        project_manager_phone,
        organisations (
          name,
          legal_name
        )
      `)
      .eq('id', project_id)
      .single();

    if (projectError || !project) {
      console.error('[Autofill SA-2017] Project error:', projectError);
      throw new Error(`Failed to fetch project: ${projectError?.message || 'Project not found'}`);
    }

    console.log('[Autofill SA-2017] Project found:', project.name);

    // Fetch supplier details from suppliers table
    const { data: supplier, error: supplierError } = await supabase
      .from('suppliers')
      .select('contact_name, contact_email, contact_phone, address')
      .eq('organisation_id', project.organisation_id)
      .eq('name', agreement.subcontractor_name)
      .maybeSingle();

    if (supplierError) {
      console.error('[Autofill SA-2017] Supplier fetch error:', supplierError);
    }

    if (!supplier) {
      console.warn('[Autofill SA-2017] Supplier not found in database:', agreement.subcontractor_name);
      console.warn('[Autofill SA-2017] Please add supplier to database for complete autofill');
    } else {
      console.log('[Autofill SA-2017] Supplier found:', supplier.contact_name);
    }

    // Fetch field definitions
    const { data: fieldDefs, error: fieldDefsError } = await supabase
      .from('subcontract_field_definitions')
      .select('id, field_key, section')
      .eq('template_id', agreement.template_id)
      .in('section', ['Contract Identity', 'Parties']);

    if (fieldDefsError || !fieldDefs) {
      console.error('[Autofill SA-2017] Field definitions error:', fieldDefsError);
      throw new Error(`Failed to fetch field definitions: ${fieldDefsError?.message || 'No fields found'}`);
    }

    console.log('[Autofill SA-2017] Found', fieldDefs.length, 'field definitions');

    // Create field key to ID mapping
    const fieldMap = new Map<string, string>();
    fieldDefs.forEach(f => fieldMap.set(f.field_key, f.id));

    // Prepare autofill data
    const autofillData: Record<string, string> = {
      // Contract Identity
      contract_date: new Date().toISOString().split('T')[0],
      contract_reference: agreement.agreement_number || '',
      project_name: project.name || '',
      project_location: project.description || '',

      // Parties - Head Contractor
      head_contractor_name: (project.organisations as any)?.legal_name || (project.organisations as any)?.name || '',
      head_contractor_address: '', // No address field in organisations table
      head_contractor_contact: project.project_manager_name || '',
      head_contractor_email: project.project_manager_email || '',
      head_contractor_phone: project.project_manager_phone || '',

      // Parties - Subcontractor
      subcontractor_name: agreement.subcontractor_name || '',
      subcontractor_address: supplier?.address || '',
      subcontractor_contact: supplier?.contact_name || '',
      subcontractor_email: supplier?.contact_email || '',
      subcontractor_phone: supplier?.contact_phone || '',
    };

    console.log('[Autofill SA-2017] Prepared data for', Object.keys(autofillData).length, 'fields');
    console.log('[Autofill SA-2017] Project:', project.name);
    console.log('[Autofill SA-2017] Head Contractor:', (project.organisations as any)?.name);
    console.log('[Autofill SA-2017] Subcontractor:', agreement.subcontractor_name);

    // Get authenticated user from request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      throw new Error(`Authentication failed: ${userError?.message}`);
    }

    // Insert field values
    const fieldValues = [];
    const timestamp = new Date().toISOString();

    for (const [fieldKey, fieldValue] of Object.entries(autofillData)) {
      const fieldDefId = fieldMap.get(fieldKey);
      if (fieldDefId && fieldValue) {
        fieldValues.push({
          agreement_id,
          field_definition_id: fieldDefId,
          field_value: fieldValue,
          comment: null,
          updated_by: user.id,
          updated_at: timestamp,
          created_at: timestamp,
        });
      }
    }

    console.log('[Autofill SA-2017] Preparing to insert', fieldValues.length, 'field values');

    // Insert all field values
    if (fieldValues.length > 0) {
      const { data: insertedData, error: insertError } = await supabase
        .from('subcontract_field_values')
        .upsert(fieldValues, {
          onConflict: 'agreement_id,field_definition_id'
        });

      if (insertError) {
        console.error('[Autofill SA-2017] Insert error:', insertError);
        console.error('[Autofill SA-2017] Error details:', JSON.stringify(insertError, null, 2));
        throw new Error(`Failed to insert field values: ${insertError.message}`);
      }

      console.log('[Autofill SA-2017] Successfully inserted field values');
    } else {
      console.warn('[Autofill SA-2017] No field values to insert - check data availability');
    }

    console.log('[Autofill SA-2017] Autofill completed successfully');

    return new Response(
      JSON.stringify({
        success: true,
        fields_populated: fieldValues.length,
        message: 'Fields auto-populated successfully'
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('[Autofill SA-2017] Error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
