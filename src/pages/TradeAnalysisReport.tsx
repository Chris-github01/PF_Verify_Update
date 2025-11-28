import { useState, useEffect, useMemo, useCallback } from 'react';
import { Filter, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { buildComparisonRows, buildMultiSupplierComparison, calculateSectionStats, calculateTotalsSummary, getVarianceColor } from '../lib/tradeAnalysis/varianceCalculator';
import TradeAnalysisExports from '../components/TradeAnalysisExports';
import TradeAnalysisPanel from '../components/TradeAnalysisPanel';
import type {
  SupplierOption,
  SupplierQuoteItem,
  ComparisonRow,
  SectionStats,
  TotalsSummary,
  TradeAnalysisFilters,
} from '../types/tradeAnalysis.types';

interface TradeAnalysisReportProps {
  projectId: string;
  onNavigateBack?: () => void;
  onNavigateNext?: () => void;
}

const AVAILABLE_SECTIONS = [
  'General',
  'Electrical Services',
  'Fire Protection Services',
  'Hydraulics Services',
  'Mechanical Services',
  'Structural Penetrations',
  'Passive Fire (General)',
  'Optional Extras',
];

export default function TradeAnalysisReport({ projectId, onNavigateBack, onNavigateNext }: TradeAnalysisReportProps) {
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [filters, setFilters] = useState<TradeAnalysisFilters>({
    supplier1Id: null,
    supplier2Id: null,
    supplier3Id: null,
    supplier4Id: null,
    supplier5Id: null,
    sections: AVAILABLE_SECTIONS,
    unitTolerancePercent: 10,
    showOnlyVariances: false,
  });

  const [supplier1Items, setSupplier1Items] = useState<SupplierQuoteItem[]>([]);
  const [supplier2Items, setSupplier2Items] = useState<SupplierQuoteItem[]>([]);
  const [supplier3Items, setSupplier3Items] = useState<SupplierQuoteItem[]>([]);
  const [supplier4Items, setSupplier4Items] = useState<SupplierQuoteItem[]>([]);
  const [supplier5Items, setSupplier5Items] = useState<SupplierQuoteItem[]>([]);
  const [comparisonRows, setComparisonRows] = useState<ComparisonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [showSectionFilter, setShowSectionFilter] = useState(false);
  const [diagnosticHint, setDiagnosticHint] = useState<string>('');

  useEffect(() => {
    loadSuppliers();
  }, [projectId]);

  useEffect(() => {
    if (filters.supplier1Id) {
      loadSupplierItems(filters.supplier1Id, setSupplier1Items);
    } else {
      setSupplier1Items([]);
    }
  }, [filters.supplier1Id]);

  useEffect(() => {
    if (filters.supplier2Id) {
      loadSupplierItems(filters.supplier2Id, setSupplier2Items);
    } else {
      setSupplier2Items([]);
    }
  }, [filters.supplier2Id]);

  useEffect(() => {
    if (filters.supplier3Id) {
      loadSupplierItems(filters.supplier3Id, setSupplier3Items);
    } else {
      setSupplier3Items([]);
    }
  }, [filters.supplier3Id]);

  useEffect(() => {
    if (filters.supplier4Id) {
      loadSupplierItems(filters.supplier4Id, setSupplier4Items);
    } else {
      setSupplier4Items([]);
    }
  }, [filters.supplier4Id]);

  useEffect(() => {
    if (filters.supplier5Id) {
      loadSupplierItems(filters.supplier5Id, setSupplier5Items);
    } else {
      setSupplier5Items([]);
    }
  }, [filters.supplier5Id]);

  const loadSuppliers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('quotes')
        .select('id, supplier_name, total_amount, items_count, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      if (data && data.length > 0) {
        const supplierOptions: SupplierOption[] = data.map(q => ({
          id: q.id,
          name: q.supplier_name,
          totalAmount: q.total_amount || 0,
          itemsCount: q.items_count || 0,
          importedAt: q.created_at,
        }));

        setSuppliers(supplierOptions);

        if (!filters.supplier1Id && supplierOptions.length > 0) {
          setFilters(prev => ({ ...prev, supplier1Id: supplierOptions[0].id }));
        }
        if (!filters.supplier2Id && supplierOptions.length > 1) {
          setFilters(prev => ({ ...prev, supplier2Id: supplierOptions[1].id }));
        }
        if (!filters.supplier3Id && supplierOptions.length > 2) {
          setFilters(prev => ({ ...prev, supplier3Id: supplierOptions[2].id }));
        }
        if (!filters.supplier4Id && supplierOptions.length > 3) {
          setFilters(prev => ({ ...prev, supplier4Id: supplierOptions[3].id }));
        }
        if (!filters.supplier5Id && supplierOptions.length > 4) {
          setFilters(prev => ({ ...prev, supplier5Id: supplierOptions[4].id }));
        }
      }
    } catch (error) {
      console.error('Error loading suppliers:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSupplierItems = async (quoteId: string, setter: React.Dispatch<React.SetStateAction<SupplierQuoteItem[]>>) => {
    try {
      const { data: items, error } = await supabase
        .from('quote_items')
        .select('*')
        .eq('quote_id', quoteId);

      if (error) throw error;

      if (items) {
        const quote = suppliers.find(s => s.id === quoteId);
        const supplierItems: SupplierQuoteItem[] = items.map(item => ({
          id: item.id,
          quoteId: item.quote_id,
          supplierName: quote?.name || 'Unknown',
          section: item.section || item.scope_category || 'General',
          service: item.service || 'General',
          description: item.description,
          size: item.size,
          substrate: item.substrate_frr,
          frr: item.substrate_frr,
          materials: item.materials,
          qty: item.quantity || 0,
          unit: item.unit || 'No.',
          rate: item.unit_price || 0,
          total: item.total_price || 0,
          reference: item.reference,
        }));

        setter(supplierItems);
      }
    } catch (error) {
      console.error('Error loading supplier items:', error);
    }
  };

  useEffect(() => {
    const buildRows = async () => {
      const activeSuppliers = [
        supplier1Items,
        supplier2Items,
        supplier3Items,
        supplier4Items,
        supplier5Items
      ].filter(items => items.length > 0);

      console.log('[TradeAnalysis] Building comparison rows', {
        supplier1ItemsCount: supplier1Items.length,
        supplier2ItemsCount: supplier2Items.length,
        supplier3ItemsCount: supplier3Items.length,
        supplier4ItemsCount: supplier4Items.length,
        supplier5ItemsCount: supplier5Items.length,
        activeSuppliers: activeSuppliers.length,
      });

      if (activeSuppliers.length < 2) {
        setDiagnosticHint('Please select at least 2 datasets with items to compare.');
        setComparisonRows([]);
        return;
      }

      const supplierNames = [
        suppliers.find(s => s.id === filters.supplier1Id)?.name,
        suppliers.find(s => s.id === filters.supplier2Id)?.name,
        suppliers.find(s => s.id === filters.supplier3Id)?.name,
        suppliers.find(s => s.id === filters.supplier4Id)?.name,
        suppliers.find(s => s.id === filters.supplier5Id)?.name,
      ];

      const supplierItemsArray = [
        supplier1Items,
        supplier2Items,
        supplier3Items,
        supplier4Items,
        supplier5Items
      ];

      const rows = await buildMultiSupplierComparison(supplierItemsArray, supplierNames);
      console.log('[TradeAnalysis] Built comparison rows:', rows.length);

      if (rows.length === 0) {
        setDiagnosticHint(
          `${activeSuppliers.length} datasets selected with items, but no matches found. Check item codes, descriptions, and units for consistency.`
        );
      } else {
        setDiagnosticHint('');

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
              trade_analysis_completed: true,
            },
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'project_id'
          });
      }

      setComparisonRows(rows);
    };

    buildRows();
  }, [supplier1Items, supplier2Items, supplier3Items, supplier4Items, supplier5Items, filters.supplier1Id, filters.supplier2Id, filters.supplier3Id, filters.supplier4Id, filters.supplier5Id, suppliers, projectId]);

  const filteredRows = useMemo(() => {
    const filtered = comparisonRows.filter(row => {
      if (!filters.sections.includes(row.section)) return false;

      if (filters.showOnlyVariances) {
        const variance = Math.abs(row.rateVariance || 0);
        return variance > filters.unitTolerancePercent || row.matchStatus !== 'matched';
      }

      return true;
    });

    console.log('[TradeAnalysis] Filtered comparison rows:', filtered.length);

    const matchedRows = comparisonRows.filter(r => r.matchStatus === 'matched');
    const missingFromS1 = comparisonRows.filter(r => r.matchStatus === 'missing_supplier1').length;
    const missingFromS2 = comparisonRows.filter(r => r.matchStatus === 'missing_supplier2').length;

    if (filtered.length === 0 && comparisonRows.length > 0) {
      if (filters.showOnlyVariances) {
        setDiagnosticHint(
          `All ${matchedRows.length} matched items are within ±${filters.unitTolerancePercent}% variance threshold. Turn off 'Show variances only' to see all items.`
        );
      } else {
        setDiagnosticHint(
          `${comparisonRows.length} total rows (${matchedRows.length} matched, ${missingFromS1} missing from Dataset 1, ${missingFromS2} missing from Dataset 2) but none match the selected sections.`
        );
      }
    }

    return filtered;
  }, [comparisonRows, filters.sections, filters.showOnlyVariances, filters.unitTolerancePercent]);

  const sectionStats = useMemo(() => {
    return calculateSectionStats(filteredRows);
  }, [filteredRows]);

  const totalsSummary = useMemo(() => {
    return calculateTotalsSummary(comparisonRows);
  }, [comparisonRows]);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(section)) {
        newSet.delete(section);
      } else {
        newSet.add(section);
      }
      return newSet;
    });
  };

  const toggleSectionFilter = (section: string) => {
    setFilters(prev => {
      const newSections = prev.sections.includes(section)
        ? prev.sections.filter(s => s !== section)
        : [...prev.sections, section];
      return { ...prev, sections: newSections };
    });
  };

  const supplier1Name = suppliers.find(s => s.id === filters.supplier1Id)?.name || 'Supplier 1';
  const supplier2Name = suppliers.find(s => s.id === filters.supplier2Id)?.name || 'Supplier 2';

  const handleExportExcel = () => {
    console.log('[TradeAnalysis] Export Excel clicked', {
      comparisonRowsCount: comparisonRows.length,
      supplier1Name,
      supplier2Name,
      supplier1ItemsCount: supplier1Items.length,
      supplier2ItemsCount: supplier2Items.length,
    });

    if (comparisonRows.length === 0) {
      alert('No comparison data available. Please select two different datasets and ensure they have comparable items.');
      return;
    }

    try {
      const exportData = comparisonRows.map(row => ({
        'Section': row.section,
        'Description': row.description,
        [`${supplier1Name} Qty`]: row.supplier1?.qty || 0,
        [`${supplier1Name} Unit`]: row.supplier1?.unit || '',
        [`${supplier1Name} Rate`]: row.supplier1?.rate || 0,
        [`${supplier1Name} Total`]: row.supplier1?.total || 0,
        [`${supplier2Name} Qty`]: row.supplier2?.qty || 0,
        [`${supplier2Name} Unit`]: row.supplier2?.unit || '',
        [`${supplier2Name} Rate`]: row.supplier2?.rate || 0,
        [`${supplier2Name} Total`]: row.supplier2?.total || 0,
        'Variance %': row.variance.percentage.toFixed(1),
        'Variance $': row.variance.amount.toFixed(2),
        'Status': row.variance.status,
      }));

      console.log('[TradeAnalysis] Export data prepared:', exportData.length, 'rows');

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Trade Analysis');

      const fileName = `Trade_Analysis_${supplier1Name.replace(/[^a-zA-Z0-9]/g, '_')}_vs_${supplier2Name.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
      console.log('[TradeAnalysis] Writing file:', fileName);

      XLSX.writeFile(wb, fileName);
      console.log('[TradeAnalysis] Export completed successfully');
    } catch (error) {
      console.error('[TradeAnalysis] Export failed:', error);
      alert(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleExportPDF = () => {
    console.log('[TradeAnalysis] Export PDF clicked', {
      comparisonRowsCount: comparisonRows.length,
      supplier1ItemsCount: supplier1Items.length,
      supplier2ItemsCount: supplier2Items.length,
    });

    if (comparisonRows.length === 0) {
      alert('No comparison data available. Please select two different datasets and ensure they have comparable items.');
      return;
    }

    try {
      window.print();
    } catch (error) {
      console.error('[TradeAnalysis] Print failed:', error);
      alert('Print dialog failed to open.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading suppliers...</div>
      </div>
    );
  }

  if (suppliers.length < 2) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="text-amber-600 flex-shrink-0" size={24} />
          <div>
            <h3 className="font-semibold text-amber-900 mb-1">Insufficient Data</h3>
            <p className="text-sm text-amber-800">
              At least 2 supplier quotes are required for trade analysis. Please import more quotes first.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const supplier1 = suppliers.find(s => s.id === filters.supplier1Id);
  const supplier2 = suppliers.find(s => s.id === filters.supplier2Id);

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg shadow-lg p-8 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Trade Analysis Report</h1>
            <p className="text-blue-100">Cross-supplier comparison for passive fire schedules</p>
          </div>
          <div className="flex flex-col gap-4">
            <TradeAnalysisExports
              supplier1={supplier1}
              supplier2={supplier2}
              comparisonRows={comparisonRows}
              supplier1ItemsCount={supplier1Items.length}
              supplier2ItemsCount={supplier2Items.length}
              onExportExcel={handleExportExcel}
              onExportPDF={handleExportPDF}
            />
            <TradeAnalysisPanel
              supplier1={supplier1 || null}
              supplier2={supplier2 || null}
              comparisonRows={comparisonRows}
              filters={filters}
              onExportExcel={handleExportExcel}
              onExportPdf={handleExportPDF}
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sticky top-0 z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Dataset 1</label>
            <select
              value={filters.supplier1Id || ''}
              onChange={(e) => setFilters(prev => ({ ...prev, supplier1Id: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select...</option>
              {suppliers.map(s => {
                const importDate = new Date(s.importedAt).toLocaleDateString();
                return (
                  <option key={s.id} value={s.id}>
                    {s.name} - ${s.totalAmount.toLocaleString()}
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Dataset 2</label>
            <select
              value={filters.supplier2Id || ''}
              onChange={(e) => setFilters(prev => ({ ...prev, supplier2Id: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select...</option>
              {suppliers.map(s => {
                const importDate = new Date(s.importedAt).toLocaleDateString();
                return (
                  <option key={s.id} value={s.id}>
                    {s.name} - ${s.totalAmount.toLocaleString()}
                  </option>
                );
              })}
            </select>
          </div>

          {suppliers.length > 2 && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Dataset 3</label>
              <select
                value={filters.supplier3Id || ''}
                onChange={(e) => setFilters(prev => ({ ...prev, supplier3Id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select...</option>
                {suppliers.map(s => {
                  const importDate = new Date(s.importedAt).toLocaleDateString();
                  return (
                    <option key={s.id} value={s.id}>
                      {s.name} - ${s.totalAmount.toLocaleString()}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {suppliers.length > 3 && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Dataset 4</label>
              <select
                value={filters.supplier4Id || ''}
                onChange={(e) => setFilters(prev => ({ ...prev, supplier4Id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select...</option>
                {suppliers.map(s => {
                  const importDate = new Date(s.importedAt).toLocaleDateString();
                  return (
                    <option key={s.id} value={s.id}>
                      {s.name} - ${s.totalAmount.toLocaleString()}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {suppliers.length > 4 && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Dataset 5</label>
              <select
                value={filters.supplier5Id || ''}
                onChange={(e) => setFilters(prev => ({ ...prev, supplier5Id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select...</option>
                {suppliers.map(s => {
                  const importDate = new Date(s.importedAt).toLocaleDateString();
                  return (
                    <option key={s.id} value={s.id}>
                      {s.name} - ${s.totalAmount.toLocaleString()}
                    </option>
                  );
                })}
              </select>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">

          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-700 mb-1">Variance Threshold (%)</label>
            <input
              type="range"
              min="5"
              max="25"
              step="5"
              value={filters.unitTolerancePercent}
              onChange={(e) => setFilters(prev => ({ ...prev, unitTolerancePercent: Number(e.target.value) }))}
              className="w-full"
            />
            <div className="text-center text-xs text-gray-600 mt-1">±{filters.unitTolerancePercent}%</div>
          </div>

          <div className="relative">
            <label className="block text-xs font-medium text-gray-700 mb-1">Sections</label>
            <button
              onClick={() => setShowSectionFilter(!showSectionFilter)}
              className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white hover:bg-gray-50"
            >
              <Filter size={16} />
              {filters.sections.length} selected
            </button>
            {showSectionFilter && (
              <div className="absolute top-full mt-1 right-0 bg-white border border-gray-200 rounded-md shadow-lg p-2 z-20 w-64">
                {AVAILABLE_SECTIONS.map(section => (
                  <label key={section} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.sections.includes(section)}
                      onChange={() => toggleSectionFilter(section)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">{section}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.showOnlyVariances}
                onChange={(e) => setFilters(prev => ({ ...prev, showOnlyVariances: e.target.checked }))}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Show variances only</span>
            </label>
          </div>
        </div>
      </div>

      {comparisonRows.length === 0 ? (
        <div className="bg-yellow-50 rounded-lg border border-yellow-200 p-8">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-yellow-600 flex-shrink-0 mt-0.5" size={24} />
            <div>
              <h3 className="font-semibold text-yellow-900 mb-2">No Comparison Data</h3>
              <p className="text-yellow-800 text-sm leading-relaxed">
                {diagnosticHint || 'No data available for comparison. Please select two datasets.'}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {sectionStats.map(stats => {
              const sectionRows = comparisonRows.filter(r => r.section === stats.section);
              const isExpanded = expandedSections.has(stats.section);

              return (
                <div key={stats.section} className="bg-white rounded-lg shadow-sm border border-gray-200">
                  <button
                    onClick={() => toggleSection(stats.section)}
                    className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                      <h3 className="text-lg font-semibold text-gray-900">{stats.section}</h3>
                    </div>
                    <div className="flex items-center gap-6 text-sm">
                      <div>
                        <span className="text-gray-500">Compared:</span>
                        <span className="ml-2 font-medium text-gray-900">{stats.linesCompared}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Missing:</span>
                        <span className="ml-2 font-medium text-amber-600">{stats.linesMissing}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Avg Δ Rate:</span>
                        <span className="ml-2 font-medium text-gray-900">
                          {stats.averageRateVariance.toFixed(1)}%
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Variance:</span>
                        <span className={`ml-2 font-medium ${stats.sectionTotalVariance < 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ${Math.abs(stats.sectionTotalVariance).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-gray-200 overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Description</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Size</th>
                            <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">Qty</th>
                            <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">Unit</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">{supplier1Name} Rate</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">{supplier2Name} Rate</th>
                            <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">Δ Rate %</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">{supplier1Name} Total</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">{supplier2Name} Total</th>
                            <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">Δ Total %</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {sectionRows.map(row => {
                            const colorClass = getVarianceColor(row.varianceLevel);

                            return (
                              <tr key={row.id} className={`${colorClass} hover:opacity-75 transition-opacity`}>
                                <td className="px-3 py-2 text-xs text-gray-900">{row.description}</td>
                                <td className="px-3 py-2 text-xs text-gray-600">{row.size || '-'}</td>
                                <td className="px-3 py-2 text-xs text-gray-900 text-center">{row.qty}</td>
                                <td className="px-3 py-2 text-xs text-gray-600 text-center">{row.unit}</td>
                                <td className="px-3 py-2 text-xs text-gray-900 text-right">
                                  {row.supplier1Rate ? `$${row.supplier1Rate.toFixed(2)}` : '-'}
                                </td>
                                <td className="px-3 py-2 text-xs text-gray-900 text-right">
                                  {row.supplier2Rate ? `$${row.supplier2Rate.toFixed(2)}` : '-'}
                                </td>
                                <td className="px-3 py-2 text-xs font-medium text-center">
                                  {row.rateVariance !== undefined ? `${row.rateVariance > 0 ? '+' : ''}${row.rateVariance.toFixed(1)}%` : '-'}
                                </td>
                                <td className="px-3 py-2 text-xs text-gray-900 text-right font-medium">
                                  {row.supplier1Total ? `$${row.supplier1Total.toFixed(2)}` : '-'}
                                </td>
                                <td className="px-3 py-2 text-xs text-gray-900 text-right font-medium">
                                  {row.supplier2Total ? `$${row.supplier2Total.toFixed(2)}` : '-'}
                                </td>
                                <td className="px-3 py-2 text-xs font-medium text-center">
                                  {row.totalVariance !== undefined ? `${row.totalVariance > 0 ? '+' : ''}${row.totalVariance.toFixed(1)}%` : '-'}
                                </td>
                                <td className="px-3 py-2 text-xs">
                                  {row.matchStatus === 'matched' ? (
                                    <span className="text-green-700">Matched</span>
                                  ) : (
                                    <span className="text-gray-600">{row.notes}</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="text-sm text-gray-500 mb-1">Overall Variance</div>
              <div className={`text-2xl font-bold ${totalsSummary.overallVariancePercent < 0 ? 'text-green-600' : 'text-red-600'}`}>
                {totalsSummary.overallVariancePercent > 0 ? '+' : ''}{totalsSummary.overallVariancePercent.toFixed(1)}%
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="text-sm text-gray-500 mb-1">Value Difference</div>
              <div className={`text-2xl font-bold ${totalsSummary.totalValueDifference < 0 ? 'text-green-600' : 'text-red-600'}`}>
                {totalsSummary.totalValueDifference < 0 ? '-' : '+'}${Math.abs(totalsSummary.totalValueDifference).toLocaleString()}
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="text-sm text-gray-500 mb-1">Missing Items</div>
              <div className="text-2xl font-bold text-amber-600">{totalsSummary.missingItemsCount}</div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="text-sm text-gray-500 mb-1">Weighted Avg Difference</div>
              <div className="text-2xl font-bold text-gray-900">
                {totalsSummary.weightedAverageDifference.toFixed(1)}%
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
