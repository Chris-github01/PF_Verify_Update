import { useState } from 'react';
import { FileText, Download, Printer } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { QuoteIntelligenceAnalysis } from '../types/quoteIntelligence.types';

interface RFIGeneratorProps {
  projectId: string;
  projectName: string;
  supplierName: string;
  quoteId: string;
  quoteDate: string;
  intelligenceData: QuoteIntelligenceAnalysis | null;
  onGenerated: () => void;
}

export default function RFIGenerator({
  projectId,
  projectName,
  supplierName,
  quoteId,
  quoteDate,
  intelligenceData,
  onGenerated,
}: RFIGeneratorProps) {
  const [generating, setGenerating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { data: existing } = await supabase
        .from('project_settings')
        .select('settings')
        .eq('project_id', projectId)
        .maybeSingle();

      const currentSettings = existing?.settings || {};

      await supabase
        .from('project_settings')
        .upsert({
          project_id: projectId,
          settings: {
            ...currentSettings,
            rfi_generated: true,
          },
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'project_id'
        });

      onGenerated();
      setShowPreview(true);
    } catch (error) {
      console.error('Error generating RFI:', error);
      alert('Failed to generate RFI. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportPDF = () => {
    window.print();
  };

  const getRFIContent = () => {
    const today = new Date().toLocaleDateString('en-NZ', { year: 'numeric', month: 'long', day: 'numeric' });
    const responseDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-NZ', { year: 'numeric', month: 'long', day: 'numeric' });

    const scopeClarifications = intelligenceData?.coverageGaps
      ?.filter(g => g.severity === 'high' || g.severity === 'medium')
      .map(g => `• ${g.description}`)
      .slice(0, 5)
      .join('\n') || '• Confirmation of compliance with all project specifications';

    const abnormalRates = intelligenceData?.redFlags
      ?.filter(f => f.category === 'pricing')
      .map(f => `• ${f.description}`)
      .slice(0, 3)
      .join('\n') || '';

    return `
SUBJECT: Request for Information / Clarification – ${projectName}

Dear ${supplierName} Team,

Thank you for submitting your quotation dated ${quoteDate} for the ${projectName} works.

Following a full review of all tenders received, your offer is currently our preferred submission, subject to clarification of the items listed below and agreement of final commercial terms.

We request your confirmation and additional information on the following points:

1. SCOPE AND ASSUMPTIONS

${scopeClarifications}

2. RATES AND PRICING STRUCTURE

Please confirm that your rates and lump sums are fixed for the agreed programme period and include all labour, materials, plant, access, supervision, QA, and compliance documentation required by the contract.

${abnormalRates ? 'Areas requiring clarification:\n' + abnormalRates : ''}

3. PROGRAMME AND RESOURCES

Please confirm your ability to meet the target start and completion dates and provide a brief resourcing outline.

4. QUALITY, COMPLIANCE, AND WARRANTIES

Confirm that all proposed systems are fully compliant with project specifications, fire engineering report, and NZBC, and that you will provide all required QA, PS3s, and as-builts.

Please respond by ${responseDate} so that we can finalise our award recommendation.

This request does not constitute a formal acceptance of your quotation. A subcontract will only be deemed awarded once a written subcontract agreement has been executed by both parties.

Kind regards,
Project Team
${projectName}

Generated: ${today}
    `.trim();
  };

  if (showPreview) {
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">RFI / Clarification Pack</h3>
            <div className="flex gap-2">
              <button
                onClick={handlePrint}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Printer size={16} />
                Print
              </button>
              <button
                onClick={handleExportPDF}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Download size={16} />
                Export PDF
              </button>
            </div>
          </div>
          <div className="prose max-w-none">
            <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800 leading-relaxed">
              {getRFIContent()}
            </pre>
          </div>
        </div>
        <button
          onClick={() => setShowPreview(false)}
          className="text-sm text-gray-600 hover:text-gray-900"
        >
          ← Back to generation options
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <FileText className="w-6 h-6 text-blue-600" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Generate RFI Pack</h3>
          <p className="text-gray-600 mb-4">
            Create a Request for Information document for the preferred supplier to clarify scope, pricing, and compliance details.
          </p>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Generating...
              </>
            ) : (
              <>
                <FileText size={18} />
                Generate RFI Pack
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
