import { FieldDefinition, FieldValue } from '../../components/SubcontractFormField';

interface AgreementData {
  agreement_number: string;
  subcontractor_name: string;
  template_name: string;
  completed_at: string | null;
  created_at: string;
}

interface PDFGenerationOptions {
  includeComments: boolean;
  includeEmptyFields: boolean;
  organisationLogo?: string;
  organisationName?: string;
}

export class SubcontractPDFGenerator {
  private fields: FieldDefinition[];
  private values: Record<string, FieldValue>;
  private agreement: AgreementData;
  private options: PDFGenerationOptions;

  constructor(
    fields: FieldDefinition[],
    values: Record<string, FieldValue>,
    agreement: AgreementData,
    options: Partial<PDFGenerationOptions> = {}
  ) {
    this.fields = fields;
    this.values = values;
    this.agreement = agreement;
    this.options = {
      includeComments: true,
      includeEmptyFields: false,
      ...options
    };
  }

  private isFieldVisible(field: FieldDefinition): boolean {
    if (!field.required_when_json || Object.keys(field.required_when_json).length === 0) {
      return true;
    }

    const allValues = this.getAllValuesMap();
    return Object.entries(field.required_when_json).every(([key, requiredValue]) => {
      return allValues[key] === requiredValue;
    });
  }

  private getAllValuesMap(): Record<string, string> {
    const map: Record<string, string> = {};
    for (const [key, value] of Object.entries(this.values)) {
      map[key] = value.field_value || '';
    }
    return map;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-NZ', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  private formatFieldValue(field: FieldDefinition, value: string): string {
    if (!value || value.trim() === '') {
      return '<em class="text-gray-400">Not specified</em>';
    }

    if (field.field_type === 'date' && value) {
      return this.formatDate(value);
    }

    if (field.field_type === 'number' && value) {
      const num = parseFloat(value);
      if (!isNaN(num)) {
        return num.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
    }

    if (field.field_type === 'textarea') {
      return value.replace(/\n/g, '<br>');
    }

    return this.escapeHtml(value);
  }

  generateHTML(): string {
    const sections = [...new Set(this.fields.map(f => f.section))];

    const headerHtml = `
      <div class="header">
        ${this.options.organisationLogo ? `<img src="${this.options.organisationLogo}" alt="Logo" class="logo">` : ''}
        <div class="header-content">
          <h1>${this.agreement.template_name}</h1>
          <h2>Completion Pack</h2>
          <div class="meta">
            <p><strong>Agreement Number:</strong> ${this.escapeHtml(this.agreement.agreement_number)}</p>
            <p><strong>Subcontractor:</strong> ${this.escapeHtml(this.agreement.subcontractor_name)}</p>
            ${this.options.organisationName ? `<p><strong>Head Contractor:</strong> ${this.escapeHtml(this.options.organisationName)}</p>` : ''}
            <p><strong>Generated:</strong> ${this.formatDate(new Date().toISOString())}</p>
            ${this.agreement.completed_at ? `<p><strong>Completed:</strong> ${this.formatDate(this.agreement.completed_at)}</p>` : ''}
          </div>
        </div>
      </div>
    `;

    let sectionsHtml = '';

    for (const section of sections) {
      const sectionFields = this.fields
        .filter(f => f.section === section)
        .filter(f => this.isFieldVisible(f));

      const fieldsToShow = sectionFields.filter(f => {
        if (this.options.includeEmptyFields) return true;
        const value = this.values[f.field_key]?.field_value;
        return value && value.trim() !== '';
      });

      if (fieldsToShow.length === 0) continue;

      sectionsHtml += `
        <div class="section">
          <h3 class="section-title">${this.escapeHtml(section)}</h3>
          <div class="fields">
      `;

      for (const field of fieldsToShow) {
        const fieldValue = this.values[field.field_key]?.field_value || '';
        const comment = this.values[field.field_key]?.comment || '';

        sectionsHtml += `
          <div class="field">
            <div class="field-label">
              ${this.escapeHtml(field.field_label)}
              ${field.is_required ? '<span class="required">*</span>' : ''}
            </div>
            <div class="field-value">${this.formatFieldValue(field, fieldValue)}</div>
            ${this.options.includeComments && comment ? `
              <div class="field-comment">
                <strong>Comment:</strong> ${this.escapeHtml(comment)}
              </div>
            ` : ''}
          </div>
        `;
      }

      sectionsHtml += `
          </div>
        </div>
      `;
    }

    const footerHtml = `
      <div class="footer">
        <p>This document was automatically generated from the ${this.agreement.template_name} system.</p>
        <p>Generated on: ${this.formatDate(new Date().toISOString())}</p>
      </div>
    `;

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${this.agreement.template_name} - ${this.agreement.subcontractor_name}</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }

          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            font-size: 11pt;
            line-height: 1.6;
            color: #1f2937;
            background: #ffffff;
            padding: 40px;
          }

          .header {
            margin-bottom: 40px;
            padding-bottom: 30px;
            border-bottom: 3px solid #2563eb;
            display: flex;
            gap: 30px;
            align-items: flex-start;
          }

          .logo {
            max-width: 150px;
            max-height: 80px;
          }

          .header-content {
            flex: 1;
          }

          h1 {
            font-size: 24pt;
            font-weight: 700;
            color: #111827;
            margin-bottom: 8px;
          }

          h2 {
            font-size: 18pt;
            font-weight: 600;
            color: #4b5563;
            margin-bottom: 20px;
          }

          .meta {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            font-size: 10pt;
            color: #6b7280;
          }

          .meta p {
            margin: 0;
          }

          .section {
            margin-bottom: 40px;
            page-break-inside: avoid;
          }

          .section-title {
            font-size: 16pt;
            font-weight: 700;
            color: #1f2937;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 2px solid #e5e7eb;
          }

          .fields {
            display: grid;
            gap: 20px;
          }

          .field {
            padding: 15px;
            background: #f9fafb;
            border: 1px solid #e5e7eb;
            border-radius: 6px;
            page-break-inside: avoid;
          }

          .field-label {
            font-size: 10pt;
            font-weight: 600;
            color: #374151;
            margin-bottom: 6px;
          }

          .required {
            color: #dc2626;
            margin-left: 3px;
          }

          .field-value {
            font-size: 11pt;
            color: #1f2937;
            white-space: pre-wrap;
            word-wrap: break-word;
          }

          .field-comment {
            margin-top: 10px;
            padding: 10px;
            background: #fef3c7;
            border-left: 3px solid #f59e0b;
            font-size: 10pt;
            color: #92400e;
            border-radius: 4px;
          }

          .footer {
            margin-top: 60px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            text-align: center;
            font-size: 9pt;
            color: #9ca3af;
          }

          .footer p {
            margin: 4px 0;
          }

          @media print {
            body {
              padding: 20px;
            }

            .section {
              page-break-inside: avoid;
            }

            .field {
              page-break-inside: avoid;
            }
          }
        </style>
      </head>
      <body>
        ${headerHtml}
        ${sectionsHtml}
        ${footerHtml}
      </body>
      </html>
    `;
  }

  async generatePDF(): Promise<Blob> {
    const html = this.generateHTML();

    const gotenbergUrl = import.meta.env.VITE_GOTENBERG_URL || 'https://gotenberg.fly.dev';

    const formData = new FormData();
    formData.append('files', new Blob([html], { type: 'text/html' }), 'agreement.html');

    const response = await fetch(`${gotenbergUrl}/forms/chromium/convert/html`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`PDF generation failed: ${response.statusText}`);
    }

    return await response.blob();
  }

  downloadPDF(blob: Blob, filename?: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `${this.agreement.template_name}-${this.agreement.agreement_number}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async generateAndDownload(filename?: string): Promise<void> {
    const blob = await this.generatePDF();
    this.downloadPDF(blob, filename);
  }
}
