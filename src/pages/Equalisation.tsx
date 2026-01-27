import { useState, useEffect, useCallback } from 'react';
import { Download, TrendingUp, Info } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTrade } from '../lib/tradeContext';
import { getModelRateProvider } from '../lib/modelRate/modelRateProvider';
import { compareAgainstModelHybrid } from '../lib/comparison/hybridCompareAgainstModel';
import { buildEqualisation } from '../lib/equalisation/buildEqualisation';
import type { ComparisonRow } from '../types/comparison.types';
import type { EqualisationMode, EqualisationResult } from '../types/equalisation.types';
import WorkflowNav from '../components/WorkflowNav';

interface EqualisationProps {
  projectId: string;
  onNavigateBack?: () => void;
  onNavigateNext?: () => void;
  preselectedQuoteIds?: string[];
}

export default function Equalisation({ projectId, onNavigateBack, onNavigateNext, preselectedQuoteIds = [] }: EqualisationProps) {
  const { currentTrade } = useTrade();
  const [comparisonData, setComparisonData] = useState<ComparisonRow[]>([]);
  const [equalisationResult, setEqualisationResult] = useState<EqualisationResult | null>(null);
  const [mode, setMode] = useState<EqualisationMode>('PEER_MEDIAN');
  const [loading, setLoading] = useState(true);
  const [modeLoaded, setModeLoaded] = useState(false);

  const handleNavigateNext = async () => {
    try {
      await supabase
        .from('projects')
        .update({
          equalisation_completed: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', projectId);

      window.dispatchEvent(new Event('refresh-dashboard'));
    } catch (error) {
      console.error('Failed to update equalisation workflow status:', error);
    }

    if (onNavigateNext) {
      onNavigateNext();
    }
  };

  const loadData = useCallback(async () => {
    setLoading(true);

    try {
      let quotesQuery = supabase
        .from('quotes')
        .select('id, supplier_name')
        .eq('project_id', projectId)
        .eq('trade', currentTrade)
        .eq('is_selected', true)
        .order('supplier_name');

      // If preselected quotes are provided, filter to only those
      if (preselectedQuoteIds.length > 0) {
        console.log('📊 Equalisation: Loading preselected quotes:', preselectedQuoteIds);
        quotesQuery = quotesQuery.in('id', preselectedQuoteIds);
      }

      const { data: quotesData } = await quotesQuery;

      if (!quotesData || quotesData.length === 0) {
        setLoading(false);
        return;
      }

      const quoteIds = quotesData.map(q => q.id);

      const { data: itemsData } = await supabase
        .from('quote_items')
        .select('*')
        .in('quote_id', quoteIds);

      if (!itemsData) {
        setLoading(false);
        return;
      }

      const normalisedLines = itemsData.map(item => {
        const quote = quotesData.find(q => q.id === item.quote_id);
        return {
          quoteId: item.quote_id,
          quoteItemId: item.id,
          supplier: quote?.supplier_name || 'Unknown',
          originalDescription: item.description,
          quantity: item.quantity || 1,
          rate: item.unit_price,
          total: item.total_price,
          section: item.section,
          service: item.service,
          subclass: item.subclass,
          frr: item.frr,
          size: item.size,
        };
      });

      const mappings = itemsData.map(item => ({
        quoteItemId: item.id,
        systemId: item.system_id,
        systemLabel: item.system_label,
      }));

      const provider = getModelRateProvider(projectId);
      await provider.loadSettings();

      const comparisons = await compareAgainstModelHybrid(
        normalisedLines,
        mappings,
        (criteria) => provider.getModelRate(criteria)
      );

      setComparisonData(comparisons);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId, preselectedQuoteIds]);

  const calculateEqualisation = useCallback(() => {
    if (comparisonData.length === 0) {
      setEqualisationResult(null);
      return;
    }

    const result = buildEqualisation(comparisonData, mode);

    const modelRatesAvailable = comparisonData.filter(row => row.modelRate !== null).length;
    const totalRows = comparisonData.length;

    console.log('Equalisation calculated:', {
      mode,
      totalEqualisations: result.totalEqualisations,
      logEntries: result.equalisationLog.length,
      suppliers: result.supplierTotals.length,
      comparisonRowsCount: comparisonData.length,
      modelRatesAvailable,
      modelRatesCoverage: `${modelRatesAvailable}/${totalRows} (${((modelRatesAvailable/totalRows)*100).toFixed(1)}%)`,
      sampleComparisonRows: comparisonData.slice(0, 3).map(row => ({
        supplier: row.supplier,
        system: row.systemLabel,
        unitRate: row.unitRate,
        modelRate: row.modelRate,
        hasModelRate: row.modelRate !== null
      }))
    });
    setEqualisationResult(result);
  }, [comparisonData, mode]);

  useEffect(() => {
    loadSavedMode();
  }, [projectId]);

  useEffect(() => {
    if (modeLoaded) {
      loadData();
    }
  }, [loadData, modeLoaded]);

  useEffect(() => {
    calculateEqualisation();
  }, [calculateEqualisation]);

  const loadSavedMode = async () => {
    try {
      const { data } = await supabase
        .from('project_settings')
        .select('settings')
        .eq('project_id', projectId)
        .maybeSingle();

      if (data?.settings?.equalisation_mode) {
        setMode(data.settings.equalisation_mode as EqualisationMode);
      }
    } catch (error) {
      console.error('Error loading equalisation mode:', error);
    } finally {
      setModeLoaded(true);
    }
  };

  const handleModeChange = async (newMode: EqualisationMode) => {
    setMode(newMode);

    try {
      const now = new Date().toISOString();

      const { data: existing } = await supabase
        .from('project_settings')
        .select('settings')
        .eq('project_id', projectId)
        .maybeSingle();

      const currentSettings = existing?.settings || {};

      const { error } = await supabase
        .from('project_settings')
        .upsert({
          project_id: projectId,
          settings: {
            ...currentSettings,
            equalisation_mode: newMode,
            last_equalisation_run: now,
          },
          updated_at: now,
        }, {
          onConflict: 'project_id'
        });

      if (error) {
        console.error('Error saving equalisation mode:', error);
      }
    } catch (error) {
      console.error('Error persisting equalisation mode:', error);
    }
  };

  const exportEqualisationLog = () => {
    try {
      console.log('Export Equalisation Log clicked', {
        hasResult: !!equalisationResult,
        logCount: equalisationResult?.equalisationLog.length || 0,
        mode
      });

      if (!equalisationResult) {
        alert('No equalisation result available. Please run the equalisation analysis first.');
        return;
      }

      if (equalisationResult.equalisationLog.length === 0) {
        alert('No equalisation log entries to export.');
        return;
      }

      const headers = [
        'Supplier',
        'System ID',
        'System Label',
        'Reason',
        'Source',
        'Rate Used',
        'Quantity',
        'Total'
      ];

      const rows = equalisationResult.equalisationLog.map(entry => [
        entry.supplierName,
        entry.systemId,
        entry.systemLabel,
        entry.reason,
        entry.source,
        entry.rateUsed.toFixed(2),
        entry.quantity.toString(),
        entry.total.toFixed(2),
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `equalisation-log-${mode.toLowerCase()}-${projectId}-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      console.log('Export completed successfully', { rowCount: rows.length });
    } catch (error) {
      console.error('Error exporting equalisation log:', error);
      alert('Failed to export equalisation log. Check console for details.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-center h-64">
            <div className="text-slate-400">Loading equalisation analysis...</div>
          </div>
        </div>
      </div>
    );
  }

  if (comparisonData.length === 0) {
    return (
      <div className="min-h-screen bg-slate-900">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <h1 className="text-2xl font-bold text-slate-50 mb-6">Equalisation</h1>
          <div className="bg-slate-800/60 rounded-lg shadow-sm border border-slate-700 p-12 text-center">
            <p className="text-slate-300 text-lg">No data available.</p>
            <p className="text-slate-400 mt-2">Import quotes and configure model rate settings to view equalisation.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <div className="max-w-7xl mx-auto px-6 py-6">
        <h1 className="text-2xl font-bold text-slate-50 mb-2">Equalisation</h1>
        <p className="text-base text-slate-400 mb-6">Balance scope gaps across all suppliers for fair comparison.</p>

        <div className="space-y-6">
          <div className="bg-slate-800/60 rounded-lg shadow-sm border border-slate-700 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-slate-50">Equalisation Analysis</h2>
          <div className="relative group">
            <button
              onClick={exportEqualisationLog}
              disabled={!equalisationResult || equalisationResult.equalisationLog.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed"
              title={!equalisationResult || equalisationResult.equalisationLog.length === 0
                ? 'No equalisation entries to export. This happens when all suppliers quote all systems.'
                : 'Export equalisation log to CSV'}
            >
              <Download size={18} />
              Export Log
              {equalisationResult && equalisationResult.equalisationLog.length === 0 && (
                <span className="ml-1 text-xs">(0 entries)</span>
              )}
            </button>
            {equalisationResult && equalisationResult.equalisationLog.length === 0 && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-amber-900/90 border border-amber-700 rounded-lg p-3 text-xs text-amber-100 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                <strong>No scope gaps to equalise.</strong><br/>
                All suppliers have quoted all systems. The export log only includes items that were equalised (filled in) using {mode === 'MODEL' ? 'model rates' : 'peer median rates'}.
              </div>
            )}
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-300 mb-3">
            Equalisation Mode
          </label>
          <div className="flex gap-4">
            <label className={`flex items-center gap-3 px-4 py-3 border-2 rounded-lg cursor-pointer transition-all ${
              mode === 'MODEL' ? 'border-blue-500 bg-blue-500/10' : 'border-slate-600 bg-slate-700/30 hover:bg-slate-700/50'
            }`}>
              <input
                type="radio"
                name="equalisationMode"
                value="MODEL"
                checked={mode === 'MODEL'}
                onChange={(e) => handleModeChange(e.target.value as EqualisationMode)}
                className="w-4 h-4 text-blue-600"
              />
              <div>
                <div className="font-medium text-slate-100">Model Rate</div>
                <div className="text-xs text-slate-400">Use model rates for missing items</div>
              </div>
            </label>
            <label className={`flex items-center gap-3 px-4 py-3 border-2 rounded-lg cursor-pointer transition-all ${
              mode === 'PEER_MEDIAN' ? 'border-blue-500 bg-blue-500/10' : 'border-slate-600 bg-slate-700/30 hover:bg-slate-700/50'
            }`}>
              <input
                type="radio"
                name="equalisationMode"
                value="PEER_MEDIAN"
                checked={mode === 'PEER_MEDIAN'}
                onChange={(e) => handleModeChange(e.target.value as EqualisationMode)}
                className="w-4 h-4 text-blue-600"
              />
              <div>
                <div className="font-medium text-slate-100">Peer Median</div>
                <div className="text-xs text-slate-400">Use median of other suppliers' rates</div>
              </div>
            </label>
          </div>
        </div>

        <div className="flex items-start gap-3 p-4 bg-blue-900/20 rounded-lg border border-blue-700/50 mb-6">
          <Info className="text-blue-400 flex-shrink-0 mt-0.5" size={20} />
          <div className="text-sm text-blue-100">
            <p className="font-medium mb-1">About Equalisation</p>
            <p className="text-blue-200">
              Equalisation fills in missing scope items for each supplier to enable fair comparison.
              <strong> MODEL</strong> mode uses your configured model rates, while
              <strong> PEER_MEDIAN</strong> uses the median rate from other suppliers for the same system.
            </p>
          </div>
        </div>

        {comparisonData.length > 0 && (
          <div className="p-4 bg-slate-700/30 rounded-lg border border-slate-600">
            <h4 className="font-medium text-slate-100 mb-2 text-sm">Data Status</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div>
                <span className="text-slate-400">Total Items:</span>
                <span className="ml-2 font-semibold text-slate-100">{comparisonData.length}</span>
              </div>
              <div>
                <span className="text-slate-400">Model Rates Available:</span>
                <span className="ml-2 font-semibold text-slate-100">
                  {comparisonData.filter(row => row.modelRate !== null).length}
                </span>
                <span className="ml-1 text-xs text-slate-500">
                  ({((comparisonData.filter(row => row.modelRate !== null).length / comparisonData.length) * 100).toFixed(0)}%)
                </span>
              </div>
              <div>
                <span className="text-slate-400">Systems:</span>
                <span className="ml-2 font-semibold text-slate-100">
                  {new Set(comparisonData.map(row => row.systemLabel)).size}
                </span>
              </div>
            </div>
            {comparisonData.filter(row => row.modelRate !== null).length === 0 && mode === 'MODEL' && (
              <div className="mt-3 p-3 bg-amber-900/30 border border-amber-700/50 rounded text-sm text-amber-200">
                <strong>Warning:</strong> No model rates are configured. MODEL mode equalisation will not work.
                Please configure model rates in Settings or use PEER_MEDIAN mode instead.
              </div>
            )}
          </div>
        )}
      </div>

      {equalisationResult && (
        <>
          <div className="bg-slate-800/60 rounded-lg shadow-sm border border-slate-700 p-6">
            <div className="flex items-center gap-2 mb-6">
              <TrendingUp size={20} className="text-slate-300" />
              <h3 className="text-lg font-semibold text-slate-50">Supplier Totals Comparison</h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-900/50">
                    <th className="px-4 py-3 text-left font-medium text-slate-300 border border-slate-700">
                      Supplier
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-slate-300 border border-slate-700">
                      Original Total
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-slate-300 border border-slate-700">
                      Equalised Total
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-slate-300 border border-slate-700">
                      Adjustment
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-slate-300 border border-slate-700">
                      Adjustment %
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-slate-300 border border-slate-700">
                      Items Added
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {equalisationResult.supplierTotals.map((supplier, idx) => (
                    <tr key={idx} className="hover:bg-slate-700/30">
                      <td className="px-4 py-3 font-medium text-slate-100 border border-slate-700">
                        {supplier.supplierName}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-100 border border-slate-700">
                        ${supplier.originalTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-100 border border-slate-700">
                        ${supplier.equalisedTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className={`px-4 py-3 text-right font-medium border border-slate-700 ${
                        supplier.adjustment > 0 ? 'text-red-400' : supplier.adjustment < 0 ? 'text-green-400' : 'text-slate-400'
                      }`}>
                        {supplier.adjustment >= 0 ? '+' : ''}${supplier.adjustment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className={`px-4 py-3 text-right font-medium border border-slate-700 ${
                        supplier.adjustmentPct > 0 ? 'text-red-400' : supplier.adjustmentPct < 0 ? 'text-green-400' : 'text-slate-400'
                      }`}>
                        {supplier.adjustmentPct >= 0 ? '+' : ''}{supplier.adjustmentPct.toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 text-right text-slate-100 border border-slate-700">
                        {supplier.itemsAdded}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {equalisationResult.equalisationLog.length > 0 && (
            <div className="bg-slate-800/60 rounded-lg shadow-sm border border-slate-700 p-6">
              <h3 className="text-lg font-semibold text-slate-50 mb-4">
                Equalisation Audit Log
                <span className="ml-2 text-sm font-normal text-slate-400">
                  ({equalisationResult.equalisationLog.length} entries)
                </span>
              </h3>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-900/50">
                      <th className="px-3 py-2 text-left font-medium text-slate-300 border border-slate-700">
                        Supplier
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-slate-300 border border-slate-700">
                        System
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-slate-300 border border-slate-700">
                        Reason
                      </th>
                      <th className="px-3 py-2 text-center font-medium text-slate-300 border border-slate-700">
                        Source
                      </th>
                      <th className="px-3 py-2 text-right font-medium text-slate-300 border border-slate-700">
                        Rate Used
                      </th>
                      <th className="px-3 py-2 text-right font-medium text-slate-300 border border-slate-700">
                        Quantity
                      </th>
                      <th className="px-3 py-2 text-right font-medium text-slate-300 border border-slate-700">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {equalisationResult.equalisationLog.map((entry, idx) => (
                      <tr key={idx} className="hover:bg-slate-700/30">
                        <td className="px-3 py-2 text-slate-100 border border-slate-700">
                          {entry.supplierName}
                        </td>
                        <td className="px-3 py-2 border border-slate-700">
                          <div className="flex flex-col">
                            <span className="font-medium text-slate-100">{entry.systemLabel}</span>
                            {entry.systemId !== entry.systemLabel && (
                              <span className="text-xs text-slate-400">{entry.systemId}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-slate-300 border border-slate-700">
                          {entry.reason}
                        </td>
                        <td className="px-3 py-2 text-center border border-slate-700">
                          <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                            entry.source === 'MODEL'
                              ? 'bg-blue-500/20 text-blue-300'
                              : 'bg-purple-500/20 text-purple-300'
                          }`}>
                            {entry.source}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right text-slate-100 border border-slate-700">
                          ${entry.rateUsed.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-100 border border-slate-700">
                          {entry.quantity}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-slate-100 border border-slate-700">
                          ${entry.total.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {equalisationResult.equalisationLog.length === 0 && (
            <div className="bg-slate-800/60 rounded-lg shadow-sm border border-slate-700 p-12 text-center">
              <p className="text-slate-300">No equalisation adjustments needed.</p>
              <p className="text-slate-400 mt-2">All suppliers have quoted all systems.</p>
            </div>
          )}
        </>
      )}

      <WorkflowNav
        currentStep={5}
        totalSteps={7}
        onBack={onNavigateBack}
        onNext={handleNavigateNext}
        backLabel="Back: Scope Matrix"
        nextLabel="Next: Award Reports"
      />
        </div>
      </div>
    </div>
  );
}
