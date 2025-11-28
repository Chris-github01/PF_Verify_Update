import { createClient } from 'npm:@supabase/supabase-js@2';

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
      .select('name, client, updated_at')
      .eq('id', projectId)
      .maybeSingle();

    if (!project) {
      throw new Error('Project not found');
    }

    const { data: awardData } = await supabase
      .from('award_recommendations')
      .select('recommended_supplier, recommended_total, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: systemsData } = await supabase
      .from('scope_matrix_systems')
      .select('*')
      .eq('project_id', projectId);

    const packData: HandoverPackData = {
      mode: mode as 'site' | 'commercial',
      project: {
        name: project.name,
        client: project.client || 'TBC',
        mainContractor: 'TBC',
        address: 'TBC'
      },
      subcontractor: {
        name: awardData?.recommended_supplier || 'TBC',
        contact: 'TBC',
        email: 'TBC',
        phone: 'TBC'
      },
      award: mode === 'commercial' ? {
        totalAmount: awardData?.recommended_total || 0,
        awardedDate: awardData?.created_at
      } : undefined,
      commercial: mode === 'commercial' ? {
        paymentTerms: '20th following month, 22 working days payment',
        retentions: '3% standard retention',
        liquidatedDamages: 'None specified'
      } : undefined,
      systems: (systemsData || []).map(sys => ({
        system: sys.system_name || 'Unknown system',
        rating: sys.frr || 'TBC',
        substrate: sys.substrate || 'TBC',
        locations: sys.typical_locations || 'See scope matrix',
        included: sys.is_included ? 'Yes' : 'No'
      })),
      inclusions: [
        'All passive fire stopping to service penetrations as per fire engineering report and drawings.',
        'Intumescent coatings to structural steel members identified as requiring FRR.',
        'Supply of QA documentation including labels, photos, and PS3.',
        'All materials, labour, and equipment necessary to complete the works.',
        'Site-specific SWMS and induction for all personnel.'
      ],
      exclusions: [
        'Remediation of pre-existing, non-compliant fire stopping.',
        'Temporary services penetrations.',
        'Access equipment and out-of-hours work unless specifically agreed.',
        'Works to penetrations not shown on drawings or schedules.',
        'Delays caused by incomplete services installations or lack of access.'
      ],
      assumptions: [
        'All penetrations are accessible without scaffolding or EWP.',
        'Services installations are complete prior to fire stopping works.',
        'Substrate is in good condition and ready to receive fire stopping.',
        'Working hours are standard day shift (7am-5pm weekdays).',
        'Site facilities (power, water, parking) are available.'
      ],
      allowances: [
        {
          description: 'Remedial fire stopping allowance',
          quantity: '20',
          unit: 'openings',
          rate: mode === 'commercial' ? 250.00 : undefined,
          total: mode === 'commercial' ? 5000.00 : undefined
        },
        {
          description: 'Access equipment allowance',
          quantity: '1',
          unit: 'Lump sum',
          rate: undefined,
          total: mode === 'commercial' ? 8500.00 : undefined
        },
        {
          description: 'Provisional sum - additional works',
          quantity: 'As directed',
          unit: 'Lump sum',
          rate: undefined,
          total: mode === 'commercial' ? 10000.00 : undefined
        }
      ],
      variations: [],
      generatedAt: new Date().toISOString(),
      generatedBy: 'System'
    };

    const htmlContent = mode === 'site'
      ? generateSiteScopeHTML(packData)
      : generateCommercialHTML(packData);

    return new Response(
      JSON.stringify({
        html: htmlContent,
        data: packData
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
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

function generateSiteScopeHTML(data: HandoverPackData): string {
  const showMoney = false;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Site Scope Pack - ${data.project.name}</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; padding: 40px; max-width: 900px; margin: 0 auto; }
    h1 { color: #1e40af; font-size: 32px; border-bottom: 3px solid #1e40af; padding-bottom: 10px; }
    h2 { color: #1e40af; font-size: 24px; margin-top: 40px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
    h3 { color: #374151; font-size: 18px; margin-top: 20px; }
    .info-grid { display: grid; grid-template-columns: 200px 1fr; gap: 12px; margin: 20px 0; }
    .info-label { font-weight: bold; color: #6b7280; }
    .info-value { color: #1f2937; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th { background: #f3f4f6; padding: 12px; text-align: left; border: 1px solid #d1d5db; font-weight: bold; }
    td { padding: 10px; border: 1px solid #d1d5db; }
    ul { margin: 10px 0; padding-left: 25px; }
    li { margin: 8px 0; }
    .cover { text-align: center; margin-bottom: 60px; }
    .cover h1 { border: none; font-size: 42px; }
    .cover .subtitle { font-size: 24px; color: #6b7280; margin: 20px 0; }
    .note { background: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="cover">
    <h1>Site Scope Pack</h1>
    <div class="subtitle">Passive Fire Protection</div>
    <h2 style="border:none; margin-top: 40px;">${data.project.name}</h2>
    <p>Generated: ${new Date(data.generatedAt).toLocaleDateString()}</p>
  </div>

  <h2>1. Project & Contacts</h2>
  <div class="info-grid">
    <div class="info-label">Project</div>
    <div class="info-value">${data.project.name}</div>
    <div class="info-label">Client</div>
    <div class="info-value">${data.project.client}</div>
    <div class="info-label">Main Contractor</div>
    <div class="info-value">${data.project.mainContractor}</div>
    <div class="info-label">Subcontractor</div>
    <div class="info-value">${data.subcontractor.name}</div>
  </div>

  <h2>2. Systems & Locations</h2>
  ${data.systems.length > 0 ? `
  <table>
    <thead>
      <tr>
        <th>System / Detail</th>
        <th>Rating</th>
        <th>Substrate</th>
        <th>Typical Locations</th>
        <th>Included</th>
      </tr>
    </thead>
    <tbody>
      ${data.systems.map(sys => `
      <tr>
        <td>${sys.system}</td>
        <td>${sys.rating}</td>
        <td>${sys.substrate || 'Various'}</td>
        <td>${sys.locations || 'See scope matrix'}</td>
        <td>${sys.included}</td>
      </tr>
      `).join('')}
    </tbody>
  </table>
  ` : '<p>Systems will be populated from the Scope Matrix.</p>'}

  <h2>3. Quantities & Allowances</h2>
  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th>Quantity</th>
        <th>Unit</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>
      ${data.allowances.map(allowance => `
      <tr>
        <td>${allowance.description}</td>
        <td>${allowance.quantity}</td>
        <td>${allowance.unit}</td>
        <td>${allowance.notes || '-'}</td>
      </tr>
      `).join('')}
    </tbody>
  </table>

  <h2>4. Inclusions</h2>
  <ul>
    ${data.inclusions.map(item => `<li>${item}</li>`).join('')}
  </ul>

  <h2>5. Exclusions</h2>
  <ul>
    ${data.exclusions.map(item => `<li>${item}</li>`).join('')}
  </ul>

  <h2>6. Assumptions</h2>
  <ul>
    ${data.assumptions.map(item => `<li>${item}</li>`).join('')}
  </ul>

  <h2>7. Variation Process</h2>
  <div class="note">
    <h3>When to Raise a Variation</h3>
    <p>A variation should be raised for any work that is:</p>
    <ul>
      <li>Not included in the original scope or drawings</li>
      <li>Additional to the quantities allowed in this scope pack</li>
      <li>Changed from the specified systems or methods</li>
      <li>Subject to delays or site conditions beyond our control</li>
    </ul>

    <h3>How to Record</h3>
    <p>When identifying variation work, please document:</p>
    <ul>
      <li>Photos showing the location and condition</li>
      <li>Grid reference, level, and room number</li>
      <li>Service type and size</li>
      <li>Reason the work is additional or varied</li>
    </ul>

    <h3>Who to Contact</h3>
    <p>For variation queries, contact the Project Manager or QS listed in your project contacts.</p>
  </div>

  <p style="margin-top: 60px; text-align: center; color: #6b7280; font-size: 12px;">
    This is a site scope pack with no pricing information. For commercial details, refer to the Commercial Handover Pack.
  </p>
</body>
</html>
  `.trim();
}

function generateCommercialHTML(data: HandoverPackData): string {
  const showMoney = true;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Commercial Handover Pack - ${data.project.name}</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; padding: 40px; max-width: 900px; margin: 0 auto; }
    h1 { color: #1e40af; font-size: 32px; border-bottom: 3px solid #1e40af; padding-bottom: 10px; }
    h2 { color: #1e40af; font-size: 24px; margin-top: 40px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
    h3 { color: #374151; font-size: 18px; margin-top: 20px; }
    .info-grid { display: grid; grid-template-columns: 200px 1fr; gap: 12px; margin: 20px 0; }
    .info-label { font-weight: bold; color: #6b7280; }
    .info-value { color: #1f2937; }
    .info-value.money { color: #059669; font-weight: bold; font-size: 18px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th { background: #f3f4f6; padding: 12px; text-align: left; border: 1px solid #d1d5db; font-weight: bold; }
    td { padding: 10px; border: 1px solid #d1d5db; }
    td.number { text-align: right; }
    ul { margin: 10px 0; padding-left: 25px; }
    li { margin: 8px 0; }
    .cover { text-align: center; margin-bottom: 60px; }
    .cover h1 { border: none; font-size: 42px; }
    .cover .subtitle { font-size: 24px; color: #6b7280; margin: 20px 0; }
    .total-row { background: #f9fafb; font-weight: bold; }
  </style>
</head>
<body>
  <div class="cover">
    <h1>Commercial Handover Pack</h1>
    <div class="subtitle">Passive Fire Protection Contract</div>
    <h2 style="border:none; margin-top: 40px;">${data.project.name}</h2>
    <p>Generated: ${new Date(data.generatedAt).toLocaleDateString()}</p>
  </div>

  <h2>1. Contract Summary</h2>
  <div class="info-grid">
    <div class="info-label">Project</div>
    <div class="info-value">${data.project.name}</div>
    <div class="info-label">Client</div>
    <div class="info-value">${data.project.client}</div>
    <div class="info-label">Main Contractor</div>
    <div class="info-value">${data.project.mainContractor}</div>
    <div class="info-label">Subcontractor</div>
    <div class="info-value">${data.subcontractor.name}</div>
    <div class="info-label">Subcontract Sum</div>
    <div class="info-value money">$${(data.award?.totalAmount || 0).toLocaleString()}</div>
    <div class="info-label">Payment Terms</div>
    <div class="info-value">${data.commercial?.paymentTerms}</div>
    <div class="info-label">Retentions</div>
    <div class="info-value">${data.commercial?.retentions}</div>
    <div class="info-label">Liquidated Damages</div>
    <div class="info-value">${data.commercial?.liquidatedDamages}</div>
  </div>

  <h2>2. Scope & Systems Overview</h2>
  ${data.systems.length > 0 ? `
  <table>
    <thead>
      <tr>
        <th>System</th>
        <th>Rating</th>
        <th>Substrate</th>
        <th>Included</th>
      </tr>
    </thead>
    <tbody>
      ${data.systems.map(sys => `
      <tr>
        <td>${sys.system}</td>
        <td>${sys.rating}</td>
        <td>${sys.substrate || 'Various'}</td>
        <td>${sys.included}</td>
      </tr>
      `).join('')}
    </tbody>
  </table>
  ` : '<p>Systems will be populated from the Scope Matrix.</p>'}

  <h2>3. Inclusions</h2>
  <ul>
    ${data.inclusions.map(item => `<li>${item}</li>`).join('')}
  </ul>

  <h2>4. Exclusions</h2>
  <ul>
    ${data.exclusions.map(item => `<li>${item}</li>`).join('')}
  </ul>

  <h2>5. Assumptions</h2>
  <ul>
    ${data.assumptions.map(item => `<li>${item}</li>`).join('')}
  </ul>

  <h2>6. Allowances & Provisional Sums</h2>
  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th>Qty/Basis</th>
        <th>Rate</th>
        <th>Total</th>
      </tr>
    </thead>
    <tbody>
      ${data.allowances.map(allowance => `
      <tr>
        <td>${allowance.description}</td>
        <td>${allowance.quantity} ${allowance.unit}</td>
        <td class="number">${allowance.rate ? '$' + allowance.rate.toLocaleString() : '-'}</td>
        <td class="number">${allowance.total ? '$' + allowance.total.toLocaleString() : '-'}</td>
      </tr>
      `).join('')}
      <tr class="total-row">
        <td colspan="3">Total Allowances</td>
        <td class="number">$${data.allowances.reduce((sum, a) => sum + (a.total || 0), 0).toLocaleString()}</td>
      </tr>
    </tbody>
  </table>

  <h2>7. Variations Summary</h2>
  ${data.variations.length > 0 ? `
  <table>
    <thead>
      <tr>
        <th>Number</th>
        <th>Description</th>
        <th>Status</th>
        <th>Amount</th>
      </tr>
    </thead>
    <tbody>
      ${data.variations.map(v => `
      <tr>
        <td>${v.number}</td>
        <td>${v.description}</td>
        <td>${v.status}</td>
        <td class="number">${v.amount ? '$' + v.amount.toLocaleString() : '-'}</td>
      </tr>
      `).join('')}
    </tbody>
  </table>
  ` : '<p>No variations recorded.</p>'}

  <p style="margin-top: 60px; text-align: center; color: #6b7280; font-size: 12px;">
    This is a commercial handover pack with full contract details. For site use without pricing, refer to the Site Scope Pack.
  </p>
</body>
</html>
  `.trim();
}
