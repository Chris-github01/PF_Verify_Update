import { AlertCircle, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import type { ExtractionResult } from '../types/extraction.types';

interface ExtractionConfidencePanelProps {
  extraction: ExtractionResult;
  onFieldEdit?: (field: string, value: any) => void;
}

export function ExtractionConfidencePanel({ extraction, onFieldEdit }: ExtractionConfidencePanelProps) {
  const { confidence_breakdown, extraction_metadata } = extraction;
  const finalQuote = extraction.consensus || extraction.primary;
  const validation = finalQuote?.validation;

  if (!validation) return null;

  const getConfidenceColor = (score: number) => {
    if (score >= 0.9) return 'text-green-600 bg-green-50';
    if (score >= 0.7) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const getConfidenceLabel = (score: number) => {
    if (score >= 0.9) return 'High Confidence';
    if (score >= 0.7) return 'Medium Confidence';
    return 'Low Confidence';
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Extraction Confidence</h3>
          <div className={`px-3 py-1 rounded-full text-sm font-medium ${getConfidenceColor(confidence_breakdown.overall)}`}>
            {getConfidenceLabel(confidence_breakdown.overall)} ({Math.round(confidence_breakdown.overall * 100)}%)
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <ConfidenceMetric
            label="Metadata"
            score={confidence_breakdown.metadata}
          />
          <ConfidenceMetric
            label="Line Items"
            score={confidence_breakdown.line_items}
          />
          <ConfidenceMetric
            label="Financials"
            score={confidence_breakdown.financials}
          />
          <ConfidenceMetric
            label="Cross-Model Agreement"
            score={confidence_breakdown.cross_model_agreement}
          />
          <ConfidenceMetric
            label="Arithmetic Consistency"
            score={confidence_breakdown.arithmetic_consistency}
          />
          <ConfidenceMetric
            label="Format Validity"
            score={confidence_breakdown.format_validity}
          />
        </div>

        <div className="flex items-center gap-2 text-sm text-gray-600 border-t pt-4">
          <Info className="w-4 h-4" />
          <span>
            Extraction method: <strong>{extraction_metadata.extraction_method}</strong>
            {' '}using {extraction_metadata.models_used.join(', ')}
            {' '}({extraction_metadata.processing_time_ms}ms)
          </span>
        </div>
      </div>

      {validation.errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <h4 className="font-semibold text-red-900">Errors Detected ({validation.errors.length})</h4>
          </div>
          <div className="space-y-2">
            {validation.errors.map((error, idx) => (
              <div key={idx} className="flex items-start gap-2 text-sm">
                <div className="flex-1">
                  <div className="text-red-900 font-medium">{error.field}</div>
                  <div className="text-red-700">{error.message}</div>
                  {error.expected !== undefined && (
                    <div className="text-red-600 text-xs mt-1">
                      Expected: {error.expected}, Got: {error.actual}
                    </div>
                  )}
                </div>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  error.severity === 'critical' ? 'bg-red-600 text-white' :
                  error.severity === 'high' ? 'bg-orange-600 text-white' :
                  'bg-yellow-600 text-white'
                }`}>
                  {error.severity}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {validation.warnings.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600" />
            <h4 className="font-semibold text-yellow-900">Warnings ({validation.warnings.length})</h4>
          </div>
          <div className="space-y-2">
            {validation.warnings.map((warning, idx) => (
              <div key={idx} className="text-sm">
                <div className="text-yellow-900 font-medium">{warning.field}</div>
                <div className="text-yellow-700">{warning.message}</div>
                {warning.suggestion && (
                  <div className="text-yellow-600 text-xs mt-1">
                    Suggestion: {warning.suggestion}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {validation.checks.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-5 h-5 text-blue-600" />
            <h4 className="font-semibold text-blue-900">Validation Checks</h4>
          </div>
          <div className="space-y-1">
            {validation.checks.map((check, idx) => (
              <div key={idx} className="flex items-center gap-2 text-sm">
                {check.passed ? (
                  <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                )}
                <span className={check.passed ? 'text-green-900' : 'text-red-900'}>
                  {check.message}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {extraction.secondary && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Info className="w-5 h-5 text-purple-600" />
            <h4 className="font-semibold text-purple-900">Cross-Model Verification</h4>
          </div>
          <p className="text-sm text-purple-700">
            This quote was verified using multiple AI models. The consensus extraction combines the best results from both models for maximum accuracy.
          </p>
        </div>
      )}
    </div>
  );
}

interface ConfidenceMetricProps {
  label: string;
  score: number;
}

function ConfidenceMetric({ label, score }: ConfidenceMetricProps) {
  const percentage = Math.round(score * 100);
  const color = score >= 0.9 ? 'bg-green-500' : score >= 0.7 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-700">{label}</span>
        <span className="text-xs font-semibold text-gray-900">{percentage}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className={`h-2 rounded-full ${color} transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
