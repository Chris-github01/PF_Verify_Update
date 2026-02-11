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
    if (!value || !value.field_value) return '';
    return escapeHtml(value.field_value);
  };

  const getFieldValueRaw = (key: string): string => {
    const value = fieldValues[key];
    return value?.field_value || '';
  };

  const hasFieldValue = (key: string): boolean => {
    const value = fieldValues[key];
    return !!(value && value.field_value && value.field_value.trim() !== '');
  };

  const renderFieldDisplay = (label: string, key: string): string => {
    if (!hasFieldValue(key)) return '';
    return `
    <div class="field-display">
      <div class="field-label">${label}:</div>
      <div class="field-value">${getFieldValue(key)}</div>
    </div>`;
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
      margin: 20px 0 12px 0;
      text-align: center;
      text-transform: uppercase;
      page-break-after: avoid;
    }

    h2 {
      font-size: 14pt;
      font-weight: bold;
      margin: 15px 0 10px 0;
      page-break-after: avoid;
    }

    h3 {
      font-size: 12pt;
      font-weight: bold;
      margin: 12px 0 8px 0;
      page-break-after: avoid;
    }

    .clause {
      margin-bottom: 10px;
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
      padding: 10px 12px;
      margin: 8px 0;
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
    ${renderFieldDisplay('Contract Reference', 'contract_reference')}
    ${renderFieldDisplay('Contract Date', 'contract_date')}
    ${renderFieldDisplay('Project Name', 'project_name')}
    ${renderFieldDisplay('Project Location', 'project_location')}

    <h3>2. Parties to the Agreement</h3>

    ${hasFieldValue('head_contractor_name') || hasFieldValue('head_contractor_address') || hasFieldValue('head_contractor_contact') ? `
    <h4 style="font-size: 11pt; margin: 15px 0 10px 0;">Head Contractor Details:</h4>
    ${renderFieldDisplay('Name', 'head_contractor_name')}
    ${renderFieldDisplay('Address', 'head_contractor_address')}
    ${renderFieldDisplay('Contact Person', 'head_contractor_contact')}
    ${renderFieldDisplay('Email', 'head_contractor_email')}
    ${renderFieldDisplay('Phone', 'head_contractor_phone')}
    ` : ''}

    ${hasFieldValue('subcontractor_name') || hasFieldValue('subcontractor_address') || hasFieldValue('subcontractor_contact') ? `
    <h4 style="font-size: 11pt; margin: 20px 0 10px 0;">Subcontractor Details:</h4>
    ${renderFieldDisplay('Name', 'subcontractor_name')}
    ${renderFieldDisplay('Address', 'subcontractor_address')}
    ${renderFieldDisplay('Contact Person', 'subcontractor_contact')}
    ${renderFieldDisplay('Email', 'subcontractor_email')}
    ${renderFieldDisplay('Phone', 'subcontractor_phone')}
    ` : ''}

    <h3>3. Subcontract Works</h3>
    <div class="clause">
      <span class="clause-number">3.1</span>
      <span class="clause-text">
        The Subcontractor shall execute and complete the Subcontract Works described below and any
        works reasonably incidental thereto in accordance with this Agreement.
      </span>
    </div>
    ${renderFieldDisplay('Description of Subcontract Works', 'subcontract_works_description')}
    ${renderFieldDisplay('Scope Documents', 'scope_documents')}
    ${renderFieldDisplay('Exclusions from Scope', 'exclusions')}

    <h3>4. Contract Price</h3>
    <div class="clause">
      <span class="clause-number">4.1</span>
      <span class="clause-text">
        The Contract Price for the Subcontract Works shall be:
      </span>
    </div>
    ${renderFieldDisplay('Contract Price (excluding GST)', 'contract_price')}
    ${renderFieldDisplay('Price Basis', 'contract_price_basis')}
    ${renderFieldDisplay('GST Inclusive', 'gst_inclusive')}

    <h3>5. Time for Completion</h3>
    ${renderFieldDisplay('Commencement Date', 'commencement_date')}
    ${renderFieldDisplay('Completion Date', 'completion_date')}
    ${renderFieldDisplay('Programme Provided', 'programme_provided')}
    ${renderFieldDisplay('Liquidated Damages Applicable', 'liquidated_damages_applicable')}
    ${hasFieldValue('liquidated_damages_rate') && getFieldValueRaw('liquidated_damages_applicable') === 'Yes' ? renderFieldDisplay('Liquidated Damages Rate (per day)', 'liquidated_damages_rate') : ''}

    <h3>6. Payment Terms</h3>
    <div class="clause">
      <span class="clause-number">6.1</span>
      <span class="clause-text">
        The Subcontractor shall submit payment claims in accordance with the Construction Contracts
        Act 2002 and the following provisions:
      </span>
    </div>
    ${renderFieldDisplay('Payment Claim Frequency', 'payment_claim_frequency')}
    ${renderFieldDisplay('Payment Claim Date', 'payment_claim_date')}
    ${renderFieldDisplay('Payment Terms (days)', 'payment_terms_days')}
    ${renderFieldDisplay('Buyer-Created Tax Invoice', 'buyer_created_tax_invoice')}
    ${getFieldValueRaw('buyer_created_tax_invoice') === 'Yes' ? `
    <div class="clause" style="margin-top: 15px; background: #fffbeb; padding: 15px; border-left: 4px solid #f59e0b;">
      <strong>Note:</strong> The parties agree that the Head Contractor may issue tax invoices on behalf
      of the Subcontractor in accordance with section 24(7) of the Goods and Services Tax Act 1985.
    </div>` : ''}

    ${hasFieldValue('retention_required') || hasFieldValue('retention_percentage') ? `
    <h3>7. Retention</h3>
    ${renderFieldDisplay('Retention Required', 'retention_required')}
    ${getFieldValueRaw('retention_required') === 'Yes' && hasFieldValue('retention_percentage') ? `
    ${renderFieldDisplay('Retention Percentage', 'retention_percentage')}
    <div class="clause" style="margin-top: 15px;">
      <span class="clause-number">7.1</span>
      <span class="clause-text">
        The Head Contractor may withhold retention monies in accordance with the percentage specified
        above. Half of the retention shall be released upon Practical Completion, and the balance upon
        expiry of the Defects Liability Period, subject to the rectification of any defects.
      </span>
    </div>` : ''}
    ` : ''}

    ${hasFieldValue('defects_liability_period') || hasFieldValue('defects_notification_process') || hasFieldValue('warranty_requirements') || hasFieldValue('maintenance_manuals_required') ? `
    <h3>8. Defects Liability</h3>
    ${renderFieldDisplay('Defects Liability Period (months)', 'defects_liability_period')}
    ${renderFieldDisplay('Defects Notification Process', 'defects_notification_process')}
    ${renderFieldDisplay('Warranty Requirements', 'warranty_requirements')}
    ${renderFieldDisplay('Maintenance Manuals Required', 'maintenance_manuals_required')}
    ` : ''}

    ${hasFieldValue('public_liability_required') || hasFieldValue('contract_works_insurance') || hasFieldValue('professional_indemnity_required') ? `
    <h3>9. Insurance</h3>
    ${renderFieldDisplay('Public Liability Insurance Required', 'public_liability_required')}
    ${hasFieldValue('public_liability_amount') && getFieldValueRaw('public_liability_required') === 'Yes' ? renderFieldDisplay('Public Liability Cover Amount', 'public_liability_amount') : ''}
    ${renderFieldDisplay('Contract Works Insurance', 'contract_works_insurance')}
    ${renderFieldDisplay('Professional Indemnity Required', 'professional_indemnity_required')}
    ${hasFieldValue('professional_indemnity_amount') && getFieldValueRaw('professional_indemnity_required') === 'Yes' ? renderFieldDisplay('Professional Indemnity Amount', 'professional_indemnity_amount') : ''}
    ` : ''}

    ${hasFieldValue('performance_bond_required') || hasFieldValue('parent_company_guarantee') ? `
    <h3>10. Bonds and Guarantees</h3>
    ${renderFieldDisplay('Performance Bond Required', 'performance_bond_required')}
    ${getFieldValueRaw('performance_bond_required') === 'Yes' ? `
    ${renderFieldDisplay('Performance Bond Percentage', 'performance_bond_percentage')}
    ${renderFieldDisplay('Performance Bond Value', 'performance_bond_value')}
    ${renderFieldDisplay('Performance Bond Expiry Date', 'performance_bond_expiry')}
    ` : ''}
    ${renderFieldDisplay('Parent Company Guarantee Required', 'parent_company_guarantee')}
    ` : ''}

    ${hasFieldValue('variation_approval_threshold') || hasFieldValue('variation_process') || hasFieldValue('daywork_rates_agreed') ? `
    <h3>11. Variations</h3>
    <div class="clause">
      <span class="clause-number">11.1</span>
      <span class="clause-text">
        The Head Contractor may direct variations to the Subcontract Works. The Subcontractor shall
        not commence any varied work without written authorization from the Head Contractor.
      </span>
    </div>
    ${renderFieldDisplay('Variation Approval Threshold', 'variation_approval_threshold')}
    ${renderFieldDisplay('Variation Process', 'variation_process')}
    ${renderFieldDisplay('Daywork Rates Agreed', 'daywork_rates_agreed')}
    ${hasFieldValue('daywork_schedule') && getFieldValueRaw('daywork_rates_agreed') === 'Yes' ? renderFieldDisplay('Daywork Schedule Reference', 'daywork_schedule') : ''}
    ` : ''}

    ${hasFieldValue('dispute_resolution_process') || hasFieldValue('adjudication_agreement') ? `
    <h3>12. Dispute Resolution</h3>
    ${renderFieldDisplay('Dispute Resolution Process', 'dispute_resolution_process')}
    ${renderFieldDisplay('Adjudication Agreement (CCA 2002)', 'adjudication_agreement')}
    <div class="clause" style="margin-top: 15px; background: #eff6ff; padding: 15px; border-left: 4px solid #2563eb;">
      <strong>Construction Contracts Act 2002:</strong> The parties acknowledge that they have been
      advised of their rights under the Construction Contracts Act 2002, including the right to refer
      disputes to adjudication. Any party may refer a dispute to adjudication at any time.
    </div>
    ` : ''}

    ${hasFieldValue('health_safety_plan_required') || hasFieldValue('quality_assurance_required') || hasFieldValue('assignment_allowed') || hasFieldValue('governing_law') ? `
    <h3>13. General Provisions</h3>
    ${renderFieldDisplay('Health & Safety Plan Required', 'health_safety_plan_required')}
    ${renderFieldDisplay('Quality Assurance Required', 'quality_assurance_required')}
    ${renderFieldDisplay('Assignment of Subcontract Allowed', 'assignment_allowed')}
    ${renderFieldDisplay('Governing Law', 'governing_law')}
    ` : ''}

    ${hasFieldValue('drawings_list') || hasFieldValue('specifications_list') || hasFieldValue('other_documents') ? `
    <h3>14. Contract Documents</h3>
    <div class="clause">
      <span class="clause-number">14.1</span>
      <span class="clause-text">
        The following documents form part of this Agreement and shall be read together:
      </span>
    </div>
    ${renderFieldDisplay('Drawings List', 'drawings_list')}
    ${renderFieldDisplay('Specifications List', 'specifications_list')}
    ${renderFieldDisplay('Other Contract Documents', 'other_documents')}
    ` : ''}

    ${hasFieldValue('special_conditions_text') ? `
    <h3>15. Special Conditions</h3>
    <div class="field-display">
      <div class="field-value">${getFieldValue('special_conditions_text')}</div>
    </div>` : ''}

    <!-- GENERAL CONDITIONS -->
    <h1 style="text-align: center; margin: 30px 0 20px 0;">GENERAL CONDITIONS</h1>

    <h2>1. INTERPRETATION AND DEFINITIONS</h2>

    <div class="clause">
      <span class="clause-number">1.1</span>
      <span class="clause-text">
        In this Agreement, unless the context otherwise requires:
      </span>
    </div>

    <div style="margin-left: 30px; margin-top: 15px;">
      <p style="margin-bottom: 10px;"><strong>"Agreement"</strong> means this Subcontract Agreement including all schedules, appendices and documents incorporated by reference.</p>
      <p style="margin-bottom: 10px;"><strong>"Construction Contracts Act"</strong> means the Construction Contracts Act 2002 and any amendments or regulations made thereunder.</p>
      <p style="margin-bottom: 10px;"><strong>"Contract Price"</strong> means the price stated in this Agreement for the execution and completion of the Subcontract Works.</p>
      <p style="margin-bottom: 10px;"><strong>"Defects Liability Period"</strong> means the period specified in this Agreement during which the Subcontractor is liable to make good defects.</p>
      <p style="margin-bottom: 10px;"><strong>"Head Contract"</strong> means the contract between the Head Contractor and the Principal for the execution of works of which the Subcontract Works form part.</p>
      <p style="margin-bottom: 10px;"><strong>"Head Contractor"</strong> means the party named as the Head Contractor in this Agreement and includes its successors and permitted assigns.</p>
      <p style="margin-bottom: 10px;"><strong>"Practical Completion"</strong> means when the Subcontract Works have been completed except for minor defects and omissions that do not prevent the works from being used for their intended purpose.</p>
      <p style="margin-bottom: 10px;"><strong>"Subcontract Works"</strong> means the works described in this Agreement and all work necessary for the proper execution and completion thereof.</p>
      <p style="margin-bottom: 10px;"><strong>"Subcontractor"</strong> means the party named as the Subcontractor in this Agreement and includes its successors and permitted assigns.</p>
      <p style="margin-bottom: 10px;"><strong>"Variation"</strong> means any change, addition, omission or substitution to the Subcontract Works ordered by the Head Contractor.</p>
    </div>

    <div class="clause">
      <span class="clause-number">1.2</span>
      <span class="clause-text">
        Words importing the singular include the plural and vice versa. Headings are for convenience only and do not affect interpretation.
      </span>
    </div>

    <div class="page-break"></div>

    <h2>2. THE CONTRACTS</h2>

    <div class="clause">
      <span class="clause-number">2.1</span>
      <span class="clause-text">
        The Subcontractor acknowledges that the Subcontract Works form part of works to be executed under the Head Contract.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">2.2</span>
      <span class="clause-text">
        The Subcontractor shall be deemed to have full knowledge of all the provisions of the Head Contract insofar as they relate to the Subcontract Works and shall observe and comply with such provisions.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">2.3</span>
      <span class="clause-text">
        Where provisions of the Head Contract are incorporated into this Agreement by reference, such provisions shall be read as if "Head Contractor" were substituted for "Principal" or "Employer", and "Subcontractor" were substituted for "Contractor".
      </span>
    </div>

    <h2>3. SUBCONTRACTOR'S BONDS AND GUARANTEES</h2>

    <div class="clause">
      <span class="clause-number">3.1</span>
      <span class="clause-text">
        If specified in this Agreement, the Subcontractor shall provide a performance bond from an approved surety for the percentage of the Contract Price stated, in the form required by the Head Contractor.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">3.2</span>
      <span class="clause-text">
        The performance bond shall remain in force until the expiry of the Defects Liability Period and the rectification of all defects, or until such earlier time as the Head Contractor may agree in writing.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">3.3</span>
      <span class="clause-text">
        If specified in this Agreement, the Subcontractor shall provide a parent company guarantee or other security in the form and amount required by the Head Contractor.
      </span>
    </div>

    <h2>4. SUB-LETTING OR ASSIGNING</h2>

    <div class="clause">
      <span class="clause-number">4.1</span>
      <span class="clause-text">
        The Subcontractor shall not assign, novate or transfer this Agreement or any rights or obligations under it without the prior written consent of the Head Contractor.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">4.2</span>
      <span class="clause-text">
        The Subcontractor shall not sub-let any portion of the Subcontract Works without the prior written consent of the Head Contractor, which consent shall not be unreasonably withheld.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">4.3</span>
      <span class="clause-text">
        Any consent to sub-letting shall not relieve the Subcontractor from any liability or obligation under this Agreement, and the Subcontractor shall be responsible for the acts and omissions of all sub-contractors as if they were the acts and omissions of the Subcontractor.
      </span>
    </div>

    <div class="page-break"></div>

    <h2>5. GENERAL OBLIGATIONS</h2>

    <h3 style="font-size: 11pt; margin-top: 20px;">5.1 Care of Works</h3>

    <div class="clause">
      <span class="clause-number">5.1.1</span>
      <span class="clause-text">
        The Subcontractor shall take full responsibility for the care of the Subcontract Works from commencement until Practical Completion.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.1.2</span>
      <span class="clause-text">
        The Subcontractor shall protect the Subcontract Works and all materials, goods, and equipment intended for incorporation into the works from loss or damage from any cause.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.1.3</span>
      <span class="clause-text">
        If any loss or damage occurs to the Subcontract Works, the Subcontractor shall notify the Head Contractor immediately and shall make good such loss or damage at its own cost, unless caused by the Head Contractor's negligence.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.1.4</span>
      <span class="clause-text">
        The Subcontractor shall protect and preserve any existing work, finishes, fixtures, and fittings that may be affected by the Subcontract Works.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.1.5</span>
      <span class="clause-text">
        The Subcontractor shall be liable for any damage caused to the Head Contract Works or to property of the Principal, the Head Contractor, or others arising from the execution of the Subcontract Works.
      </span>
    </div>

    <h3 style="font-size: 11pt; margin-top: 20px;">5.2 Compliance with Legislation</h3>

    <div class="clause">
      <span class="clause-number">5.2.1</span>
      <span class="clause-text">
        The Subcontractor shall comply with all statutes, regulations, bylaws, and requirements of any statutory authority applicable to the Subcontract Works.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.2.2</span>
      <span class="clause-text">
        The Subcontractor shall obtain and pay for all permits, licenses, and consents required for the execution of the Subcontract Works, unless otherwise stated in this Agreement.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.2.3</span>
      <span class="clause-text">
        The Subcontractor shall comply with all applicable health and safety legislation, including the Health and Safety at Work Act 2015, and shall maintain all required documentation.
      </span>
    </div>

    <h3 style="font-size: 11pt; margin-top: 20px;">5.3 Site Conditions and Inspection of Surfaces</h3>

    <div class="clause">
      <span class="clause-number">5.3.1</span>
      <span class="clause-text">
        The Subcontractor shall be deemed to have inspected and examined the site and its surroundings and to have satisfied itself as to the nature of the ground and subsoil, the form and nature of the site, the extent and nature of work and materials necessary for completion of the Subcontract Works, and the means of access to the site.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.3.2</span>
      <span class="clause-text">
        The Subcontractor shall inspect all surfaces to which work is to be applied and shall report any defects or unsuitable conditions to the Head Contractor before commencing work on such surfaces.
      </span>
    </div>

    <h3 style="font-size: 11pt; margin-top: 20px;">5.4 Services</h3>

    <div class="clause">
      <span class="clause-number">5.4.1</span>
      <span class="clause-text">
        The Head Contractor shall provide access to water and electricity for the execution of the Subcontract Works. The Subcontractor shall pay for all water and electricity consumed unless otherwise agreed.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.4.2</span>
      <span class="clause-text">
        The Subcontractor shall provide all other services, facilities, and equipment necessary for the execution of the Subcontract Works.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.4.3</span>
      <span class="clause-text">
        The Subcontractor shall locate and protect all existing services on or adjacent to the site and shall immediately report any damage to such services to the Head Contractor.
      </span>
    </div>

    <h3 style="font-size: 11pt; margin-top: 20px;">5.5 Scaffolding</h3>

    <div class="clause">
      <span class="clause-number">5.5.1</span>
      <span class="clause-text">
        Unless otherwise stated, the Subcontractor shall provide all scaffolding, hoarding, and safety equipment necessary for the execution of the Subcontract Works.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.5.2</span>
      <span class="clause-text">
        All scaffolding shall comply with applicable regulations and shall be erected and maintained by competent persons.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.5.3</span>
      <span class="clause-text">
        The Subcontractor shall provide safe access and working platforms for all persons who may need to inspect the Subcontract Works.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.5.4</span>
      <span class="clause-text">
        Where scaffolding is provided by the Head Contractor, the Subcontractor shall be responsible for any modifications or additions required for the Subcontract Works.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.5.5</span>
      <span class="clause-text">
        The Subcontractor shall remove all scaffolding upon completion of the Subcontract Works or when no longer required.
      </span>
    </div>

    <h3 style="font-size: 11pt; margin-top: 20px;">5.6 Hoisting</h3>

    <div class="clause">
      <span class="clause-number">5.6.1</span>
      <span class="clause-text">
        Unless otherwise stated, the Subcontractor shall provide all plant and equipment necessary for hoisting and transporting materials, including cranes, hoists, and lifting equipment. Where hoisting facilities are provided by the Head Contractor, the Subcontractor shall coordinate use of such facilities.
      </span>
    </div>

    <h3 style="font-size: 11pt; margin-top: 20px;">5.7 Use of Work or Facilities Provided by Others</h3>

    <div class="clause">
      <span class="clause-number">5.7.1</span>
      <span class="clause-text">
        The Subcontractor shall coordinate its work with other contractors and shall not interfere with or damage work executed by others. The Subcontractor shall be liable for any damage caused to work of others by the Subcontractor's operations.
      </span>
    </div>

    <h3 style="font-size: 11pt; margin-top: 20px;">5.8 Cleaning</h3>

    <div class="clause">
      <span class="clause-number">5.8.1</span>
      <span class="clause-text">
        The Subcontractor shall keep the site clean and tidy and shall remove all rubbish, debris, and surplus materials resulting from the Subcontract Works on a regular basis.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.8.2</span>
      <span class="clause-text">
        The Subcontractor shall clean all work surfaces and shall protect finished work from damage or deterioration.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.8.3</span>
      <span class="clause-text">
        On completion of the Subcontract Works, the Subcontractor shall clean all areas affected by the works and shall remove all equipment, materials, and rubbish from the site.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.8.4</span>
      <span class="clause-text">
        If the Subcontractor fails to clean as required, the Head Contractor may carry out such cleaning and deduct the cost from monies due to the Subcontractor.
      </span>
    </div>

    <h3 style="font-size: 11pt; margin-top: 20px;">5.9 Health and Safety</h3>

    <div class="clause">
      <span class="clause-number">5.9.1</span>
      <span class="clause-text">
        The Subcontractor acknowledges that it is a Person Conducting a Business or Undertaking (PCBU) under the Health and Safety at Work Act 2015 and shall comply with all duties and obligations under that Act.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.9.2</span>
      <span class="clause-text">
        The Subcontractor shall prepare and implement a health and safety plan for the Subcontract Works and shall provide a copy to the Head Contractor prior to commencing work.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.9.3</span>
      <span class="clause-text">
        The Subcontractor shall ensure that all workers are competent, properly trained, and provided with appropriate personal protective equipment.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.9.4</span>
      <span class="clause-text">
        The Subcontractor shall immediately report all accidents, incidents, and near misses to the Head Contractor and shall maintain all required health and safety records.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.9.5</span>
      <span class="clause-text">
        The Subcontractor shall comply with any site-specific health and safety requirements notified by the Head Contractor and shall attend all required health and safety meetings.
      </span>
    </div>

    <h3 style="font-size: 11pt; margin-top: 20px;">5.10 Hours of Work</h3>

    <div class="clause">
      <span class="clause-number">5.10.1</span>
      <span class="clause-text">
        The Subcontractor shall execute the Subcontract Works during normal working hours unless otherwise agreed with the Head Contractor. Work outside normal hours or on weekends and public holidays shall require the Head Contractor's prior written consent.
      </span>
    </div>

    <h3 style="font-size: 11pt; margin-top: 20px;">5.11 Quality Assurance</h3>

    <div class="clause">
      <span class="clause-number">5.11.1</span>
      <span class="clause-text">
        If specified in this Agreement, the Subcontractor shall implement and maintain a quality assurance system for the Subcontract Works and shall provide evidence of compliance when requested by the Head Contractor.
      </span>
    </div>

    <h3 style="font-size: 11pt; margin-top: 20px;">5.12 Use of Alternative Materials or Products</h3>

    <div class="clause">
      <span class="clause-number">5.12.1</span>
      <span class="clause-text">
        The Subcontractor shall not substitute any materials or products specified in the contract documents without the prior written approval of the Head Contractor.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.12.2</span>
      <span class="clause-text">
        Any request for substitution shall be accompanied by full technical data demonstrating that the proposed substitute is equal to or better than the specified product.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.12.3</span>
      <span class="clause-text">
        The Head Contractor's approval of any substitution shall not relieve the Subcontractor from any obligations under this Agreement.
      </span>
    </div>

    <h3 style="font-size: 11pt; margin-top: 20px;">5.13 Shop Drawings, As-Built Drawings, Operating Manuals</h3>

    <div class="clause">
      <span class="clause-number">5.13.1</span>
      <span class="clause-text">
        The Subcontractor shall prepare and submit shop drawings, fabrication drawings, samples, and other information as required for approval by the Head Contractor prior to fabrication or installation.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.13.2</span>
      <span class="clause-text">
        On completion, the Subcontractor shall provide as-built drawings, operation and maintenance manuals, warranties, and all other documentation required by the contract documents or reasonably requested by the Head Contractor.
      </span>
    </div>

    <h3 style="font-size: 11pt; margin-top: 20px;">5.14 Communication Requirements</h3>

    <div class="clause">
      <span class="clause-number">5.14.1</span>
      <span class="clause-text">
        The Subcontractor shall provide a competent supervisor or foreman on site at all times when work is being executed.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.14.2</span>
      <span class="clause-text">
        The Subcontractor shall provide contact details for its nominated representative and shall ensure that this person is available to respond to communications from the Head Contractor.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.14.3</span>
      <span class="clause-text">
        All formal communications, instructions, and notices shall be in writing and delivered in accordance with the notice provisions of this Agreement.
      </span>
    </div>

    <h3 style="font-size: 11pt; margin-top: 20px;">5.15 Attendance at Meetings</h3>

    <div class="clause">
      <span class="clause-number">5.15.1</span>
      <span class="clause-text">
        The Subcontractor shall attend all site meetings, coordination meetings, and other meetings as required by the Head Contractor. The Subcontractor's representative shall have authority to make decisions and commitments on behalf of the Subcontractor.
      </span>
    </div>

    <h3 style="font-size: 11pt; margin-top: 20px;">5.16 Programme Requirements</h3>

    <div class="clause">
      <span class="clause-number">5.16.1</span>
      <span class="clause-text">
        If required by this Agreement, the Subcontractor shall prepare and submit a detailed programme showing the timing and sequence of the Subcontract Works. The Subcontractor shall update the programme as required and shall comply with any master programme issued by the Head Contractor.
      </span>
    </div>

    <h3 style="font-size: 11pt; margin-top: 20px;">5.17 Quality Plan Requirements</h3>

    <div class="clause">
      <span class="clause-number">5.17.1</span>
      <span class="clause-text">
        If specified in this Agreement, the Subcontractor shall prepare and submit a quality plan detailing inspection and testing procedures, hold points, and quality control measures to be implemented for the Subcontract Works.
      </span>
    </div>

    <h3 style="font-size: 11pt; margin-top: 20px;">5.18 Advance Notification</h3>

    <div class="clause">
      <span class="clause-number">5.18.1</span>
      <span class="clause-text">
        The Subcontractor shall give the Head Contractor reasonable advance notice of any work that is to be inspected or tested before being covered up or made inaccessible.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">5.18.2</span>
      <span class="clause-text">
        If the Subcontractor fails to give proper notice and covers up work before inspection, the Subcontractor shall uncover such work for inspection at its own cost and shall reinstate it to the Head Contractor's satisfaction.
      </span>
    </div>

    <h2>6. DESIGN AND PRODUCER STATEMENTS</h2>

    <div class="clause">
      <span class="clause-number">6.1</span>
      <span class="clause-text">
        Where the Subcontract Works include design work, the Subcontractor shall exercise all reasonable skill, care, and diligence in the preparation of such design work.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">6.2</span>
      <span class="clause-text">
        The Subcontractor shall provide all producer statements, design certificates, and other documentation required by the Building Act 2004 or other applicable legislation.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">6.3</span>
      <span class="clause-text">
        Where professional indemnity insurance is required, the Subcontractor shall maintain such insurance for the period specified and shall provide evidence of insurance to the Head Contractor.
      </span>
    </div>

    <h2>7. INDEMNITY</h2>

    <div class="clause">
      <span class="clause-number">7.1</span>
      <span class="clause-text">
        The Subcontractor shall indemnify and keep indemnified the Head Contractor from and against all actions, suits, claims, demands, losses, charges, costs, and expenses which the Head Contractor may suffer or incur arising from:
      </span>
    </div>

    <div style="margin-left: 30px; margin-top: 10px;">
      <p style="margin-bottom: 8px;">(a) Any breach of this Agreement by the Subcontractor;</p>
      <p style="margin-bottom: 8px;">(b) Any negligent act or omission of the Subcontractor or its employees, agents, or sub-contractors;</p>
      <p style="margin-bottom: 8px;">(c) Death or injury to any person or loss of or damage to any property caused by the Subcontractor;</p>
      <p style="margin-bottom: 8px;">(d) Any infringement of intellectual property rights in the execution of the Subcontract Works.</p>
    </div>

    <div class="clause">
      <span class="clause-number">7.2</span>
      <span class="clause-text">
        This indemnity shall survive termination or completion of this Agreement.
      </span>
    </div>

    <h2>8. INSURANCE</h2>

    <div class="clause">
      <span class="clause-number">8.1</span>
      <span class="clause-text">
        The Subcontractor shall effect and maintain the following insurances:
      </span>
    </div>

    <div style="margin-left: 30px; margin-top: 10px;">
      <p style="margin-bottom: 8px;">(a) Public liability insurance for the amount specified in this Agreement;</p>
      <p style="margin-bottom: 8px;">(b) Employer's liability insurance as required by the Accident Compensation Act 2001;</p>
      <p style="margin-bottom: 8px;">(c) Professional indemnity insurance (if design services are included) for the amount and period specified;</p>
      <p style="margin-bottom: 8px;">(d) Such other insurances as may be specified in this Agreement.</p>
    </div>

    <div class="clause">
      <span class="clause-number">8.2</span>
      <span class="clause-text">
        All insurance policies shall be effected with insurers approved by the Head Contractor and shall note the Head Contractor's interest.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">8.3</span>
      <span class="clause-text">
        The Subcontractor shall provide certificates of currency for all required insurances prior to commencing work and shall provide renewal certificates when policies are renewed.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">8.4</span>
      <span class="clause-text">
        The Subcontractor shall not cancel or reduce any insurance required by this Agreement without the Head Contractor's prior written consent.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">8.5</span>
      <span class="clause-text">
        Contract works insurance shall be arranged by the Head Contractor unless otherwise specified in this Agreement. Where the Subcontractor is required to effect contract works insurance, it shall do so for the full replacement value of the Subcontract Works.
      </span>
    </div>

    <h2>9. VARIATIONS</h2>

    <div class="clause">
      <span class="clause-number">9.1</span>
      <span class="clause-text">
        The Head Contractor may by written instruction direct the Subcontractor to execute variations to the Subcontract Works, including additions, omissions, substitutions, or changes to the sequence or timing of work.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">9.2</span>
      <span class="clause-text">
        The Subcontractor shall not execute any varied work without a written instruction from the Head Contractor.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">9.3</span>
      <span class="clause-text">
        Where a variation is instructed, the Subcontractor shall provide a quotation for the variation within the timeframe specified by the Head Contractor, showing the proposed adjustment to the Contract Price and any effect on the programme.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">9.4</span>
      <span class="clause-text">
        If agreement cannot be reached on the value of a variation, the variation shall be valued as follows:
      </span>
    </div>

    <div style="margin-left: 30px; margin-top: 10px;">
      <p style="margin-bottom: 8px;">(a) Where applicable, using rates and prices in this Agreement;</p>
      <p style="margin-bottom: 8px;">(b) Where no applicable rates exist, using fair and reasonable rates based on the actual cost of labour, materials, and plant plus the percentage for overheads and profit stated in this Agreement;</p>
      <p style="margin-bottom: 8px;">(c) Where agreed, on a daywork basis using the rates specified in this Agreement.</p>
    </div>

    <div class="clause">
      <span class="clause-number">9.5</span>
      <span class="clause-text">
        Omissions from the Subcontract Works shall be valued using the rates and prices in this Agreement, reduced by any savings in overheads and profit that the Subcontractor has made as a result of the omission.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">9.6</span>
      <span class="clause-text">
        The Subcontractor shall keep accurate records of all daywork and shall submit daywork sheets for approval by the Head Contractor on a daily basis.
      </span>
    </div>

    <h2>10. TIME</h2>

    <div class="clause">
      <span class="clause-number">10.1</span>
      <span class="clause-text">
        The Subcontractor shall commence the Subcontract Works on the date specified in this Agreement and shall proceed with due diligence and expedition to complete the works by the Completion Date.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">10.2</span>
      <span class="clause-text">
        Time shall be of the essence in this Agreement. If the Subcontractor fails to complete by the Completion Date, the Head Contractor may impose liquidated damages at the rate specified in this Agreement.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">10.3</span>
      <span class="clause-text">
        The Subcontractor shall be entitled to an extension of time if completion is delayed by:
      </span>
    </div>

    <div style="margin-left: 30px; margin-top: 10px;">
      <p style="margin-bottom: 8px;">(a) Variations instructed by the Head Contractor;</p>
      <p style="margin-bottom: 8px;">(b) Delays caused by the Head Contractor;</p>
      <p style="margin-bottom: 8px;">(c) Exceptionally adverse weather;</p>
      <p style="margin-bottom: 8px;">(d) Force majeure events;</p>
      <p style="margin-bottom: 8px;">(e) Any other cause beyond the Subcontractor's reasonable control.</p>
    </div>

    <div class="clause">
      <span class="clause-number">10.4</span>
      <span class="clause-text">
        The Subcontractor shall give written notice of any delay or potential delay within 5 working days of becoming aware of the delay, stating the cause and expected duration.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">10.5</span>
      <span class="clause-text">
        The Head Contractor shall assess any claim for extension of time and shall notify the Subcontractor of the decision in writing. Extensions of time shall be granted fairly and reasonably having regard to all relevant circumstances.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">10.6</span>
      <span class="clause-text">
        If the Head Contractor requires early completion or acceleration of the Subcontract Works, this shall be treated as a variation and the Subcontractor shall be entitled to additional payment for any acceleration costs.
      </span>
    </div>

    <h2>11. DEFECTS</h2>

    <div class="clause">
      <span class="clause-number">11.1</span>
      <span class="clause-text">
        The Subcontractor warrants that all work will be executed in a proper and workmanlike manner using materials and workmanship of the quality specified in the contract documents.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">11.2</span>
      <span class="clause-text">
        The Defects Liability Period shall commence on the date of Practical Completion and shall continue for the period specified in this Agreement.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">11.3</span>
      <span class="clause-text">
        If any defects appear during the Defects Liability Period, the Head Contractor shall notify the Subcontractor in writing and the Subcontractor shall rectify such defects within a reasonable time at its own cost.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">11.4</span>
      <span class="clause-text">
        If the Subcontractor fails to rectify defects within a reasonable time, the Head Contractor may carry out the necessary work and recover the cost from the Subcontractor.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">11.5</span>
      <span class="clause-text">
        The Subcontractor's liability for defects shall not be limited to the Defects Liability Period if the defect arises from breach of statutory duty or negligence.
      </span>
    </div>

    <h2>12. PAYMENTS</h2>

    <h3 style="font-size: 11pt; margin-top: 20px;">12.1 Payment Claims</h3>

    <div class="clause">
      <span class="clause-number">12.1.1</span>
      <span class="clause-text">
        The Subcontractor shall submit payment claims in accordance with the Construction Contracts Act 2002 at the intervals specified in this Agreement.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">12.1.2</span>
      <span class="clause-text">
        Each payment claim shall include:
      </span>
    </div>

    <div style="margin-left: 30px; margin-top: 10px;">
      <p style="margin-bottom: 8px;">(a) A detailed breakdown of work completed;</p>
      <p style="margin-bottom: 8px;">(b) A schedule of any variations;</p>
      <p style="margin-bottom: 8px;">(c) Supporting documentation as required;</p>
      <p style="margin-bottom: 8px;">(d) A statement that it is made under the Construction Contracts Act 2002.</p>
    </div>

    <h3 style="font-size: 11pt; margin-top: 20px;">12.2 Payment Schedule</h3>

    <div class="clause">
      <span class="clause-number">12.2.1</span>
      <span class="clause-text">
        The Head Contractor shall respond to each payment claim by providing a payment schedule within the timeframe specified in the Construction Contracts Act 2002.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">12.2.2</span>
      <span class="clause-text">
        If the Head Contractor proposes to pay less than the claimed amount, the payment schedule shall set out the reasons for the difference and the basis of calculation.
      </span>
    </div>

    <h3 style="font-size: 11pt; margin-top: 20px;">12.3 Retention Money</h3>

    <div class="clause">
      <span class="clause-number">12.3.1</span>
      <span class="clause-text">
        If specified in this Agreement, the Head Contractor may withhold retention money in accordance with the Construction Contracts Act 2002.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">12.3.2</span>
      <span class="clause-text">
        Retention money shall be held on trust by the Head Contractor in accordance with the Act. If the amount held exceeds $100,000, it shall be deposited in a separate trust account.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">12.3.3</span>
      <span class="clause-text">
        Half of the retention shall be released upon Practical Completion, and the balance upon expiry of the Defects Liability Period, subject to rectification of all defects.
      </span>
    </div>

    <h3 style="font-size: 11pt; margin-top: 20px;">12.4 Final Account</h3>

    <div class="clause">
      <span class="clause-number">12.4.1</span>
      <span class="clause-text">
        Within 20 working days of completion of the Defects Liability Period, the Subcontractor shall submit a final account showing the total amount claimed under this Agreement.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">12.4.2</span>
      <span class="clause-text">
        The Head Contractor shall assess the final account and shall issue a final payment schedule within 20 working days of receipt.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">12.4.3</span>
      <span class="clause-text">
        Payment of the final account (less any retention or amounts properly deducted) shall constitute full and final settlement of all amounts due under this Agreement.
      </span>
    </div>

    <h3 style="font-size: 11pt; margin-top: 20px;">12.5 GST</h3>

    <div class="clause">
      <span class="clause-number">12.5.1</span>
      <span class="clause-text">
        All amounts stated in this Agreement are exclusive of GST unless otherwise specified. GST shall be added to all amounts payable.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">12.5.2</span>
      <span class="clause-text">
        If the parties have agreed that the Head Contractor may issue buyer-created tax invoices, the Head Contractor shall issue such invoices in accordance with the GST Act.
      </span>
    </div>

    <h2>13. DISPUTES AND REMEDIES</h2>

    <div class="clause">
      <span class="clause-number">13.1</span>
      <span class="clause-text">
        This Agreement is subject to the Construction Contracts Act 2002. Any party may refer a dispute arising under or in connection with this Agreement to adjudication in accordance with that Act.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">13.2</span>
      <span class="clause-text">
        Before referring a dispute to adjudication, the parties shall first attempt to resolve the dispute by negotiation.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">13.3</span>
      <span class="clause-text">
        If a dispute cannot be resolved by negotiation within 10 working days, either party may refer the dispute to adjudication by serving notice on the other party.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">13.4</span>
      <span class="clause-text">
        The parties shall comply with any adjudicator's determination unless and until the determination is overturned by subsequent arbitration or court proceedings.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">13.5</span>
      <span class="clause-text">
        Nothing in this clause shall prevent either party from seeking urgent interlocutory relief from a court.
      </span>
    </div>

    <h2>14. DEFAULT</h2>

    <div class="clause">
      <span class="clause-number">14.1</span>
      <span class="clause-text">
        The Subcontractor shall be in default if:
      </span>
    </div>

    <div style="margin-left: 30px; margin-top: 10px;">
      <p style="margin-bottom: 8px;">(a) The Subcontractor fails to proceed with due diligence and expedition;</p>
      <p style="margin-bottom: 8px;">(b) The Subcontractor fails to comply with any lawful instruction of the Head Contractor;</p>
      <p style="margin-bottom: 8px;">(c) The Subcontractor abandons the Subcontract Works;</p>
      <p style="margin-bottom: 8px;">(d) The Subcontractor becomes insolvent or bankrupt;</p>
      <p style="margin-bottom: 8px;">(e) The Subcontractor commits any other substantial breach of this Agreement.</p>
    </div>

    <div class="clause">
      <span class="clause-number">14.2</span>
      <span class="clause-text">
        If the Subcontractor is in default, the Head Contractor may give written notice requiring the default to be remedied within 5 working days.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">14.3</span>
      <span class="clause-text">
        If the Subcontractor fails to remedy the default within the specified time, the Head Contractor may:
      </span>
    </div>

    <div style="margin-left: 30px; margin-top: 10px;">
      <p style="margin-bottom: 8px;">(a) Suspend payment to the Subcontractor;</p>
      <p style="margin-bottom: 8px;">(b) Engage others to complete the Subcontract Works and recover the additional costs from the Subcontractor;</p>
      <p style="margin-bottom: 8px;">(c) Terminate this Agreement;</p>
      <p style="margin-bottom: 8px;">(d) Exercise any other rights available at law or under this Agreement.</p>
    </div>

    <div class="clause">
      <span class="clause-number">14.4</span>
      <span class="clause-text">
        If this Agreement is terminated for default, the Head Contractor shall not be liable to pay any further amounts to the Subcontractor until the Subcontract Works have been completed and the final cost ascertained. The Subcontractor shall be liable for any additional costs incurred by the Head Contractor.
      </span>
    </div>

    <h2>15. URGENT WORK</h2>

    <div class="clause">
      <span class="clause-number">15.1</span>
      <span class="clause-text">
        If urgent work is required to prevent loss or damage or to comply with health and safety requirements, and the Head Contractor cannot contact the Subcontractor, the Head Contractor may carry out such urgent work and recover the cost from the Subcontractor.
      </span>
    </div>

    <div class="clause">
      <span class="clause-number">15.2</span>
      <span class="clause-text">
        The Head Contractor shall notify the Subcontractor of any urgent work carried out as soon as reasonably practicable.
      </span>
    </div>

    <h2>16. SERVICE OF NOTICES</h2>

    <div class="clause">
      <span class="clause-number">16.1</span>
      <span class="clause-text">
        Any notice required to be given under this Agreement shall be in writing and may be delivered:
      </span>
    </div>

    <div style="margin-left: 30px; margin-top: 10px;">
      <p style="margin-bottom: 8px;">(a) By hand to the party's address stated in this Agreement;</p>
      <p style="margin-bottom: 8px;">(b) By pre-paid post to that address;</p>
      <p style="margin-bottom: 8px;">(c) By email to the email address stated in this Agreement.</p>
    </div>

    <div class="clause">
      <span class="clause-number">16.2</span>
      <span class="clause-text">
        A notice shall be deemed to have been received:
      </span>
    </div>

    <div style="margin-left: 30px; margin-top: 10px;">
      <p style="margin-bottom: 8px;">(a) If delivered by hand, on the date of delivery;</p>
      <p style="margin-bottom: 8px;">(b) If posted, on the third working day after posting;</p>
      <p style="margin-bottom: 8px;">(c) If sent by email, on the date sent (unless sent after 5pm or on a non-working day, in which case on the next working day).</p>
    </div>

    <div class="clause">
      <span class="clause-number">16.3</span>
      <span class="clause-text">
        Either party may change its address for service by giving written notice to the other party.
      </span>
    </div>

    <!-- EXECUTION -->
    <h1>Execution</h1>

    <div class="clause" style="margin-bottom: 40px;">
      <p>The parties have executed this Agreement as a deed on the date stated at the beginning of this Agreement.</p>
    </div>

    <div class="signature-section">
      <h3>Head Contractor</h3>
      <div class="signature-block">
        ${hasFieldValue('head_contractor_signatory_name') ? `
        <div style="margin-bottom: 20px;">
          <strong>Name of Signatory:</strong> ${getFieldValue('head_contractor_signatory_name')}
        </div>` : ''}
        ${hasFieldValue('head_contractor_signatory_title') ? `
        <div style="margin-bottom: 20px;">
          <strong>Title/Position:</strong> ${getFieldValue('head_contractor_signatory_title')}
        </div>` : ''}
        <div class="signature-line">
          Signature
        </div>
        ${hasFieldValue('head_contractor_signature_date') ? `
        <div class="signature-details">
          <div>Date: ${getFieldValue('head_contractor_signature_date')}</div>
        </div>` : ''}
      </div>
    </div>

    <div class="signature-section">
      <h3>Subcontractor</h3>
      <div class="signature-block">
        ${hasFieldValue('subcontractor_signatory_name') ? `
        <div style="margin-bottom: 20px;">
          <strong>Name of Signatory:</strong> ${getFieldValue('subcontractor_signatory_name')}
        </div>` : ''}
        ${hasFieldValue('subcontractor_signatory_title') ? `
        <div style="margin-bottom: 20px;">
          <strong>Title/Position:</strong> ${getFieldValue('subcontractor_signatory_title')}
        </div>` : ''}
        <div class="signature-line">
          Signature
        </div>
        ${hasFieldValue('subcontractor_signature_date') ? `
        <div class="signature-details">
          <div>Date: ${getFieldValue('subcontractor_signature_date')}</div>
        </div>` : ''}
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