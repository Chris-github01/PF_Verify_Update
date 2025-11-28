import { useState } from 'react';
import { Edit2, Check, X, AlertCircle } from 'lucide-react';
import type { LineItem, SimilarityMatch } from '../types/extraction.types';

interface LineItemReviewTableProps {
  lineItems: LineItem[];
  similarityMatches?: Map<number, SimilarityMatch[]>;
  onItemUpdate?: (index: number, updates: Partial<LineItem>) => void;
  onAcceptSuggestion?: (index: number, match: SimilarityMatch) => void;
}

export function LineItemReviewTable({
  lineItems,
  similarityMatches,
  onItemUpdate,
  onAcceptSuggestion,
}: LineItemReviewTableProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Partial<LineItem>>({});

  const startEdit = (index: number, item: LineItem) => {
    setEditingIndex(index);
    setEditValues(item);
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditValues({});
  };

  const saveEdit = (index: number) => {
    if (onItemUpdate) {
      onItemUpdate(index, editValues);
    }
    setEditingIndex(null);
    setEditValues({});
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return 'bg-green-100 text-green-800';
    if (confidence >= 0.7) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                #
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Description
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Qty
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Unit
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Rate
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Total
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Confidence
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {lineItems.map((item, index) => {
              const isEditing = editingIndex === index;
              const matches = similarityMatches?.get(index) || [];
              const calculated = (item.quantity * item.unit_rate).toFixed(2);
              const hasArithmeticError = Math.abs(parseFloat(calculated) - item.line_total) > 0.02;

              return (
                <tr key={index} className={hasArithmeticError ? 'bg-red-50' : ''}>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                    {index + 1}
                  </td>
                  <td className="px-3 py-4 text-sm text-gray-900">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editValues.description || ''}
                        onChange={(e) => setEditValues({ ...editValues, description: e.target.value })}
                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                      />
                    ) : (
                      <div>
                        <div>{item.description}</div>
                        {matches.length > 0 && (
                          <div className="mt-1">
                            <SimilarityMatchBadge
                              match={matches[0]}
                              onAccept={() => onAcceptSuggestion?.(index, matches[0])}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.01"
                        value={editValues.quantity || 0}
                        onChange={(e) => setEditValues({ ...editValues, quantity: parseFloat(e.target.value) })}
                        className="w-20 border border-gray-300 rounded px-2 py-1 text-sm"
                      />
                    ) : (
                      item.quantity
                    )}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editValues.unit || ''}
                        onChange={(e) => setEditValues({ ...editValues, unit: e.target.value })}
                        className="w-16 border border-gray-300 rounded px-2 py-1 text-sm"
                      />
                    ) : (
                      item.unit
                    )}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.01"
                        value={editValues.unit_rate || 0}
                        onChange={(e) => setEditValues({ ...editValues, unit_rate: parseFloat(e.target.value) })}
                        className="w-24 border border-gray-300 rounded px-2 py-1 text-sm"
                      />
                    ) : (
                      `$${item.unit_rate.toFixed(2)}`
                    )}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm">
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.01"
                        value={editValues.line_total || 0}
                        onChange={(e) => setEditValues({ ...editValues, line_total: parseFloat(e.target.value) })}
                        className="w-24 border border-gray-300 rounded px-2 py-1 text-sm"
                      />
                    ) : (
                      <div>
                        <div className={hasArithmeticError ? 'text-red-600 font-medium' : 'text-gray-900'}>
                          ${item.line_total.toFixed(2)}
                        </div>
                        {hasArithmeticError && (
                          <div className="text-xs text-red-600 mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            Expected: ${calculated}
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getConfidenceColor(item.confidence)}`}>
                      {Math.round(item.confidence * 100)}%
                    </span>
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm">
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => saveEdit(index)}
                          className="p-1 text-green-600 hover:bg-green-50 rounded"
                          title="Save"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="p-1 text-red-600 hover:bg-red-50 rounded"
                          title="Cancel"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEdit(index, item)}
                        className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium text-gray-700">Total Items:</span>
          <span className="text-sm font-semibold text-gray-900">{lineItems.length}</span>
        </div>
        <div className="flex justify-between items-center mt-2">
          <span className="text-sm font-medium text-gray-700">Sum of Line Totals:</span>
          <span className="text-sm font-semibold text-gray-900">
            ${lineItems.reduce((sum, item) => sum + item.line_total, 0).toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}

interface SimilarityMatchBadgeProps {
  match: SimilarityMatch;
  onAccept?: () => void;
}

function SimilarityMatchBadge({ match, onAccept }: SimilarityMatchBadgeProps) {
  return (
    <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 rounded px-2 py-1 text-xs">
      <div className="flex-1">
        <div className="font-medium text-blue-900">Similar to: {match.description}</div>
        <div className="text-blue-700">
          {match.similarity_score && `${Math.round(match.similarity_score * 100)}% match`}
          {match.suggested_system_code && ` • ${match.suggested_system_code}`}
          {match.suggested_unit && ` • ${match.suggested_unit}`}
        </div>
      </div>
      {onAccept && (
        <button
          onClick={onAccept}
          className="px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs font-medium"
        >
          Apply
        </button>
      )}
    </div>
  );
}
