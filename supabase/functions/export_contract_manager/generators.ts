import { generateFastPreletAppendix } from './preletAppendixGenerator.ts';

export function generateJuniorPackHTML(): string {
  throw new Error('Junior pack not implemented in this version');
}

export function generateSeniorReportHTML(): string {
  throw new Error('Senior report not implemented in this version');
}

export function generatePreletAppendixHTML(
  projectName: string,
  supplierName: string,
  totalAmount: number,
  appendixData: any,
  organisationLogoUrl?: string
): string {
  console.log('[PRELET] Using FAST generator (optimized for speed)');
  return generateFastPreletAppendix(
    projectName,
    supplierName,
    appendixData,
    organisationLogoUrl
  );
}

export function generateSA2017AgreementHTML(
  agreement: any,
  template: any,
  fields: any[],
  fieldValues: Record<string, any>,
  project: any,
  organisationLogoUrl?: string
): string {
  console.log('[SA-2017] Generating comprehensive agreement PDF');

  // Define the proper section order matching SA-2017 standard
  const sectionOrder = [
    'Contract Identity',
    'Parties',
    'Background & Scope',
    'Bonds & Guarantees',
    'Insurance',
    'Variations',
    'Time',
    'Defects',
    'Payments',
    'Miscellaneous',
    'Additional Documents',
    'Special Conditions',
    'Signatures'
  ];

  const fieldsBySection: Record<string, any[]> = {};
  fields.forEach(field => {
    if (!fieldsBySection[field.section]) {
      fieldsBySection[field.section] = [];
    }
    fieldsBySection[field.section].push(field);
  });

  Object.keys(fieldsBySection).forEach(section => {
    fieldsBySection[section].sort((a, b) => (a.field_order || 0) - (b.field_order || 0));
  });

  const sections = sectionOrder.filter(section => fieldsBySection[section]?.length > 0);

  const escapeHtml = (text: string): string => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return String(text || '').replace(/[&<>"']/g, m => map[m]);
  };

  const formatFieldValue = (field: any, value: any): string => {
    if (!value || !value.field_value) return '<span style="color: #94a3b8; font-style: italic;">Not specified</span>';

    const val = value.field_value;

    if (field.field_type === 'textarea') {
      return val.split('\n').map((line: string) => `<p style="margin-bottom: 0.5em;">${escapeHtml(line)}</p>`).join('');
    }

    if (field.field_type === 'number' || field.field_key?.includes('price') || field.field_key?.includes('amount') || field.field_key?.includes('value')) {
      const num = parseFloat(val);
      if (!isNaN(num)) {
        return `$${num.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }
    }

    if (field.field_key?.includes('percentage')) {
      return `${val}%`;
    }

    if (field.field_type === 'date') {
      try {
        const date = new Date(val);
        return date.toLocaleDateString('en-NZ', { year: 'numeric', month: 'long', day: 'numeric' });
      } catch {
        return escapeHtml(val);
      }
    }

    return escapeHtml(val);
  };

  const getFieldValue = (key: string): string => {
    const value = fieldValues[key];
    if (!value || !value.field_value) return '<span style="color: #94a3b8; font-style: italic;">Not specified</span>';
    return escapeHtml(value.field_value);
  };

  const getFieldValueRaw = (key: string): string => {
    const value = fieldValues[key];
    return value?.field_value || '';
  };

  // Generate comprehensive SA-2017 document
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SA-2017 Subcontract Agreement - ${agreement.agreement_number}</title>
  <style>
    @page {
      size: A4;
      margin: 25mm 20mm;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 11pt;
      line-height: 1.5;
      color: #000;
      background: white;
    }

    .container {
      max-width: 170mm;
      margin: 0 auto;
    }

    /* Cover Page */
    .cover-page {
      text-align: center;
      page-break-after: always;
      padding-top: 80px;
    }

    .cover-logo {
      max-height: 80px;
      margin-bottom: 40px;
    }

    .cover-title {
      font-size: 22pt;
      font-weight: bold;
      margin-bottom: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .cover-subtitle {
      font-size: 14pt;
      margin-bottom: 60px;
      color: #333;
    }

    .cover-details {
      margin-top: 60px;
      text-align: left;
      border: 2px solid #000;
      padding: 30px;
    }

    .cover-detail-row {
      display: flex;
      margin-bottom: 20px;
      border-bottom: 1px solid #ccc;
      padding-bottom: 10px;
    }

    .cover-detail-label {
      font-weight: bold;
      width: 150px;
      flex-shrink: 0;
    }

    .cover-detail-value {
      flex: 1;
    }

    /* Document Structure */
    h1 {
      font-size: 16pt;
      font-weight: bold;
      margin: 30px 0 15px 0;
      text-align: center;
      text-transform: uppercase;
      page-break-before: always;
      page-break-after: avoid;
    }

    h2 {
      font-size: 14pt;
      font-weight: bold;
      margin: 25px 0 12px 0;
      page-break-after: avoid;
    }

    h3 {
      font-size: 12pt;
      font-weight: bold;
      margin: 20px 0 10px 0;
      page-break-after: avoid;
    }

    .clause {
      margin-bottom: 15px;
      page-break-inside: avoid;
    }

    .clause-number {
      font-weight: bold;
      display: inline-block;
      min-width: 40px;
    }

    .clause-text {
      display: inline;
    }

    .sub-clause {
      margin-left: 40px;
      margin-top: 8px;
    }

    /* Recitals */
    .recitals {
      margin: 30px 0;
      font-style: italic;
    }

    .recital {
      margin-bottom: 15px;
      text-align: justify;
    }

    /* Agreement Terms */
    .terms-section {
      margin: 30px 0;
    }

    .definition-list {
      margin-left: 20px;
    }

    .definition-item {
      margin-bottom: 12px;
    }

    .definition-term {
      font-weight: bold;
      font-style: italic;
    }

    /* Field Display */
    .field-display {
      background: #f9f9f9;
      border-left: 4px solid #0066cc;
      padding: 12px 15px;
      margin: 10px 0;
      page-break-inside: avoid;
    }

    .field-label {
      font-weight: bold;
      font-size: 10pt;
      color: #333;
      margin-bottom: 5px;
    }

    .field-value {
      font-size: 11pt;
      line-height: 1.6;
    }

    /* Schedule/Table */
    .schedule-table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      page-break-inside: avoid;
    }

    .schedule-table th {
      background: #333;
      color: white;
      padding: 10px;
      text-align: left;
      font-weight: bold;
      border: 1px solid #333;
    }

    .schedule-table td {
      padding: 10px;
      border: 1px solid #999;
      vertical-align: top;
    }

    .schedule-table tr:nth-child(even) {
      background: #f9f9f9;
    }

    /* Signature Block */
    .signature-section {
      margin-top: 60px;
      page-break-inside: avoid;
    }

    .signature-block {
      margin: 40px 0;
      page-break-inside: avoid;
    }

    .signature-line {
      border-top: 2px solid #000;
      width: 250px;
      margin-top: 60px;
      padding-top: 5px;
    }

    .signature-details {
      margin-top: 10px;
      font-size: 10pt;
    }

    /* Footer */
    .document-footer {
      margin-top: 50px;
      padding-top: 20px;
      border-top: 1px solid #999;
      font-size: 9pt;
      color: #666;
      text-align: center;
    }

    /* Print Optimization */
    @media print {
      body {
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }
      .page-break {
        page-break-before: always;
      }
      h1, h2, h3 {
        page-break-after: avoid;
      }
      .clause, .field-display, .signature-block {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="container">

    <!-- COVER PAGE -->
    <div class="cover-page">
      ${organisationLogoUrl ? `<img src="${organisationLogoUrl}" alt="Organisation Logo" class="cover-logo">` : ''}

      <div class="cover-title">Subcontract Agreement</div>
      <div class="cover-subtitle">SA-2017<br/>Under the Construction Contracts Act 2002</div>

      <div class="cover-details">
        <div class="cover-detail-row">
          <div class="cover-detail-label">Agreement No:</div>
          <div class="cover-detail-value">${agreement.agreement_number || 'SA-2017-XXX'}</div>
        </div>
        <div class="cover-detail-row">
          <div class="cover-detail-label">Project:</div>
          <div class="cover-detail-value">${getFieldValue('project_name')}</div>
        </div>
        <div class="cover-detail-row">
          <div class="cover-detail-label">Location:</div>
          <div class="cover-detail-value">${getFieldValue('project_location')}</div>
        </div>
        <div class="cover-detail-row">
          <div class="cover-detail-label">Head Contractor:</div>
          <div class="cover-detail-value">${getFieldValue('head_contractor_name')}</div>
        </div>
        <div class="cover-detail-row">
          <div class="cover-detail-label">Subcontractor:</div>
          <div class="cover-detail-value">${getFieldValue('subcontractor_name')}</div>
        </div>
        <div class="cover-detail-row">
          <div class="cover-detail-label">Trade:</div>
          <div class="cover-detail-value">${project?.trade || 'N/A'}</div>
        </div>
        <div class="cover-detail-row">
          <div class="cover-detail-label">Date:</div>
          <div class="cover-detail-value">${getFieldValue('contract_date')}</div>
        </div>
      </div>
    </div>

    <!-- AGREEMENT DOCUMENT -->
    <h1>Subcontract Agreement</h1>

    <div class="recitals">
      <p class="recital">
        <strong>THIS AGREEMENT</strong> is made on ${getFieldValue('contract_date')}
      </p>
      <p class="recital">
        <strong>BETWEEN:</strong>
      </p>
      <p class="recital">
        ${getFieldValue('head_contractor_name')} of ${getFieldValue('head_contractor_address')}
        (hereinafter called "the Head Contractor")
      </p>
      <p class="recital">
        <strong>AND:</strong>
      </p>
      <p class="recital">
        ${getFieldValue('subcontractor_name')} of ${getFieldValue('subcontractor_address')}
        (hereinafter called "the Subcontractor")
      </p>
    </div>

    <h2>Background</h2>
    <div class="clause">
      <span class="clause-number">A.</span>
      <span class="clause-text">
        The Head Contractor has entered into a contract (the "Head Contract") referenced as
        ${getFieldValue('head_contract_reference')} with respect to the project known as
        ${getFieldValue('project_name')}.
      </span>
    </div>
    <div class="clause">
      <span class="clause-number">B.</span>
      <span class="clause-text">
        The Head Contractor requires the Subcontractor to carry out certain works forming part of
        the Head Contract works, and the Subcontractor has agreed to carry out such works on the
        terms and conditions set out in this Agreement.
      </span>
    </div>
    <div class="clause">
      <span class="clause-number">C.</span>
      <span class="clause-text">
        This Agreement is subject to the Construction Contracts Act 2002 and the parties acknowledge
        that they have been advised of their rights under that Act, including the right to refer
        disputes to adjudication.
      </span>
    </div>

    <h2>Operative Provisions</h2>

    <h3>1. Contract Identity</h3>
    <div class="field-display">
      <div class="field-label">Contract Reference:</div>
      <div class="field-value">${getFieldValue('contract_reference')}</div>
    </div>
    <div class="field-display">
      <div class="field-label">Contract Date:</div>
      <div class="field-value">${getFieldValue('contract_date')}</div>
    </div>
    <div class="field-display">
      <div class="field-label">Project Name:</div>
      <div class="field-value">${getFieldValue('project_name')}</div>
    </div>
    <div class="field-display">
      <div class="field-label">Project Location:</div>
      <div class="field-value">${getFieldValue('project_location')}</div>
    </div>

    <h3>2. Parties to the Agreement</h3>

    <h4 style="font-size: 11pt; margin: 15px 0 10px 0;">Head Contractor Details:</h4>
    <div class="field-display">
      <div class="field-label">Name:</div>
      <div class="field-value">${getFieldValue('head_contractor_name')}</div>
    </div>
    <div class="field-display">
      <div class="field-label">Address:</div>
      <div class="field-value">${getFieldValue('head_contractor_address')}</div>
    </div>
    <div class="field-display">
      <div class="field-label">Contact Person:</div>
      <div class="field-value">${getFieldValue('head_contractor_contact')}</div>
    </div>
    <div class="field-display">
      <div class="field-label">Email:</div>
      <div class="field-value">${getFieldValue('head_contractor_email')}</div>
    </div>
    <div class="field-display">
      <div class="field-label">Phone:</div>
      <div class="field-value">${getFieldValue('head_contractor_phone')}</div>
    </div>

    <h4 style="font-size: 11pt; margin: 20px 0 10px 0;">Subcontractor Details:</h4>
    <div class="field-display">
      <div class="field-label">Name:</div>
      <div class="field-value">${getFieldValue('subcontractor_name')}</div>
    </div>
    <div class="field-display">
      <div class="field-label">Address:</div>
      <div class="field-value">${getFieldValue('subcontractor_address')}</div>
    </div>
    <div class="field-display">
      <div class="field-label">Contact Person:</div>
      <div class="field-value">${getFieldValue('subcontractor_contact')}</div>
    </div>
    <div class="field-display">
      <div class="field-label">Email:</div>
      <div class="field-value">${getFieldValue('subcontractor_email')}</div>
    </div>
    <div class="field-display">
      <div class="field-label">Phone:</div>
      <div class="field-value">${getFieldValue('subcontractor_phone')}</div>
    </div>

    <div class="page-break"></div>

    <h3>3. Subcontract Works</h3>
    <div class="clause">
      <span class="clause-number">3.1</span>
      <span class="clause-text">
        The Subcontractor shall execute and complete the Subcontract Works described below and any
        works reasonably incidental thereto in accordance with this Agreement.
      </span>
    </div>
    <div class="field-display">
      <div class="field-label">Description of Subcontract Works:</div>
      <div class="field-value">${getFieldValue('subcontract_works_description')}</div>
    </div>
    <div class="field-display">
      <div class="field-label">Scope Documents:</div>
      <div class="field-value">${getFieldValue('scope_documents')}</div>
    </div>
    <div class="field-display">
      <div class="field-label">Exclusions from Scope:</div>
      <div class="field-value">${getFieldValue('exclusions')}</div>
    </div>

    <h3>4. Contract Price</h3>
    <div class="clause">
      <span class="clause-number">4.1</span>
      <span class="clause-text">
        The Contract Price for the Subcontract Works shall be:
      </span>
    </div>
    <div class="field-display">
      <div class="field-label">Contract Price (excluding GST):</div>
      <div class="field-value">${getFieldValue('contract_price')}</div>
    </div>
    <div class="field-display">
      <div class="field-label">Price Basis:</div>
      <div class="field-value">${getFieldValue('contract_price_basis')}</div>
    </div>
    <div class="field-display">
      <div class="field-label">GST Inclusive:</div>
      <div class="field-value">${getFieldValue('gst_inclusive')}</div>
    </div>

    <h3>5. Time for Completion</h3>
    <div class="field-display">
      <div class="field-label">Commencement Date:</div>
      <div class="field-value">${getFieldValue('commencement_date')}</div>
    </div>
    <div class="field-display">
      <div class="field-label">Completion Date:</div>
      <div class="field-value">${getFieldValue('completion_date')}</div>
    </div>
    <div class="field-display">
      <div class="field-label">Programme Provided:</div>
      <div class="field-value">${getFieldValue('programme_provided')}</div>
    </div>
    <div class="field-display">
      <div class="field-label">Liquidated Damages Applicable:</div>
      <div class="field-value">${getFieldValue('liquidated_damages_applicable')}</div>
    </div>
    ${getFieldValueRaw('liquidated_damages_applicable') === 'Yes' ? `
    <div class="field-display">
      <div class="field-label">Liquidated Damages Rate (per day):</div>
      <div class="field-value">${getFieldValue('liquidated_damages_rate')}</div>
    </div>` : ''}

    <h3>6. Payment Terms</h3>
    <div class="clause">
      <span class="clause-number">6.1</span>
      <span class="clause-text">
        The Subcontractor shall submit payment claims in accordance with the Construction Contracts
        Act 2002 and the following provisions:
      </span>
    </div>
    <div class="field-display">
      <div class="field-label">Payment Claim Frequency:</div>
      <div class="field-value">${getFieldValue('payment_claim_frequency')}</div>
    </div>
    <div class="field-display">
      <div class="field-label">Payment Claim Date:</div>
      <div class="field-value">${getFieldValue('payment_claim_date')}</div>
    </div>
    <div class="field-display">
      <div class="field-label">Payment Terms (days):</div>
      <div class="field-value">${getFieldValue('payment_terms_days')}</div>
    </div>
    <div class="field-display">
      <div class="field-label">Buyer-Created Tax Invoice:</div>
      <div class="field-value">${getFieldValue('buyer_created_tax_invoice')}</div>
    </div>
    ${getFieldValueRaw('buyer_created_tax_invoice') === 'Yes' ? `
    <div class="clause" style="margin-top: 15px; background: #fffbeb; padding: 15px; border-left: 4px solid #f59e0b;">
      <strong>Note:</strong> The parties agree that the Head Contractor may issue tax invoices on behalf
      of the Subcontractor in accordance with section 24(7) of the Goods and Services Tax Act 1985.
    </div>` : ''}

    <div class="page-break"></div>

    <h3>7. Retention</h3>
    <div class="field-display">
      <div class="field-label">Retention Required:</div>
      <div class="field-value">${getFieldValue('retention_required')}</div>
    </div>
    ${getFieldValueRaw('retention_required') === 'Yes' ? `
    <div class="field-display">
      <div class="field-label">Retention Percentage:</div>
      <div class="field-value">${getFieldValue('retention_percentage')}</div>
    </div>
    <div class="clause" style="margin-top: 15px;">
      <span class="clause-number">7.1</span>
      <span class="clause-text">
        The Head Contractor may withhold retention monies in accordance with the percentage specified
        above. Half of the retention shall be released upon Practical Completion, and the balance upon
        expiry of the Defects Liability Period, subject to the rectification of any defects.
      </span>
    </div>` : ''}

    <h3>8. Defects Liability</h3>
    <div class="field-display">
      <div class="field-label">Defects Liability Period (months):</div>
      <div class="field-value">${getFieldValue('defects_liability_period')}</div>
    </div>
    <div class="field-display">
      <div class="field-label">Defects Notification Process:</div>
      <div class="field-value">${getFieldValue('defects_notification_process')}</div>
    </div>
    <div class="field-display">
      <div class="field-label">Warranty Requirements:</div>
      <div class="field-value">${getFieldValue('warranty_requirements')}</div>
    </div>
    <div class="field-display">
      <div class="field-label">Maintenance Manuals Required:</div>
      <div class="field-value">${getFieldValue('maintenance_manuals_required')}</div>
    </div>

    <h3>9. Insurance</h3>
    <div class="field-display">
      <div class="field-label">Public Liability Insurance Required:</div>
      <div class="field-value">${getFieldValue('public_liability_required')}</div>
    </div>
    ${getFieldValueRaw('public_liability_required') === 'Yes' ? `
    <div class="field-display">
      <div class="field-label">Public Liability Cover Amount:</div>
      <div class="field-value">${getFieldValue('public_liability_amount')}</div>
    </div>` : ''}
    <div class="field-display">
      <div class="field-label">Contract Works Insurance:</div>
      <div class="field-value">${getFieldValue('contract_works_insurance')}</div>
    </div>
    <div class="field-display">
      <div class="field-label">Professional Indemnity Required:</div>
      <div class="field-value">${getFieldValue('professional_indemnity_required')}</div>
    </div>
    ${getFieldValueRaw('professional_indemnity_required') === 'Yes' ? `
    <div class="field-display">
      <div class="field-label">Professional Indemnity Amount:</div>
      <div class="field-value">${getFieldValue('professional_indemnity_amount')}</div>
    </div>` : ''}

    <h3>10. Bonds and Guarantees</h3>
    <div class="field-display">
      <div class="field-label">Performance Bond Required:</div>
      <div class="field-value">${getFieldValue('performance_bond_required')}</div>
    </div>
    ${getFieldValueRaw('performance_bond_required') === 'Yes' ? `
    <div class="field-display">
      <div class="field-label">Performance Bond Percentage:</div>
      <div class="field-value">${getFieldValue('performance_bond_percentage')}</div>
    </div>
    <div class="field-display">
      <div class="field-label">Performance Bond Value:</div>
      <div class="field-value">${getFieldValue('performance_bond_value')}</div>
    </div>
    <div class="field-display">
      <div class="field-label">Performance Bond Expiry Date:</div>
      <div class="field-value">${getFieldValue('performance_bond_expiry')}</div>
    </div>` : ''}
    <div class="field-display">
      <div class="field-label">Parent Company Guarantee Required:</div>
      <div class="field-value">${getFieldValue('parent_company_guarantee')}</div>
    </div>

    <div class="page-break"></div>

    <h3>11. Variations</h3>
    <div class="clause">
      <span class="clause-number">11.1</span>
      <span class="clause-text">
        The Head Contractor may direct variations to the Subcontract Works. The Subcontractor shall
        not commence any varied work without written authorization from the Head Contractor.
      </span>
    </div>
    <div class="field-display">
      <div class="field-label">Variation Approval Threshold:</div>
      <div class="field-value">${getFieldValue('variation_approval_threshold')}</div>
    </div>
    <div class="field-display">
      <div class="field-label">Variation Process:</div>
      <div class="field-value">${getFieldValue('variation_process')}</div>
    </div>
    <div class="field-display">
      <div class="field-label">Daywork Rates Agreed:</div>
      <div class="field-value">${getFieldValue('daywork_rates_agreed')}</div>
    </div>
    ${getFieldValueRaw('daywork_rates_agreed') === 'Yes' ? `
    <div class="field-display">
      <div class="field-label">Daywork Schedule Reference:</div>
      <div class="field-value">${getFieldValue('daywork_schedule')}</div>
    </div>` : ''}

    <h3>12. Dispute Resolution</h3>
    <div class="field-display">
      <div class="field-label">Dispute Resolution Process:</div>
      <div class="field-value">${getFieldValue('dispute_resolution_process')}</div>
    </div>
    <div class="field-display">
      <div class="field-label">Adjudication Agreement (CCA 2002):</div>
      <div class="field-value">${getFieldValue('adjudication_agreement')}</div>
    </div>
    <div class="clause" style="margin-top: 15px; background: #eff6ff; padding: 15px; border-left: 4px solid #2563eb;">
      <strong>Construction Contracts Act 2002:</strong> The parties acknowledge that they have been
      advised of their rights under the Construction Contracts Act 2002, including the right to refer
      disputes to adjudication. Any party may refer a dispute to adjudication at any time.
    </div>

    <h3>13. General Provisions</h3>
    <div class="field-display">
      <div class="field-label">Health & Safety Plan Required:</div>
      <div class="field-value">${getFieldValue('health_safety_plan_required')}</div>
    </div>
    <div class="field-display">
      <div class="field-label">Quality Assurance Required:</div>
      <div class="field-value">${getFieldValue('quality_assurance_required')}</div>
    </div>
    <div class="field-display">
      <div class="field-label">Assignment of Subcontract Allowed:</div>
      <div class="field-value">${getFieldValue('assignment_allowed')}</div>
    </div>
    <div class="field-display">
      <div class="field-label">Governing Law:</div>
      <div class="field-value">${getFieldValue('governing_law')}</div>
    </div>

    <h3>14. Contract Documents</h3>
    <div class="clause">
      <span class="clause-number">14.1</span>
      <span class="clause-text">
        The following documents form part of this Agreement and shall be read together:
      </span>
    </div>
    <div class="field-display">
      <div class="field-label">Drawings List:</div>
      <div class="field-value">${getFieldValue('drawings_list')}</div>
    </div>
    <div class="field-display">
      <div class="field-label">Specifications List:</div>
      <div class="field-value">${getFieldValue('specifications_list')}</div>
    </div>
    <div class="field-display">
      <div class="field-label">Other Contract Documents:</div>
      <div class="field-value">${getFieldValue('other_documents')}</div>
    </div>

    ${getFieldValueRaw('special_conditions_text') ? `
    <h3>15. Special Conditions</h3>
    <div class="field-display">
      <div class="field-value">${getFieldValue('special_conditions_text')}</div>
    </div>` : ''}

    <div class="page-break"></div>

    <!-- EXECUTION -->
    <h1>Execution</h1>

    <div class="clause" style="margin-bottom: 40px;">
      <p>The parties have executed this Agreement as a deed on the date stated at the beginning of this Agreement.</p>
    </div>

    <div class="signature-section">
      <h3>Head Contractor</h3>
      <div class="signature-block">
        <div style="margin-bottom: 20px;">
          <strong>Name of Signatory:</strong> ${getFieldValue('head_contractor_signatory_name')}
        </div>
        <div style="margin-bottom: 20px;">
          <strong>Title/Position:</strong> ${getFieldValue('head_contractor_signatory_title')}
        </div>
        <div class="signature-line">
          Signature
        </div>
        <div class="signature-details">
          <div>Date: ${getFieldValue('head_contractor_signature_date')}</div>
        </div>
      </div>
    </div>

    <div class="signature-section">
      <h3>Subcontractor</h3>
      <div class="signature-block">
        <div style="margin-bottom: 20px;">
          <strong>Name of Signatory:</strong> ${getFieldValue('subcontractor_signatory_name')}
        </div>
        <div style="margin-bottom: 20px;">
          <strong>Title/Position:</strong> ${getFieldValue('subcontractor_signatory_title')}
        </div>
        <div class="signature-line">
          Signature
        </div>
        <div class="signature-details">
          <div>Date: ${getFieldValue('subcontractor_signature_date')}</div>
        </div>
      </div>
    </div>

    <div class="document-footer">
      <p>This Subcontract Agreement was generated on ${new Date().toLocaleDateString('en-NZ', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })}</p>
      <p style="margin-top: 10px;">Agreement Reference: ${agreement.agreement_number}</p>
      <p style="margin-top: 5px; font-size: 8pt; color: #999;">
        This is a computer-generated document. Any amendments must be initialed by both parties.
      </p>
    </div>

  </div>
</body>
</html>
  `.trim();
}