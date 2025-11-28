import { useState, useEffect } from 'react';
import { FileDown, Printer, AlertTriangle, Target, TrendingUp, Shield, Loader2, Download, AlertCircle, Star, CheckCircle, ArrowRight, GitCompare } from 'lucide-react';
import { supabase } from '../lib/supabase';
import * as XLSX from 'xlsx';
import { analyzeQuoteIntelligence } from '../lib/quoteIntelligence/analyzer';
import type { QuoteIntelligenceAnalysis, RedFlag } from '../types/quoteIntelligence.types';
import WorkflowNav from '../components/WorkflowNav';
import type { DashboardMode } from '../App';

interface QuoteIntelligenceReportProps {
  projectId: string;
  projectName?: string;
  onNavigateBack?: () => void;
  onNavigateNext?: () => void;
  dashboardMode?: DashboardMode;
}

interface OriginalQuote {
  id: string;
  supplier_name: string;
  quote_reference: string;
}

export default function QuoteIntelligenceReport({ projectId, projectName, onNavigateBack, onNavigateNext, dashboardMode = 'original' }: QuoteIntelligenceReportProps) {
  const [analysis, setAnalysis] = useState<QuoteIntelligenceAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [originalQuotes, setOriginalQuotes] = useState<OriginalQuote[]>([]);
  const [selectedOriginalQuotes, setSelectedOriginalQuotes] = useState<string[]>([]);
  const [showOriginalSelector, setShowOriginalSelector] = useState(false);

  useEffect(() => {
    loadAnalysis();
    if (dashboardMode === 'revisions') {
      loadOriginalQuotes();
    }
  }, [projectId, dashboardMode]);

  useEffect(() => {
    if (dashboardMode === 'revisions' && selectedOriginalQuotes.length > 0) {
      loadAnalysis();
    }
  }, [selectedOriginalQuotes]);

  const loadOriginalQuotes = async () => {
    try {
      const { data, error } = await supabase
        .from('quotes')
        .select('id, supplier_name, quote_reference')
        .eq('project_id', projectId)
        .or('revision_number.is.null,revision_number.eq.1')
        .order('supplier_name', { ascending: true });

      if (error) throw error;
      setOriginalQuotes(data || []);
    } catch (err) {
      console.error('Failed to load original quotes:', err);
    }
  };

  const loadAnalysis = async () => {
    setLoading(true);
    setError(null);

    try {
      const quoteIdsToAnalyze = dashboardMode === 'revisions' && selectedOriginalQuotes.length > 0
        ? selectedOriginalQuotes
        : undefined;

      const result = await analyzeQuoteIntelligence(projectId, dashboardMode, quoteIdsToAnalyze);
      setAnalysis(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze quotes');
      console.error('Quote intelligence error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleOriginalQuote = (quoteId: string) => {
    setSelectedOriginalQuotes(prev => {
      if (prev.includes(quoteId)) {
        return prev.filter(id => id !== quoteId);
      } else {
        return [...prev, quoteId];
      }
    });
  };

  const handleClearOriginalSelection = () => {
    setSelectedOriginalQuotes([]);
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

  const groupRedFlagsBySeverity = (redFlags: RedFlag[]) => {
    return {
      critical: redFlags.filter(f => f.severity === 'critical'),
      high: redFlags.filter(f => f.severity === 'high'),
      medium: redFlags.filter(f => f.severity === 'medium'),
      low: redFlags.filter(f => f.severity === 'low'),
    };
  };

  const getSupplierQualityData = () => {
    if (!analysis) return [];

    const supplierMap = new Map<string, { name: string; qualityScore: number; coverageScore: number; redFlags: number; revisionNumber: number; quoteReference: string }>();

    analysis.normalizedItems.forEach(item => {
      if (!supplierMap.has(item.quoteId)) {
        supplierMap.set(item.quoteId, {
          name: item.supplierName,
          qualityScore: 0,
          coverageScore: 0,
          redFlags: 0,
          revisionNumber: item.revisionNumber,
          quoteReference: item.quoteReference,
        });
      }
    });

    analysis.redFlags.forEach(flag => {
      const supplier = supplierMap.get(flag.quoteId);
      if (supplier) {
        supplier.redFlags++;
      }
    });

    const suppliers = Array.from(supplierMap.values());
    suppliers.forEach(s => {
      s.qualityScore = Math.max(0, 100 - (s.redFlags * 10));
      s.coverageScore = analysis.summary.coverageScore;
    });

    return suppliers.sort((a, b) => b.qualityScore - a.qualityScore);
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

  const groupedFlags = groupRedFlagsBySeverity(analysis.redFlags);
  const supplierQualityData = getSupplierQualityData();

  return (
    <div className="space-y-8">
      <WorkflowNav
        currentStep="quoteintel"
        onNavigateBack={onNavigateBack}
        onNavigateNext={onNavigateNext}
      />

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 print:shadow-none">
        <div className="flex items-center justify-between mb-2">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">Quote Intelligence</h1>
            <p className="text-sm text-gray-600 mt-1">Automated analysis of supplier quotes</p>

            {dashboardMode === 'revisions' && originalQuotes.length > 0 && (
              <div className="mt-4">
                <button
                  onClick={() => setShowOriginalSelector(!showOriginalSelector)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium"
                >
                  <GitCompare size={16} />
                  Compare with Original Quotes
                  {selectedOriginalQuotes.length > 0 && (
                    <span className="ml-1 px-2 py-0.5 bg-blue-600 text-white rounded-full text-xs">
                      {selectedOriginalQuotes.length}
                    </span>
                  )}
                </button>

                {showOriginalSelector && (
                  <div className="mt-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-gray-900">Select Original Quotes to Compare</h3>
                      {selectedOriginalQuotes.length > 0 && (
                        <button
                          onClick={handleClearOriginalSelection}
                          className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                        >
                          Clear Selection
                        </button>
                      )}
                    </div>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {originalQuotes.map(quote => (
                        <label
                          key={quote.id}
                          className="flex items-center gap-3 p-3 bg-white rounded-md border border-gray-200 hover:border-blue-300 hover:bg-blue-50 cursor-pointer transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={selectedOriginalQuotes.includes(quote.id)}
                            onChange={() => handleToggleOriginalQuote(quote.id)}
                            className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                          />
                          <div className="flex-1">
                            <div className="text-sm font-medium text-gray-900">{quote.supplier_name}</div>
                            <div className="text-xs text-gray-500">{quote.quote_reference}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                    {selectedOriginalQuotes.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-600">
                        <p className="flex items-center gap-1">
                          <AlertCircle size={14} />
                          Analysis will compare revision quotes with {selectedOriginalQuotes.length} selected original quote{selectedOriginalQuotes.length > 1 ? 's' : ''}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex gap-2 print:hidden">
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors text-sm"
            >
              <Download size={16} />
              Export Excel
            </button>
            <button
              onClick={handleExportPDF}
              className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors text-sm"
            >
              <FileDown size={16} />
              Export PDF
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors text-sm"
            >
              <Printer size={16} />
              Print
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="bg-white rounded-2xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-600 mb-1">Issues Found</div>
                <div className="text-3xl font-bold text-gray-900">{analysis.summary.totalRedFlags}</div>
              </div>
              <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center">
                <AlertTriangle className="text-orange-600" size={24} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-600 mb-1">Critical Risks</div>
                <div className="text-3xl font-bold text-gray-900">{analysis.summary.criticalIssues}</div>
              </div>
              <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center">
                <AlertCircle className="text-red-600" size={24} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-600 mb-1">Top Supplier</div>
                <div className="text-xl font-bold text-gray-900 truncate">{analysis.summary.mostCompleteSupplier}</div>
              </div>
              <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center">
                <Star className="text-blue-600" size={24} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 print:shadow-none">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Supplier Comparison</h2>

        {supplierQualityData.length === 0 ? (
          <p className="text-gray-600 py-4">No supplier data available.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Supplier</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Quality Score</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Coverage Score</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Red Flags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {supplierQualityData.map((supplier, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{supplier.name}</span>
                        {supplier.revisionNumber > 1 ? (
                          <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-semibold rounded-full">
                            Rev {supplier.revisionNumber}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-semibold rounded-full">
                            Original
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">{supplier.quoteReference}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-200 rounded-full h-2 max-w-[120px]">
                          <div
                            className="bg-blue-600 h-2 rounded-full"
                            style={{ width: `${supplier.qualityScore}%` }}
                          />
                        </div>
                        <span className="font-medium">{supplier.qualityScore}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-200 rounded-full h-2 max-w-[120px]">
                          <div
                            className="bg-green-600 h-2 rounded-full"
                            style={{ width: `${supplier.coverageScore}%` }}
                          />
                        </div>
                        <span className="font-medium">{supplier.coverageScore}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        supplier.redFlags === 0 ? 'bg-green-100 text-green-800' :
                        supplier.redFlags <= 2 ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {supplier.redFlags}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 print:shadow-none print:break-after-page">
        <div className="flex items-center gap-3 mb-6">
          <AlertTriangle className="text-red-600" size={24} />
          <h2 className="text-xl font-bold text-gray-900">Red Flags</h2>
        </div>

        {analysis.redFlags.length === 0 ? (
          <div className="text-center py-8">
            <CheckCircle className="mx-auto text-green-600 mb-3" size={48} />
            <p className="text-gray-900 font-medium">No red flags detected</p>
            <p className="text-sm text-gray-600 mt-1">All quotes passed automated quality checks</p>
          </div>
        ) : (
          <div className="space-y-6">
            {groupedFlags.critical.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-red-900 mb-3 flex items-center gap-2">
                  <AlertCircle size={20} />
                  Critical ({groupedFlags.critical.length})
                </h3>
                <div className="space-y-3">
                  {groupedFlags.critical.map((flag) => {
                    const quote = analysis.normalizedItems.find(item => item.quoteId === flag.quoteId);
                    return (
                      <div key={flag.id} className="border border-red-300 rounded-lg p-4 bg-red-50">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-bold uppercase px-2 py-1 bg-red-600 text-white rounded">
                                {flag.severity}
                              </span>
                              <span className="text-sm font-medium text-red-900">{flag.category}</span>
                            </div>
                            <h4 className="font-semibold text-gray-900">{flag.title}</h4>
                            <p className="text-sm text-gray-700 mt-1">{quote?.supplierName || 'Unknown Supplier'}</p>
                          </div>
                        </div>
                        <p className="text-sm text-gray-800 mb-2">{flag.description}</p>
                        {flag.recommendation && (
                          <div className="mt-3 pt-3 border-t border-red-200">
                            <p className="text-sm font-medium text-gray-900 mb-1">Recommendation:</p>
                            <p className="text-sm text-gray-700">{flag.recommendation}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {groupedFlags.high.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-orange-900 mb-3 flex items-center gap-2">
                  <AlertTriangle size={20} />
                  High ({groupedFlags.high.length})
                </h3>
                <div className="space-y-3">
                  {groupedFlags.high.map((flag) => {
                    const quote = analysis.normalizedItems.find(item => item.quoteId === flag.quoteId);
                    return (
                      <div key={flag.id} className="border border-orange-300 rounded-lg p-4 bg-orange-50">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-bold uppercase px-2 py-1 bg-orange-600 text-white rounded">
                                {flag.severity}
                              </span>
                              <span className="text-sm font-medium text-orange-900">{flag.category}</span>
                            </div>
                            <h4 className="font-semibold text-gray-900">{flag.title}</h4>
                            <p className="text-sm text-gray-700 mt-1">{quote?.supplierName || 'Unknown Supplier'}</p>
                          </div>
                        </div>
                        <p className="text-sm text-gray-800 mb-2">{flag.description}</p>
                        {flag.recommendation && (
                          <div className="mt-3 pt-3 border-t border-orange-200">
                            <p className="text-sm font-medium text-gray-900 mb-1">Recommendation:</p>
                            <p className="text-sm text-gray-700">{flag.recommendation}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {groupedFlags.medium.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-yellow-900 mb-3">Medium ({groupedFlags.medium.length})</h3>
                <div className="space-y-2">
                  {groupedFlags.medium.map((flag) => {
                    const quote = analysis.normalizedItems.find(item => item.quoteId === flag.quoteId);
                    return (
                      <div key={flag.id} className="border border-yellow-300 rounded-lg p-3 bg-yellow-50">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold uppercase px-2 py-0.5 bg-yellow-600 text-white rounded">
                            {flag.severity}
                          </span>
                          <span className="text-sm font-semibold text-gray-900">{flag.title}</span>
                          <span className="text-sm text-gray-600">• {quote?.supplierName || 'Unknown'}</span>
                        </div>
                        <p className="text-sm text-gray-700">{flag.description}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {groupedFlags.low.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-blue-900 mb-3">Low ({groupedFlags.low.length})</h3>
                <div className="space-y-2">
                  {groupedFlags.low.map((flag) => {
                    const quote = analysis.normalizedItems.find(item => item.quoteId === flag.quoteId);
                    return (
                      <div key={flag.id} className="border border-blue-200 rounded-lg p-3 bg-blue-50">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold uppercase px-2 py-0.5 bg-blue-600 text-white rounded">
                            {flag.severity}
                          </span>
                          <span className="text-sm font-semibold text-gray-900">{flag.title}</span>
                          <span className="text-sm text-gray-600">• {quote?.supplierName || 'Unknown'}</span>
                        </div>
                        <p className="text-sm text-gray-700">{flag.description}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 print:shadow-none">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Recommended Actions</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-md transition-all">
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                <Target className="text-blue-600" size={20} />
              </div>
              <ArrowRight className="text-gray-400" size={18} />
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Normalise Remaining Items</h3>
            <p className="text-sm text-gray-600 mb-3">
              Ensure all line items have standardized units and attributes for accurate comparison.
            </p>
            <button
              onClick={onNavigateBack}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Go to Review & Clean →
            </button>
          </div>

          <div className="border border-gray-200 rounded-lg p-4 hover:border-green-300 hover:shadow-md transition-all">
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
                <TrendingUp className="text-green-600" size={20} />
              </div>
              <ArrowRight className="text-gray-400" size={18} />
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Map Unmapped Systems</h3>
            <p className="text-sm text-gray-600 mb-3">
              Complete system mapping to improve coverage analysis and reporting accuracy.
            </p>
            <button
              onClick={onNavigateBack}
              className="text-sm text-green-600 hover:text-green-700 font-medium"
            >
              Go to Review & Clean →
            </button>
          </div>

          <div className="border border-gray-200 rounded-lg p-4 hover:border-purple-300 hover:shadow-md transition-all">
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center">
                <Shield className="text-purple-600" size={20} />
              </div>
              <ArrowRight className="text-gray-400" size={18} />
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Review Problematic Rows</h3>
            <p className="text-sm text-gray-600 mb-3">
              Address flagged items to improve quote quality before generating reports.
            </p>
            <button
              onClick={onNavigateBack}
              className="text-sm text-purple-600 hover:text-purple-700 font-medium"
            >
              Go to Review & Clean →
            </button>
          </div>
        </div>
      </div>

      {analysis.coverageGaps && analysis.coverageGaps.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 print:shadow-none print:break-after-page">
          <div className="flex items-center gap-3 mb-4">
            <Target className="text-orange-600" size={24} />
            <h2 className="text-xl font-bold text-gray-900">Coverage Gaps</h2>
          </div>

          <div className="space-y-3">
            {analysis.coverageGaps.map((gap) => (
              <div key={gap.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium uppercase px-2 py-1 bg-gray-600 text-white rounded">
                        {gap.gapType}
                      </span>
                    </div>
                    <h4 className="font-semibold text-gray-900">{gap.title}</h4>
                  </div>
                </div>
                <p className="text-sm text-gray-700 mb-2">{gap.description}</p>
                {gap.recommendation && (
                  <div className="mt-2 pt-2 border-t border-gray-300">
                    <p className="text-sm font-medium text-gray-900 mb-1">Recommendation:</p>
                    <p className="text-sm text-gray-700">{gap.recommendation}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
