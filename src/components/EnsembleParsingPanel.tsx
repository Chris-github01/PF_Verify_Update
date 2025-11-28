import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, AlertTriangle, TrendingUp, Clock, FileText } from 'lucide-react';

interface ParserResult {
  parser_name: string;
  success: boolean;
  items: any[];
  metadata: any;
  financials: any;
  confidence_score: number;
  extraction_time_ms: number;
  errors?: string[];
}

interface EnsembleData {
  best_result: ParserResult;
  all_results: ParserResult[];
  consensus_items: any[];
  confidence_breakdown: {
    overall: number;
    parsers_succeeded: number;
    parsers_attempted: number;
    cross_model_agreement: number;
    best_parser: string;
    best_parser_confidence: number;
  };
  recommendation: string;
  extraction_metadata: {
    total_extraction_time_ms: number;
    parsers_used: string[];
    file_name: string;
    file_size: number;
    timestamp: string;
  };
}

interface EnsembleParsingPanelProps {
  quoteId: string;
}

const PARSER_NAMES: Record<string, string> = {
  external_python_extractor: 'Python PDF Extractor',
  multi_model_ai: 'Multi-Model AI (GPT-4 + Claude)',
  production_parser: 'Production Parser',
};

const PARSER_DESCRIPTIONS: Record<string, string> = {
  external_python_extractor: 'Table-based extraction using pdfplumber + PyMuPDF',
  multi_model_ai: 'AI ensemble with GPT-4o and Claude 3.5 Sonnet',
  production_parser: 'Regex-based production parser with ontology mapping',
};

export default function EnsembleParsingPanel({ quoteId }: EnsembleParsingPanelProps) {
  const [ensembleData, setEnsembleData] = useState<EnsembleData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEnsembleData();
  }, [quoteId]);

  async function loadEnsembleData() {
    try {
      setLoading(true);
      const { data: quote } = await window.supabase
        .from('quotes')
        .select('ensemble_run_id, parser_confidence_scores, extraction_confidence')
        .eq('id', quoteId)
        .single();

      if (quote?.ensemble_run_id) {
        const { data: ensembleRun } = await window.supabase
          .from('parsing_ensemble_runs')
          .select('*')
          .eq('id', quote.ensemble_run_id)
          .single();

        if (ensembleRun) {
          setEnsembleData({
            best_result: ensembleRun.results_json[0],
            all_results: ensembleRun.results_json,
            consensus_items: ensembleRun.consensus_items_json,
            confidence_breakdown: {
              overall: ensembleRun.confidence_score,
              parsers_succeeded: ensembleRun.parsers_succeeded,
              parsers_attempted: ensembleRun.parsers_attempted,
              cross_model_agreement: ensembleRun.cross_model_agreement,
              best_parser: ensembleRun.best_parser,
              best_parser_confidence: ensembleRun.confidence_score,
            },
            recommendation: ensembleRun.recommendation,
            extraction_metadata: ensembleRun.metadata,
          });
        }
      }
    } catch (error) {
      console.error('Failed to load ensemble data:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          <div className="h-20 bg-gray-200 rounded"></div>
          <div className="h-20 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!ensembleData) {
    return (
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-6 text-center">
        <AlertTriangle className="mx-auto mb-2 text-gray-400" size={32} />
        <p className="text-gray-600">No ensemble parsing data available for this quote.</p>
        <p className="text-sm text-gray-500 mt-1">This quote may have been parsed using a single parser.</p>
      </div>
    );
  }

  const { all_results, confidence_breakdown, recommendation, extraction_metadata } = ensembleData;

  const getRecommendationStyle = (rec: string) => {
    if (rec === 'HIGH_CONFIDENCE_MULTI_PARSER') {
      return { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800', icon: CheckCircle };
    } else if (rec === 'MODERATE_CONFIDENCE_SINGLE_PARSER') {
      return { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-800', icon: AlertTriangle };
    } else {
      return { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', icon: XCircle };
    }
  };

  const recStyle = getRecommendationStyle(recommendation);
  const RecIcon = recStyle.icon;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Multi-Parser Ensemble Analysis</h3>
            <p className="text-sm text-gray-600 mt-1">
              Confidence based on {confidence_breakdown.parsers_attempted} parsers working together
            </p>
          </div>
          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${recStyle.border} ${recStyle.bg}`}>
            <RecIcon size={20} className={recStyle.text} />
            <span className={`font-medium ${recStyle.text}`}>
              {Math.round(confidence_breakdown.overall * 100)}% Confidence
            </span>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
            <div className="text-sm text-blue-600 font-medium mb-1">Parsers Succeeded</div>
            <div className="text-2xl font-bold text-blue-900">
              {confidence_breakdown.parsers_succeeded}/{confidence_breakdown.parsers_attempted}
            </div>
          </div>

          <div className="bg-green-50 rounded-lg p-4 border border-green-100">
            <div className="text-sm text-green-600 font-medium mb-1">Cross-Model Agreement</div>
            <div className="text-2xl font-bold text-green-900">
              {Math.round(confidence_breakdown.cross_model_agreement * 100)}%
            </div>
          </div>

          <div className="bg-purple-50 rounded-lg p-4 border border-purple-100">
            <div className="text-sm text-purple-600 font-medium mb-1">Items Extracted</div>
            <div className="text-2xl font-bold text-purple-900">
              {ensembleData.consensus_items.length}
            </div>
          </div>

          <div className="bg-orange-50 rounded-lg p-4 border border-orange-100">
            <div className="text-sm text-orange-600 font-medium mb-1">Total Time</div>
            <div className="text-2xl font-bold text-orange-900">
              {(extraction_metadata.total_extraction_time_ms / 1000).toFixed(1)}s
            </div>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <TrendingUp size={16} />
            Parser Performance Breakdown
          </h4>
          <div className="space-y-3">
            {all_results.map((result, idx) => (
              <div
                key={idx}
                className={`border rounded-lg p-4 ${
                  result.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {result.success ? (
                      <CheckCircle size={18} className="text-green-600" />
                    ) : (
                      <XCircle size={18} className="text-red-600" />
                    )}
                    <div>
                      <div className="font-medium text-gray-900">
                        {PARSER_NAMES[result.parser_name] || result.parser_name}
                      </div>
                      <div className="text-xs text-gray-600">
                        {PARSER_DESCRIPTIONS[result.parser_name] || 'Unknown parser type'}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-gray-900">
                      {Math.round(result.confidence_score * 100)}%
                    </div>
                    <div className="text-xs text-gray-500 flex items-center gap-1">
                      <Clock size={12} />
                      {result.extraction_time_ms}ms
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-gray-200">
                  <div>
                    <div className="text-xs text-gray-600">Items Found</div>
                    <div className="text-sm font-semibold text-gray-900">{result.items.length}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600">Grand Total</div>
                    <div className="text-sm font-semibold text-gray-900">
                      ${result.financials?.grand_total?.toLocaleString() || 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600">Status</div>
                    <div className={`text-sm font-semibold ${result.success ? 'text-green-700' : 'text-red-700'}`}>
                      {result.success ? 'Success' : 'Failed'}
                    </div>
                  </div>
                </div>

                {result.errors && result.errors.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-red-200">
                    <div className="text-xs text-red-600 font-medium mb-1">Errors:</div>
                    {result.errors.map((error, errIdx) => (
                      <div key={errIdx} className="text-xs text-red-700">
                        {error}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-blue-50 rounded-lg border border-blue-200 p-4">
          <h4 className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-2">
            <FileText size={16} />
            Best Parser Selected
          </h4>
          <p className="text-sm text-blue-800">
            <span className="font-medium">{PARSER_NAMES[confidence_breakdown.best_parser]}</span> was chosen as the
            primary source with a confidence score of{' '}
            <span className="font-bold">{Math.round(confidence_breakdown.best_parser_confidence * 100)}%</span>.
          </p>
          {confidence_breakdown.cross_model_agreement > 0.5 && (
            <p className="text-sm text-blue-700 mt-2">
              High agreement ({Math.round(confidence_breakdown.cross_model_agreement * 100)}%) across multiple parsers
              indicates reliable extraction.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
