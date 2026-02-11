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
      throw new Error(`Failed to fetch agreement: ${agreementError?.message}`);
    }

    // Fetch project details
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select(`
        name,
        location,
        organisation_id,
        project_manager_name,
        project_manager_email,
        project_manager_phone,
        organisations (
          name,
          address
        )
      `)
      .eq('id', project_id)
      .single();

    if (projectError || !project) {
      throw new Error(`Failed to fetch project: ${projectError?.message}`);
    }

    // Fetch supplier details from suppliers table
    const { data: supplier, error: supplierError } = await supabase
      .from('suppliers')
      .select('contact_name, contact_email, contact_phone, address')
      .eq('organisation_id', project.organisation_id)
      .eq('name', agreement.subcontractor_name)
      .maybeSingle();

    console.log('[Autofill SA-2017] Supplier data:', supplier);

    // Fetch field definitions
    const { data: fieldDefs, error: fieldDefsError } = await supabase
      .from('subcontract_field_definitions')
      .select('id, field_key, section')
      .eq('template_id', agreement.template_id)
      .in('section', ['Contract Identity', 'Parties']);

    if (fieldDefsError || !fieldDefs) {
      throw new Error(`Failed to fetch field definitions: ${fieldDefsError?.message}`);
    }

    // Create field key to ID mapping
    const fieldMap = new Map<string, string>();
    fieldDefs.forEach(f => fieldMap.set(f.field_key, f.id));

    // Prepare autofill data
    const autofillData: Record<string, string> = {
      // Contract Identity
      contract_date: new Date().toISOString().split('T')[0],
      contract_reference: agreement.agreement_number || '',
      project_name: project.name || '',
      project_location: project.location || '',

      // Parties - Head Contractor
      head_contractor_name: (project.organisations as any)?.name || '',
      head_contractor_address: (project.organisations as any)?.address || '',
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

    console.log('[Autofill SA-2017] Inserting', fieldValues.length, 'field values');

    // Insert all field values
    if (fieldValues.length > 0) {
      const { error: insertError } = await supabase
        .from('subcontract_field_values')
        .upsert(fieldValues, {
          onConflict: 'agreement_id,field_definition_id'
        });

      if (insertError) {
        throw new Error(`Failed to insert field values: ${insertError.message}`);
      }
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
