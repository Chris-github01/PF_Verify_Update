import { useState, useEffect } from 'react';
import { ArrowRight, TrendingUp, TrendingDown, Plus, Minus, AlertCircle } from 'lucide-react';
import type { QuoteRevisionDiff, RevisionDiffItem } from '../types/revision.types';

interface RevisionDiffViewProps {
  diff: QuoteRevisionDiff;
  showUnchanged?: boolean;
}

export function RevisionDiffView({ diff, showUnchanged = false }: RevisionDiffViewProps) {
  const [filteredItems, setFilteredItems] = useState<RevisionDiffItem[]>([]);
  const [filterType, setFilterType] = useState<'all' | 'changed' | 'added' | 'removed' | 'modified'>('changed');

  useEffect(() => {
    let items = diff.diff_items;

    if (filterType === 'changed') {
      items = items.filter(item => item.change_type !== 'unchanged');
    } else if (filterType !== 'all') {
      items = items.filter(item => item.change_type === filterType);
    }

    if (!showUnchanged && filterType === 'all') {
      items = items.filter(item => item.change_type !== 'unchanged');
    }

    setFilteredItems(items);
  }, [diff, filterType, showUnchanged]);

  const formatCurrency = (value?: number) => {
    if (value === undefined || value === null) return '-';
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatPercent = (value?: number) => {
    if (value === undefined || value === null) return '';
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
  };

  const getChangeColor = (changeType: string) => {
    switch (changeType) {
      case 'added':
        return 'bg-green-50 border-green-200';
      case 'removed':
        return 'bg-red-50 border-red-200';
      case 'modified':
        return 'bg-yellow-50 border-yellow-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  const getChangeIcon = (changeType: string) => {
    switch (changeType) {
      case 'added':
        return <Plus className="w-4 h-4 text-green-600" />;
      case 'removed':
        return <Minus className="w-4 h-4 text-red-600" />;
      case 'modified':
        return <ArrowRight className="w-4 h-4 text-yellow-600" />;
      default:
        return null;
    }
  };

  const isPriceIncrease = diff.total_price_change > 0;

  return (
    <div className="space-y-6">
      {/* Summary Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {diff.supplier_name} - Revision Comparison
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              v{diff.original_revision_number} → v{diff.new_revision_number}
            </p>
          </div>

          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
            isPriceIncrease ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
          }`}>
            {isPriceIncrease ? (
              <TrendingUp className="w-5 h-5" />
            ) : (
              <TrendingDown className="w-5 h-5" />
            )}
            <div>
              <div className="font-semibold">
                {formatCurrency(Math.abs(diff.total_price_change))}
              </div>
              <div className="text-xs">
                {formatPercent(diff.total_price_change_percent)}
              </div>
            </div>
          </div>
        </div>

        {/* Change Statistics */}
        <div className="grid grid-cols-4 gap-4">
          <div className="text-center p-3 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-700">{diff.items_added_count}</div>
            <div className="text-xs text-green-600 font-medium">Added</div>
          </div>
          <div className="text-center p-3 bg-red-50 rounded-lg">
            <div className="text-2xl font-bold text-red-700">{diff.items_removed_count}</div>
            <div className="text-xs text-red-600 font-medium">Removed</div>
          </div>
          <div className="text-center p-3 bg-yellow-50 rounded-lg">
            <div className="text-2xl font-bold text-yellow-700">{diff.items_modified_count}</div>
            <div className="text-xs text-yellow-600 font-medium">Modified</div>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-gray-700">{diff.items_unchanged_count}</div>
            <div className="text-xs text-gray-600 font-medium">Unchanged</div>
          </div>
        </div>
      </div>

      {/* Filter Buttons */}
      <div className="flex gap-2 flex-wrap">
        {[
          { value: 'changed', label: 'Changes Only' },
          { value: 'all', label: 'All Items' },
          { value: 'added', label: 'Added' },
          { value: 'modified', label: 'Modified' },
          { value: 'removed', label: 'Removed' }
        ].map((filter) => (
          <button
            key={filter.value}
            onClick={() => setFilterType(filter.value as any)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filterType === filter.value
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Diff Items Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {filteredItems.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <AlertCircle className="w-12 h-12 mx-auto mb-3 text-gray-400" />
            <p>No items match the selected filter</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Change
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Original Qty
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase tracking-wider">
                    New Qty
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Original Rate
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase tracking-wider">
                    New Rate
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Original Total
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase tracking-wider">
                    New Total
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Change
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredItems.map((item, index) => (
                  <tr
                    key={index}
                    className={`${getChangeColor(item.change_type)} transition-colors hover:opacity-75`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {getChangeIcon(item.change_type)}
                        <span className="text-xs font-medium capitalize">
                          {item.change_type}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-900">
                        {item.description}
                      </div>
                      {item.original_specifications !== item.new_specifications && (
                        <div className="text-xs text-gray-500 mt-1">
                          Spec changed
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-700">
                      {item.original_quantity?.toFixed(2) || '-'}
                      {item.original_unit && ` ${item.original_unit}`}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-700">
                      {item.new_quantity?.toFixed(2) || '-'}
                      {item.new_unit && ` ${item.new_unit}`}
                      {item.quantity_change !== undefined && item.quantity_change !== 0 && (
                        <div className={`text-xs ${item.quantity_change > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {formatPercent(item.quantity_change_percent)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-700">
                      {formatCurrency(item.original_rate)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-700">
                      {formatCurrency(item.new_rate)}
                      {item.rate_change !== undefined && item.rate_change !== 0 && (
                        <div className={`text-xs ${item.rate_change > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {formatPercent(item.rate_change_percent)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-700 font-medium">
                      {formatCurrency(item.original_total)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-700 font-medium">
                      {formatCurrency(item.new_total)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {item.total_change !== undefined && item.total_change !== 0 ? (
                        <div>
                          <div className={`text-sm font-semibold ${
                            item.total_change > 0 ? 'text-red-600' : 'text-green-600'
                          }`}>
                            {formatCurrency(Math.abs(item.total_change))}
                          </div>
                          <div className={`text-xs ${
                            item.total_change > 0 ? 'text-red-600' : 'text-green-600'
                          }`}>
                            {formatPercent(item.total_change_percent)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
