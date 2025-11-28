import { useState, useEffect } from 'react';
import { FileDown, Printer, AlertTriangle, Target, TrendingUp, Shield, Loader2, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { analyzeQuoteIntelligence } from '../lib/quoteIntelligence/analyzer';
import type { QuoteIntelligenceAnalysis } from '../types/quoteIntelligence.types';

interface QuoteIntelligenceReportProps {
  projectId: string;
  projectName?: string;
}

export default function QuoteIntelligenceReport({ projectId, projectName }: QuoteIntelligenceReportProps) {
  const [analysis, setAnalysis] = useState<QuoteIntelligenceAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAnalysis();
  }, [projectId]);

  const loadAnalysis = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await analyzeQuoteIntelligence(projectId);
      setAnalysis(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze quotes');
      console.error('Quote intelligence error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportPDF = () => {
    window.print();
  };

  const handleExportExcel = () => {
    if (!analysis) return;

    const wb = XLSX.utils.book_new();

    const summaryData = [
      ['Quote Intelligence Report'],
      ['Project:', projectName || 'Unknown'],
      ['Generated:', new Date(analysis.analyzedAt).toLocaleString()],
      [],
      ['Summary'],
      ['Quotes Analyzed:', analysis.quotesAnalyzed],
      ['Total Red Flags:', analysis.summary.totalRedFlags],
      ['Critical Issues:', analysis.summary.criticalIssues],
      ['Coverage Score:', `${analysis.summary.coverageScore}%`],
      ['Average Quality Score:', `${analysis.summary.averageQualityScore}%`],
      ['Best Value Supplier:', analysis.summary.bestValueSupplier],
      ['Most Complete Supplier:', analysis.summary.mostCompleteSupplier],
    ];

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

    const redFlagsData = [
      ['Severity', 'Category', 'Title', 'Description', 'Supplier', 'Recommendation'],
      ...analysis.redFlags.map(flag => {
        const quote = analysis.normalizedItems.find(item => item.quoteId === flag.quoteId);
        return [
          flag.severity,
          flag.category,
          flag.title,
          flag.description,
          quote?.supplierName || 'Unknown',
          flag.recommendation,
        ];
      }),
    ];

    const redFlagsSheet = XLSX.utils.aoa_to_sheet(redFlagsData);
    XLSX.utils.book_append_sheet(wb, redFlagsSheet, 'Red Flags');

    const gapsData = [
      ['Type', 'Title', 'Description', 'Missing In', 'Present In', 'Impact', 'Recommendation'],
      ...analysis.coverageGaps.map(gap => [
        gap.gapType,
        gap.title,
        gap.description,
        gap.missingIn.join(', '),
        gap.presentIn.join(', '),
        `$${gap.estimatedImpact.toLocaleString()}`,
        gap.recommendation,
      ]),
    ];

    const gapsSheet = XLSX.utils.aoa_to_sheet(gapsData);
    XLSX.utils.book_append_sheet(wb, gapsSheet, 'Coverage Gaps');

    const systemsData = [
      ['System Name', 'System Type', 'Supplier', 'Item Count', 'Total Value', 'Confidence'],
      ...analysis.systemsDetected.map(system => {
        const quote = analysis.normalizedItems.find(item => item.quoteId === system.quoteId);
        return [
          system.systemName,
          system.systemType,
          quote?.supplierName || 'Unknown',
          system.itemCount,
          `$${system.totalValue.toLocaleString()}`,
          `${(system.confidence * 100).toFixed(1)}%`,
        ];
      }),
    ];

    const systemsSheet = XLSX.utils.aoa_to_sheet(systemsData);
    XLSX.utils.book_append_sheet(wb, systemsSheet, 'Systems Detected');

    const insightsData = [
      ['Supplier', 'Type', 'Title', 'Description', 'Recommendation'],
      ...analysis.supplierInsights.map(insight => [
        insight.supplierName,
        insight.insightType,
        insight.title,
        insight.description,
        insight.recommendation,
      ]),
    ];

    const insightsSheet = XLSX.utils.aoa_to_sheet(insightsData);
    XLSX.utils.book_append_sheet(wb, insightsSheet, 'Supplier Insights');

    const filename = `${projectName}_QuoteIntelligence.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'high':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'low':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="animate-spin mx-auto mb-4 text-blue-600" size={40} />
          <p className="text-lg font-medium text-gray-900">Analyzing Quotes...</p>
        </div>
      </div>
    );
  }

  if (error || !analysis) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="text-red-600 flex-shrink-0" size={24} />
          <div>
            <h3 className="font-semibold text-red-900 mb-1">Analysis Error</h3>
            <p className="text-sm text-red-800">{error || 'No analysis data available'}</p>
            <button
              onClick={loadAnalysis}
              className="mt-3 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm"
            >
              Retry Analysis
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 print:shadow-none">
        <div className="flex items-center justify-between mb-6 print:mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Quote Intelligence Report</h1>
            <p className="text-sm text-gray-600 mt-1">{projectName || 'Project Analysis'}</p>
            <p className="text-xs text-gray-500 mt-1">
              Generated: {new Date(analysis.analyzedAt).toLocaleString()}
            </p>
          </div>
          <div className="flex gap-2 print:hidden">
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Download size={18} />
              Excel
            </button>
            <button
              onClick={handleExportPDF}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              <FileDown size={18} />
              PDF
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              <Printer size={18} />
              Print
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <div className="text-sm text-blue-700 font-medium mb-1">Quotes Analyzed</div>
            <div className="text-3xl font-bold text-blue-900">{analysis.quotesAnalyzed}</div>
          </div>
          <div className="bg-red-50 rounded-lg p-4 border border-red-200">
            <div className="text-sm text-red-700 font-medium mb-1">Red Flags</div>
            <div className="text-3xl font-bold text-red-900">{analysis.summary.totalRedFlags}</div>
            <div className="text-xs text-red-600 mt-1">{analysis.summary.criticalIssues} critical</div>
          </div>
          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
            <div className="text-sm text-green-700 font-medium mb-1">Coverage Score</div>
            <div className="text-3xl font-bold text-green-900">{analysis.summary.coverageScore}%</div>
          </div>
          <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
            <div className="text-sm text-purple-700 font-medium mb-1">Quality Score</div>
            <div className="text-3xl font-bold text-purple-900">{Math.round(analysis.summary.averageQualityScore)}%</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
            <div className="text-sm text-blue-700 font-semibold mb-2">Best Value Supplier</div>
            <div className="text-xl font-bold text-blue-900">{analysis.summary.bestValueSupplier}</div>
          </div>
          <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
            <div className="text-sm text-green-700 font-semibold mb-2">Most Complete Supplier</div>
            <div className="text-xl font-bold text-green-900">{analysis.summary.mostCompleteSupplier}</div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 print:shadow-none print:break-after-page">
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="text-red-600" size={24} />
          <h2 className="text-xl font-bold text-gray-900">Red Flags</h2>
        </div>

        {analysis.redFlags.length === 0 ? (
          <p className="text-gray-600 py-4">No red flags detected.</p>
        ) : (
          <div className="space-y-3">
            {analysis.redFlags.map((flag) => {
              const quote = analysis.normalizedItems.find(item => item.quoteId === flag.quoteId);
              return (
                <div key={flag.id} className={`border rounded-lg p-4 ${getSeverityColor(flag.severity)}`}>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold uppercase px-2 py-1 bg-white rounded">
                          {flag.severity}
                        </span>
                        <span className="text-sm font-medium">{flag.category}</span>
                      </div>
                      <h3 className="font-semibold text-lg">{flag.title}</h3>
                      <p className="text-sm mt-1">{quote?.supplierName || 'Unknown Supplier'}</p>
                    </div>
                  </div>
                  <p className="text-sm mb-2">{flag.description}</p>
                  {flag.recommendation && (
                    <div className="mt-2 pt-2 border-t border-current border-opacity-20">
                      <p className="text-sm font-medium">Recommendation:</p>
                      <p className="text-sm">{flag.recommendation}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 print:shadow-none print:break-after-page">
        <div className="flex items-center gap-3 mb-4">
          <Target className="text-orange-600" size={24} />
          <h2 className="text-xl font-bold text-gray-900">Coverage Gaps</h2>
        </div>

        {analysis.coverageGaps.length === 0 ? (
          <p className="text-gray-600 py-4">No coverage gaps identified.</p>
        ) : (
          <div className="space-y-3">
            {analysis.coverageGaps.map((gap) => (
              <div key={gap.id} className="border border-orange-200 rounded-lg p-4 bg-orange-50">
                <h3 className="font-semibold text-lg text-orange-900 mb-2">{gap.title}</h3>
                <p className="text-sm text-orange-800 mb-3">{gap.description}</p>

                <div className="grid grid-cols-2 gap-4 mb-3 text-sm">
                  <div>
                    <p className="font-medium text-orange-900">Missing in:</p>
                    <p className="text-orange-700">{gap.missingIn.join(', ')}</p>
                  </div>
                  <div>
                    <p className="font-medium text-orange-900">Present in:</p>
                    <p className="text-orange-700">{gap.presentIn.join(', ')}</p>
                  </div>
                </div>

                {gap.estimatedImpact > 0 && (
                  <p className="text-sm font-semibold text-orange-900 mb-2">
                    Estimated Impact: ${gap.estimatedImpact.toLocaleString()}
                  </p>
                )}

                {gap.recommendation && (
                  <div className="mt-2 pt-2 border-t border-orange-300">
                    <p className="text-sm font-medium text-orange-900">Recommendation:</p>
                    <p className="text-sm text-orange-800">{gap.recommendation}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 print:shadow-none print:break-after-page">
        <div className="flex items-center gap-3 mb-4">
          <Shield className="text-blue-600" size={24} />
          <h2 className="text-xl font-bold text-gray-900">Systems Detected</h2>
        </div>

        {analysis.systemsDetected.length === 0 ? (
          <p className="text-gray-600 py-4">No systems detected.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 font-semibold">System</th>
                  <th className="text-left py-2 font-semibold">Type</th>
                  <th className="text-left py-2 font-semibold">Supplier</th>
                  <th className="text-right py-2 font-semibold">Items</th>
                  <th className="text-right py-2 font-semibold">Total Value</th>
                  <th className="text-right py-2 font-semibold">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {analysis.systemsDetected.map((system) => {
                  const quote = analysis.normalizedItems.find(item => item.quoteId === system.quoteId);
                  return (
                    <tr key={system.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2">{system.systemName}</td>
                      <td className="py-2 text-gray-600">{system.systemType}</td>
                      <td className="py-2 text-gray-600">{quote?.supplierName || 'Unknown'}</td>
                      <td className="py-2 text-right">{system.itemCount}</td>
                      <td className="py-2 text-right font-medium">${system.totalValue.toLocaleString()}</td>
                      <td className="py-2 text-right">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          system.confidence > 0.8 ? 'bg-green-100 text-green-800' :
                          system.confidence > 0.6 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {(system.confidence * 100).toFixed(0)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 print:shadow-none">
        <div className="flex items-center gap-3 mb-4">
          <TrendingUp className="text-purple-600" size={24} />
          <h2 className="text-xl font-bold text-gray-900">Supplier Insights</h2>
        </div>

        {analysis.supplierInsights.length === 0 ? (
          <p className="text-gray-600 py-4">No supplier insights available.</p>
        ) : (
          <div className="space-y-3">
            {analysis.supplierInsights.map((insight) => (
              <div key={insight.id} className="border border-purple-200 rounded-lg p-4 bg-purple-50">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-semibold text-lg text-purple-900">{insight.supplierName}</h3>
                    <span className="text-xs font-medium text-purple-700 uppercase">{insight.insightType}</span>
                  </div>
                </div>
                <h4 className="font-semibold text-purple-900 mb-1">{insight.title}</h4>
                <p className="text-sm text-purple-800 mb-3">{insight.description}</p>

                {insight.recommendation && (
                  <div className="mt-2 pt-2 border-t border-purple-300">
                    <p className="text-sm font-medium text-purple-900">Recommendation:</p>
                    <p className="text-sm text-purple-800">{insight.recommendation}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
