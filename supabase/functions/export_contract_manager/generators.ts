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
  console.log('[SA-2017] Generating agreement PDF');

  const sectionOrder = [
    'Contract Identity',
    'Parties',
    'Subcontract Works',
    'Contract Sum',
    'Time for Completion',
    'Payment Terms',
    'Retention',
    'Insurance Requirements',
    'Variations',
    'Dispute Resolution',
    'General Conditions'
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

  const formatFieldValue = (field: any, value: any): string => {
    if (!value || !value.field_value) return '<span class="text-slate-400">Not specified</span>';

    const val = value.field_value;

    if (field.field_type === 'textarea') {
      return val.split('\n').map((line: string) => `<p class="mb-2">${escapeHtml(line)}</p>`).join('');
    }

    if (field.field_type === 'currency') {
      return `$${parseFloat(val).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    if (field.field_type === 'percentage') {
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

  const escapeHtml = (text: string): string => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  };

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${template.template_name} - ${agreement.agreement_number}</title>
  <style>
    @page {
      size: A4;
      margin: 20mm;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 10pt;
      line-height: 1.6;
      color: #1e293b;
      background: white;
    }

    .container {
      max-width: 210mm;
      margin: 0 auto;
      padding: 20px;
    }

    .header {
      border-bottom: 3px solid #0284c7;
      padding-bottom: 20px;
      margin-bottom: 30px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .header-left {
      flex: 1;
    }

    .logo {
      max-height: 60px;
      max-width: 180px;
      object-fit: contain;
    }

    .title {
      font-size: 24pt;
      font-weight: bold;
      color: #0f172a;
      margin-bottom: 8px;
    }

    .subtitle {
      font-size: 11pt;
      color: #64748b;
      font-weight: 500;
    }

    .meta-info {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 30px;
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 15px;
    }

    .meta-item {
      display: flex;
      flex-direction: column;
    }

    .meta-label {
      font-size: 9pt;
      color: #64748b;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }

    .meta-value {
      font-size: 11pt;
      color: #0f172a;
      font-weight: 600;
    }

    .section {
      margin-bottom: 35px;
      page-break-inside: avoid;
    }

    .section-header {
      background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
      color: white;
      padding: 12px 20px;
      border-radius: 6px;
      margin-bottom: 20px;
      font-size: 13pt;
      font-weight: 700;
      letter-spacing: 0.3px;
    }

    .field-group {
      margin-bottom: 20px;
      page-break-inside: avoid;
    }

    .field-label {
      font-size: 10pt;
      font-weight: 700;
      color: #334155;
      margin-bottom: 6px;
      display: block;
    }

    .field-value {
      font-size: 10pt;
      color: #1e293b;
      line-height: 1.7;
      padding: 10px 15px;
      background: #f8fafc;
      border-left: 3px solid #0284c7;
      border-radius: 4px;
    }

    .field-description {
      font-size: 9pt;
      color: #64748b;
      font-style: italic;
      margin-top: 4px;
    }

    .field-comment {
      font-size: 9pt;
      color: #f59e0b;
      margin-top: 6px;
      padding: 8px 12px;
      background: #fffbeb;
      border-left: 3px solid #f59e0b;
      border-radius: 4px;
    }

    .footer {
      margin-top: 50px;
      padding-top: 20px;
      border-top: 2px solid #e2e8f0;
      font-size: 9pt;
      color: #64748b;
      text-align: center;
    }

    .signature-section {
      margin-top: 40px;
      page-break-inside: avoid;
    }

    .signature-block {
      margin-top: 30px;
      padding: 20px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
    }

    .signature-line {
      margin-top: 40px;
      padding-top: 2px;
      border-top: 2px solid #0f172a;
      font-weight: 600;
    }

    .signature-details {
      margin-top: 10px;
      font-size: 9pt;
      color: #64748b;
    }

    @media print {
      body {
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }

      .section {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-left">
        <div class="title">${template.template_name}</div>
        <div class="subtitle">${template.template_description || 'Standard Form of Agreement for use with AS 2124-1992 or AS 4000-1997'}</div>
      </div>
      ${organisationLogoUrl ? `<img src="${organisationLogoUrl}" alt="Organisation Logo" class="logo">` : ''}
    </div>

    <div class="meta-info">
      <div class="meta-item">
        <div class="meta-label">Agreement Number</div>
        <div class="meta-value">${agreement.agreement_number}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Subcontractor</div>
        <div class="meta-value">${agreement.subcontractor_name}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Project</div>
        <div class="meta-value">${project?.name || 'N/A'}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Status</div>
        <div class="meta-value" style="color: #10b981;">${agreement.status === 'completed' ? 'Completed' : agreement.status}</div>
      </div>
    </div>

    ${sections.map(sectionName => {
      const sectionFields = fieldsBySection[sectionName];
      return `
        <div class="section">
          <div class="section-header">${sectionName}</div>
          ${sectionFields.map(field => {
            const value = fieldValues[field.field_key];
            return `
              <div class="field-group">
                <label class="field-label">${field.field_label}${field.is_required ? ' *' : ''}</label>
                <div class="field-value">
                  ${formatFieldValue(field, value)}
                </div>
                ${field.field_description ? `<div class="field-description">${escapeHtml(field.field_description)}</div>` : ''}
                ${value?.comment ? `<div class="field-comment"><strong>Comment:</strong> ${escapeHtml(value.comment)}</div>` : ''}
              </div>
            `;
          }).join('')}
        </div>
      `;
    }).join('')}

    <div class="signature-section">
      <div class="section-header">Execution</div>
      <div class="signature-block">
        <p style="margin-bottom: 20px; font-size: 10pt;">This agreement is executed as a deed.</p>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px;">
          <div>
            <div style="font-weight: 700; margin-bottom: 20px;">For the Head Contractor:</div>
            <div class="signature-line">Signature</div>
            <div class="signature-details">
              <div>Name: _________________________________</div>
              <div style="margin-top: 8px;">Position: _________________________________</div>
              <div style="margin-top: 8px;">Date: _________________________________</div>
            </div>
          </div>
          <div>
            <div style="font-weight: 700; margin-bottom: 20px;">For the Subcontractor:</div>
            <div class="signature-line">Signature</div>
            <div class="signature-details">
              <div>Name: _________________________________</div>
              <div style="margin-top: 8px;">Position: _________________________________</div>
              <div style="margin-top: 8px;">Date: _________________________________</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="footer">
      <p>Generated on ${new Date().toLocaleDateString('en-NZ', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
      <p style="margin-top: 8px;">This is a computer-generated document. Any amendments must be initialed by both parties.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}