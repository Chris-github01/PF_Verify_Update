import { useState, useEffect } from 'react';
import { Download, Filter, X, AlertCircle, Lightbulb, Info, ChevronDown, ChevronUp, CheckSquare, Square, ArrowLeft, FileSpreadsheet, GitCompare } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getModelRateProvider } from '../lib/modelRate/modelRateProvider';
import { compareAgainstModelHybrid } from '../lib/comparison/hybridCompareAgainstModel';
import type { ComparisonRow, MatrixRow, MatrixCell, MatrixFilters } from '../types/comparison.types';
import WorkflowNav from '../components/WorkflowNav';
import { needsQuantity } from '../lib/quoteUtils';
import { useSuggestedSystems } from '../lib/useSuggestedSystems';
import SuggestedSystemsPanel from '../components/SuggestedSystemsPanel';
import { useOrganisation } from '../lib/organisationContext';
import * as XLSX from 'xlsx';
import type { DashboardMode } from '../App';

interface ScopeMatrixProps {
  projectId: string;
  onNavigateBack?: () => void;
  onNavigateNext?: () => void;
  dashboardMode?: DashboardMode;
}

const getFlagColor = (flag: string): string => {
  switch (flag) {
    case 'GREEN':
      return 'bg-green-100 text-green-900 border-green-300';
    case 'AMBER':
      return 'bg-amber-100 text-amber-900 border-amber-300';
    case 'RED':
      return 'bg-red-100 text-red-900 border-red-300';
    default:
      return 'bg-gray-100 text-gray-600 border-gray-300';
  }
};

interface QuoteInfo {
  id: string;
  supplier_name: string;
  quote_reference?: string;
  total_amount?: number;
  items_count: number;
  mapped_items_count: number;
  parse_status?: 'completed' | 'failed' | 'partial' | 'pending' | 'processing';
  has_failed_chunks?: boolean;
}

interface MatrixDiagnostics {
  totalItems: number;
  itemsByQuote: Record<string, number>;
  itemsWithSystemByQuote: Record<string, number>;
  overlappingSystemsCount: number;
  overlappingSystems: string[];
  selectedQuoteIds: string[];
  reason?: 'no_items' | 'no_mapped_items' | 'no_overlap' | 'success';
}

function isScopeMatrixReady(quote: QuoteInfo): boolean {
  return quote.parse_status === 'completed' &&
         quote.items_count > 0;
}

interface SupplierDetail {
  name: string;
  revisionNumber: number;
  quoteReference: string;
}

export default function ScopeMatrix({ projectId, onNavigateBack, onNavigateNext, dashboardMode = 'original' }: ScopeMatrixProps) {
  const [comparisonData, setComparisonData] = useState<ComparisonRow[]>([]);
  const [matrixRows, setMatrixRows] = useState<MatrixRow[]>([]);
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [supplierDetails, setSupplierDetails] = useState<Record<string, SupplierDetail>>({});
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [itemsWithMissingQty, setItemsWithMissingQty] = useState<Set<string>>(new Set());
  const [showSuggestedSystems, setShowSuggestedSystems] = useState(false);
  const [showMoreInfo, setShowMoreInfo] = useState(false);
  const { currentOrganisation } = useOrganisation();
  const organisationId = currentOrganisation?.id || '';
  const { suggestions } = useSuggestedSystems(projectId);

  const [availableQuotes, setAvailableQuotes] = useState<QuoteInfo[]>([]);
  const [selectedQuoteIds, setSelectedQuoteIds] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [quotesLoading, setQuotesLoading] = useState(true);
  const [diagnostics, setDiagnostics] = useState<MatrixDiagnostics | null>(null);

  const [originalQuotes, setOriginalQuotes] = useState<QuoteInfo[]>([]);
  const [selectedOriginalQuoteIds, setSelectedOriginalQuoteIds] = useState<string[]>([]);
  const [showOriginalSelector, setShowOriginalSelector] = useState(false);

  const [filters, setFilters] = useState<MatrixFilters>({});
  const [availableFilters, setAvailableFilters] = useState({
    sections: [] as string[],
    services: [] as string[],
    subclasses: [] as string[],
    frrs: [] as string[],
    sizeBuckets: [] as string[],
  });

  console.log('========== SCOPE MATRIX DEBUG ==========');
  console.log('ScopeMatrix render:', {
    projectId,
    comparisonDataLength: comparisonData.length,
    matrixRowsLength: matrixRows.length,
    suppliersCount: suppliers.length,
    loading,
    hasFilters: Object.keys(filters).length > 0
  });

  useEffect(() => {
    loadAvailableQuotes();
    if (dashboardMode === 'revisions') {
      loadOriginalQuotes();
    }
  }, [projectId, dashboardMode]);

  useEffect(() => {
    buildMatrix();
  }, [comparisonData, filters]);

  const loadOriginalQuotes = async () => {
    try {
      const { data: allQuotes } = await supabase
        .from('quotes')
        .select('id, supplier_name, quote_reference, total_amount, items_count, revision_number')
        .eq('project_id', projectId)
        .or('revision_number.is.null,revision_number.eq.1')
        .order('supplier_name');

      const quotesData = allQuotes || [];

      if (quotesData.length > 0) {
        const quotesWithStatus = await Promise.all(
          quotesData.map(async (quote) => {
            const { count: totalCount } = await supabase
              .from('quote_items')
              .select('*', { count: 'exact', head: true })
              .eq('quote_id', quote.id);

            const { count: mappedCount } = await supabase
              .from('quote_items')
              .select('*', { count: 'exact', head: true })
              .eq('quote_id', quote.id)
              .not('system_id', 'is', null);

            return {
              id: quote.id,
              supplier_name: quote.supplier_name,
              quote_reference: quote.quote_reference,
              total_amount: quote.total_amount,
              items_count: totalCount || 0,
              mapped_items_count: mappedCount || 0,
              parse_status: 'completed' as const,
              has_failed_chunks: false,
            };
          })
        );
        setOriginalQuotes(quotesWithStatus.filter(q => q.items_count > 0));
      }
    } catch (err) {
      console.error('Failed to load original quotes:', err);
    }
  };

  const loadAvailableQuotes = async () => {
    setQuotesLoading(true);
    try {
      // Filter quotes based on dashboard mode
      const { data: allQuotes } = await supabase
        .from('quotes')
        .select('id, supplier_name, quote_reference, total_amount, items_count, revision_number')
        .eq('project_id', projectId)
        .order('supplier_name');

      // Filter quotes by revision number, treating NULL as revision 1
      const quotesData = allQuotes?.filter(q => {
        const revisionNumber = q.revision_number ?? 1;
        if (dashboardMode === 'original') {
          return revisionNumber === 1;
        } else {
          return revisionNumber > 1;
        }
      }) || [];

      if (quotesData.length > 0) {
        const quotesWithStatus = await Promise.all(
          quotesData.map(async (quote) => {
            const { data: jobData } = await supabase
              .from('parsing_jobs')
              .select('status, error_message, result_data')
              .eq('quote_id', quote.id)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            const { count: totalCount } = await supabase
              .from('quote_items')
              .select('*', { count: 'exact', head: true })
              .eq('quote_id', quote.id);

            const { count: mappedCount } = await supabase
              .from('quote_items')
              .select('*', { count: 'exact', head: true })
              .eq('quote_id', quote.id)
              .not('system_id', 'is', null);

            const itemCount = totalCount || 0;
            const mappedItemsCount = mappedCount || 0;
            const hasFailedChunks = jobData?.error_message?.includes('chunks failed') || false;

            let parseStatus: 'completed' | 'failed' | 'partial' | 'pending' | 'processing' = 'completed';
            if (jobData) {
              if (jobData.status === 'completed' && itemCount === 0) {
                parseStatus = 'failed';
              } else if (jobData.status === 'completed' && hasFailedChunks) {
                parseStatus = 'partial';
              } else if (jobData.status === 'failed') {
                parseStatus = 'failed';
              } else {
                parseStatus = jobData.status as any;
              }
            }

            return {
              id: quote.id,
              supplier_name: quote.supplier_name,
              quote_reference: quote.quote_reference,
              total_amount: quote.total_amount,
              items_count: itemCount,
              mapped_items_count: mappedItemsCount,
              parse_status: parseStatus,
              has_failed_chunks: hasFailedChunks,
            };
          })
        );

        console.log('=== LOADED QUOTES WITH STATUS ===');
        quotesWithStatus.forEach(q => {
          console.log(`${q.supplier_name}:`, {
            items_count: q.items_count,
            mapped_items_count: q.mapped_items_count,
            parse_status: q.parse_status,
            has_failed_chunks: q.has_failed_chunks
          });
        });
        console.log('=================================');

        setAvailableQuotes(quotesWithStatus);
      }
    } catch (error) {
      console.error('Error loading quotes:', error);
    } finally {
      setQuotesLoading(false);
    }
  };

  const handleGenerateMatrix = async () => {
    if (selectedQuoteIds.length === 0) return;

    console.log('=== SCOPE MATRIX GENERATION START ===');
    console.log('Selected Quote IDs:', selectedQuoteIds);
    console.log('Project ID:', projectId);

    setIsGenerating(true);
    await loadData();
    setHasGenerated(true);
    setIsGenerating(false);

    console.log('=== SCOPE MATRIX GENERATION END ===');
  };

  const buildMatrixDiagnostics = (itemsData: any[], quoteIds: string[]): MatrixDiagnostics => {
    const itemsByQuote: Record<string, number> = {};
    const itemsWithSystemByQuote: Record<string, number> = {};
    const systemMap: Record<string, Set<string>> = {};

    for (const item of itemsData) {
      itemsByQuote[item.quote_id] = (itemsByQuote[item.quote_id] || 0) + 1;

      if (item.system_id) {
        itemsWithSystemByQuote[item.quote_id] = (itemsWithSystemByQuote[item.quote_id] || 0) + 1;

        if (!systemMap[item.system_id]) {
          systemMap[item.system_id] = new Set();
        }
        systemMap[item.system_id].add(item.quote_id);
      }
    }

    const overlappingSystems = Object.entries(systemMap)
      .filter(([, quoteSet]) => quoteSet.size >= 2)
      .map(([systemId]) => systemId);

    let reason: MatrixDiagnostics['reason'] = 'success';
    if (itemsData.length === 0) {
      reason = 'no_items';
    } else if (Object.values(itemsWithSystemByQuote).every(count => count === 0)) {
      reason = 'no_mapped_items';
    } else if (overlappingSystems.length === 0) {
      reason = 'no_overlap';
    }

    return {
      totalItems: itemsData.length,
      itemsByQuote,
      itemsWithSystemByQuote,
      overlappingSystemsCount: overlappingSystems.length,
      overlappingSystems,
      selectedQuoteIds: quoteIds,
      reason
    };
  };

  const loadData = async () => {
    setLoading(true);

    try {
      let quoteIdsToLoad = selectedQuoteIds.length > 0 ? selectedQuoteIds : availableQuotes.map(q => q.id);

      if (dashboardMode === 'revisions' && selectedOriginalQuoteIds.length > 0) {
        quoteIdsToLoad = [...quoteIdsToLoad, ...selectedOriginalQuoteIds];
      }

      const { data: quotesData } = await supabase
        .from('quotes')
        .select('id, supplier_name, revision_number, quote_reference')
        .in('id', quoteIdsToLoad)
        .order('supplier_name');

      if (!quotesData || quotesData.length === 0) {
        setLoading(false);
        return;
      }

      const details: Record<string, SupplierDetail> = {};
      quotesData.forEach(q => {
        details[q.supplier_name] = {
          name: q.supplier_name,
          revisionNumber: q.revision_number ?? 1,
          quoteReference: q.quote_reference || ''
        };
      });
      setSupplierDetails(details);

      const quoteIds = quotesData.map(q => q.id);

      const { data: itemsData } = await supabase
        .from('quote_items')
        .select('*')
        .in('quote_id', quoteIds);

      if (!itemsData) {
        console.error('ScopeMatrix: No items data returned from database');
        setLoading(false);
        return;
      }

      const diag = buildMatrixDiagnostics(itemsData, quoteIds);
      setDiagnostics(diag);

      console.log('=== SCOPE MATRIX DIAGNOSTICS ===');
      console.log('Total Items:', diag.totalItems);
      console.log('Items by Quote:', diag.itemsByQuote);
      console.log('Items with System by Quote:', diag.itemsWithSystemByQuote);
      console.log('Overlapping Systems Count:', diag.overlappingSystemsCount);
      console.log('Overlapping Systems:', diag.overlappingSystems);
      console.log('Reason:', diag.reason);
      console.log('================================');

      console.log('ScopeMatrix: Loading data for project', projectId);
      console.log('ScopeMatrix: Found', quotesData.length, 'quotes and', itemsData.length, 'items');

      const itemsWithSystemId = itemsData.filter(item => item.system_id);
      console.log('ScopeMatrix: Items with system_id:', itemsWithSystemId.length);

      if (itemsData.length > 0) {
        const sampleItem = itemsData[0];
        console.log('ScopeMatrix: Sample item data:', {
          id: sampleItem.id,
          description: sampleItem.description?.substring(0, 50),
          system_id: sampleItem.system_id,
          system_label: sampleItem.system_label,
          service: (sampleItem as any).service,
          subclass: (sampleItem as any).subclass,
          frr: (sampleItem as any).frr,
          size: (sampleItem as any).size,
          quantity: sampleItem.quantity,
          unit_price: sampleItem.unit_price,
          canonical_unit: (sampleItem as any).canonical_unit,
        });
      }

      if (itemsWithSystemId.length === 0) {
        console.warn('ScopeMatrix: WARNING - No items have system_id mapped! Matrix will be empty.');
        console.warn('ScopeMatrix: Make sure you have completed Review & Clean > Smart Clean or mapping step.');
      } else {
        console.log('ScopeMatrix: Sample mapped item:', {
          system_id: itemsWithSystemId[0].system_id,
          system_label: itemsWithSystemId[0].system_label,
          description: itemsWithSystemId[0].description?.substring(0, 50),
        });
      }

      const missingQtySet = new Set(
        itemsData
          .filter(item => needsQuantity(item))
          .map(item => item.id)
      );
      setItemsWithMissingQty(missingQtySet);

      const normalisedLines = itemsData.map(item => {
        const quote = quotesData.find(q => q.id === item.quote_id);

        const serviceType = (item as any).service || (item as any).mapped_service_type || (item as any).serviceType;
        const systemType = (item as any).mapped_system || (item as any).systemType;
        const penetrationType = (item as any).mapped_penetration || (item as any).penetrationType;

        return {
          quoteId: item.quote_id,
          quoteItemId: item.id,
          supplier: quote?.supplier_name || 'Unknown',
          originalDescription: item.description,
          quantity: item.quantity || 1,
          rate: item.unit_price,
          total: item.total_price,
          section: (item as any).section,
          service: serviceType,
          serviceType: serviceType,
          subclass: (item as any).subclass,
          frr: (item as any).frr,
          size: (item as any).size,
          systemType: systemType,
          penetrationType: penetrationType,
        };
      });

      console.log('ScopeMatrix: Normalised', normalisedLines.length, 'lines');
      console.log('ScopeMatrix: Sample item:', normalisedLines[0]);

      const mappings = itemsData.map(item => ({
        quoteItemId: item.id,
        systemId: item.system_id,
        systemLabel: item.system_label,
      }));

      console.log('ScopeMatrix: Created', mappings.length, 'mappings');
      console.log('ScopeMatrix: Sample mappings:', mappings.slice(0, 3));
      const mappingsWithSystemId = mappings.filter(m => m.systemId);
      console.log('ScopeMatrix: Mappings with system_id:', mappingsWithSystemId.length, '/', mappings.length);
      if (mappingsWithSystemId.length > 0) {
        console.log('ScopeMatrix: Sample mapped item:', mappingsWithSystemId[0]);
      } else {
        console.warn('ScopeMatrix: NO MAPPINGS FOUND! Items are not mapped to systems.');
        console.warn('ScopeMatrix: Sample unmapped item:', mappings[0]);
      }

      const provider = getModelRateProvider(projectId);
      await provider.loadSettings();

      console.log('ScopeMatrix: Model rate provider loaded');

      const comparisons = await compareAgainstModelHybrid(
        normalisedLines,
        mappings,
        (criteria) => provider.getModelRate(criteria)
      );

      console.log('ScopeMatrix: Generated', comparisons.length, 'comparison rows');
      if (comparisons.length > 0) {
        console.log('ScopeMatrix: Sample comparison:', comparisons[0]);
        const uniqueSuppliers = Array.from(new Set(comparisons.map(c => c.supplier)));
        console.log('ScopeMatrix: Unique suppliers in comparisons:', uniqueSuppliers);
      } else {
        console.error('ScopeMatrix: ERROR - compareAgainstModelHybrid returned 0 rows!');
        console.log('ScopeMatrix: Check if items have system_id and if model rates are configured');
      }

      setComparisonData(comparisons);
      extractAvailableFilters(comparisons);

      console.log('ScopeMatrix: comparisonData state set with', comparisons.length, 'rows');

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
            scope_matrix_completed: true,
          },
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'project_id'
        });
    } catch (error) {
      console.error('ScopeMatrix: Error loading data:', error);
      console.error('ScopeMatrix: Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      setComparisonData([]);
    } finally {
      setLoading(false);
    }
  };

  const extractAvailableFilters = (data: ComparisonRow[]) => {
    const sections = new Set<string>();
    const services = new Set<string>();
    const subclasses = new Set<string>();
    const frrs = new Set<string>();
    const sizeBuckets = new Set<string>();

    data.forEach(row => {
      if (row.section) sections.add(row.section);
      if (row.service) services.add(row.service);
      if (row.subclass) subclasses.add(row.subclass);
      if (row.frr) frrs.add(row.frr);
      if (row.sizeBucket) sizeBuckets.add(row.sizeBucket);
    });

    setAvailableFilters({
      sections: Array.from(sections).sort(),
      services: Array.from(services).sort(),
      subclasses: Array.from(subclasses).sort(),
      frrs: Array.from(frrs).sort(),
      sizeBuckets: Array.from(sizeBuckets).sort(),
    });
  };

  const buildMatrix = () => {
    console.log('=== BUILD MATRIX START ===');
    console.log('buildMatrix: Starting with', comparisonData.length, 'comparison rows');
    console.log('buildMatrix: Has generated:', hasGenerated);
    console.log('buildMatrix: Active filters:', filters);
    let filteredData = comparisonData;

    if (filters.section) {
      filteredData = filteredData.filter(row => row.section === filters.section);
    }
    if (filters.service) {
      filteredData = filteredData.filter(row => row.service === filters.service);
    }
    if (filters.subclass) {
      filteredData = filteredData.filter(row => row.subclass === filters.subclass);
    }
    if (filters.frr) {
      filteredData = filteredData.filter(row => row.frr === filters.frr);
    }
    if (filters.sizeBucket) {
      filteredData = filteredData.filter(row => row.sizeBucket === filters.sizeBucket);
    }

    console.log('buildMatrix: After filtering:', filteredData.length, 'rows');

    const uniqueSuppliers = Array.from(new Set(filteredData.map(row => row.supplier))).sort();
    setSuppliers(uniqueSuppliers);
    console.log('buildMatrix: Found', uniqueSuppliers.length, 'suppliers:', uniqueSuppliers);

    const rowMap = new Map<string, MatrixRow>();

    filteredData.forEach(row => {
      const key = `${row.systemId}|${row.systemLabel}`;

      if (!rowMap.has(key)) {
        rowMap.set(key, {
          systemId: row.systemId,
          systemLabel: row.systemLabel,
          section: row.section,
          service: row.service,
          subclass: row.subclass,
          frr: row.frr,
          sizeBucket: row.sizeBucket,
          cells: {},
        });
      }

      const matrixRow = rowMap.get(key)!;

      if (!matrixRow.cells[row.supplier]) {
        matrixRow.cells[row.supplier] = {
          unitRate: row.unitRate,
          flag: row.flag,
          modelRate: row.modelRate,
          variancePct: row.variancePct,
          componentCount: 1,
          quoteId: row.quoteId,
          quoteItemId: row.quoteItemId,
          totalQuantity: row.quantity || 0,
          totalValue: row.total || 0,
        };
      } else {
        const cell = matrixRow.cells[row.supplier];
        const currentTotal = cell.totalValue || 0;
        const currentQty = cell.totalQuantity || 0;
        const newQty = currentQty + (row.quantity || 0);
        const newTotal = currentTotal + (row.total || 0);

        cell.totalQuantity = newQty;
        cell.totalValue = newTotal;
        cell.componentCount = (cell.componentCount || 0) + 1;
        cell.unitRate = newQty > 0 ? newTotal / newQty : cell.unitRate;

        if (row.modelRate !== null && cell.unitRate > 0) {
          const variance = ((cell.unitRate - row.modelRate) / row.modelRate) * 100;
          cell.variancePct = variance;

          if (Math.abs(variance) <= 10) {
            cell.flag = 'GREEN';
          } else if (Math.abs(variance) <= 25) {
            cell.flag = 'AMBER';
          } else {
            cell.flag = 'RED';
          }
        }
      }
    });

    const rows = Array.from(rowMap.values()).sort((a, b) => {
      if (a.systemId === 'UNMAPPED' && b.systemId !== 'UNMAPPED') return 1;
      if (b.systemId === 'UNMAPPED' && a.systemId !== 'UNMAPPED') return -1;
      return a.systemLabel.localeCompare(b.systemLabel);
    });

    console.log('buildMatrix: Generated', rows.length, 'matrix rows');
    console.log('buildMatrix: Rows by systemId breakdown:');
    const systemCounts = new Map<string, number>();
    filteredData.forEach(row => {
      systemCounts.set(row.systemId, (systemCounts.get(row.systemId) || 0) + 1);
    });
    systemCounts.forEach((count, systemId) => {
      console.log(`  - ${systemId}: ${count} items`);
    });

    if (rows.length > 0) {
      console.log('buildMatrix: Sample row:', rows[0]);
      console.log('buildMatrix: Sample row cells:', Object.keys(rows[0].cells));
    } else {
      console.warn('buildMatrix: WARNING - No matrix rows generated!');
      console.warn('buildMatrix: Diagnostics:', diagnostics);
      if (filteredData.length > 0) {
        console.warn('buildMatrix: We have filtered data but no rows! This is the bug.');
        console.warn('buildMatrix: Sample filtered data:', filteredData.slice(0, 3));
      }
    }

    setMatrixRows(rows);
    console.log('=== BUILD MATRIX END ===');
  };

  const exportToCSV = () => {
    try {
      console.log('Export CSV clicked', { matrixRowsCount: matrixRows.length, suppliersCount: suppliers.length });

      if (matrixRows.length === 0) {
        alert('No data available to export. Please ensure quotes are imported and the matrix has been generated.');
        return;
      }

      const headers = ['System ID', 'System Label', 'Section', 'Service', 'Subclass', 'FRR', 'Size Bucket'];
      suppliers.forEach(supplier => {
        headers.push(`${supplier} - Unit Rate`);
        headers.push(`${supplier} - Model Rate`);
        headers.push(`${supplier} - Variance %`);
        headers.push(`${supplier} - Flag`);
      });

      const rows = matrixRows.map(row => {
        const csvRow = [
          row.systemId,
          row.systemLabel,
          row.section || '',
          row.service || '',
          row.subclass || '',
          row.frr || '',
          row.sizeBucket || '',
        ];

        suppliers.forEach(supplier => {
          const cell = row.cells[supplier];
          if (cell) {
            csvRow.push(cell.unitRate?.toFixed(2) || '');
            csvRow.push(cell.modelRate?.toFixed(2) || '');
            csvRow.push(cell.variancePct?.toFixed(2) || '');
            csvRow.push(cell.flag);
          } else {
            csvRow.push('', '', '', '');
          }
        });

        return csvRow;
      });

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scope-matrix-${projectId}-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      console.log('Export completed successfully');
    } catch (error) {
      console.error('Error exporting CSV:', error);
      alert('Failed to export CSV. Check console for details.');
    }
  };

  const exportItemizedComparisonToExcel = async () => {
    try {
      console.log('Export Excel clicked', { matrixRowsCount: matrixRows.length, suppliersCount: suppliers.length });

      if (matrixRows.length === 0) {
        alert('No data available to export. Please generate a scope matrix first.');
        return;
      }

      const templatePath = '/templates/Itemized_Comparison_Global_1.xlsx';
      const response = await fetch(templatePath);

      if (!response.ok) {
        throw new Error('Failed to load template file');
      }

      const arrayBuffer = await response.arrayBuffer();
      const wb = XLSX.read(arrayBuffer, { type: 'array', cellStyles: true });
      const ws = wb.Sheets[wb.SheetNames[0]];

      ws['A2'] = { t: 's', v: `Project ID: ${projectId}` };
      ws['A3'] = { t: 's', v: `Generated: ${new Date().toLocaleString()}` };

      const startCol = 3;

      ws['!merges'] = [];

      for (let i = 0; i < suppliers.length; i++) {
        const supplierCol = startCol + (i * 2);
        const cellAddress = XLSX.utils.encode_cell({ r: 4, c: supplierCol });

        ws[cellAddress] = {
          t: 's',
          v: suppliers[i],
          s: ws[cellAddress]?.s || {}
        };

        ws['!merges'].push({
          s: { r: 4, c: supplierCol },
          e: { r: 4, c: supplierCol + 1 }
        });

        const unitRateCell = XLSX.utils.encode_cell({ r: 5, c: supplierCol });
        const totalCell = XLSX.utils.encode_cell({ r: 5, c: supplierCol + 1 });

        ws[unitRateCell] = {
          t: 's',
          v: 'Unit Rate',
          s: ws[unitRateCell]?.s || {}
        };
        ws[totalCell] = {
          t: 's',
          v: 'Total',
          s: ws[totalCell]?.s || {}
        };
      }

      const dataStartRow = 6;
      const range = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : { s: { r: 0, c: 0 }, e: { r: 5, c: 2 } };

      matrixRows.forEach((row, idx) => {
        const rowNum = dataStartRow + idx;

        ws[XLSX.utils.encode_cell({ r: rowNum, c: 0 })] = {
          t: 's',
          v: row.systemLabel || row.systemId
        };
        ws[XLSX.utils.encode_cell({ r: rowNum, c: 1 })] = {
          t: 's',
          v: ''
        };
        ws[XLSX.utils.encode_cell({ r: rowNum, c: 2 })] = {
          t: 's',
          v: ''
        };

        suppliers.forEach((supplier, supplierIdx) => {
          const cell = row.cells[supplier];
          const unitRateCol = startCol + (supplierIdx * 2);
          const totalCol = unitRateCol + 1;

          if (cell && cell.unitRate !== null && !isNaN(cell.unitRate)) {
            ws[XLSX.utils.encode_cell({ r: rowNum, c: unitRateCol })] = {
              t: 'n',
              v: cell.unitRate,
              z: '"$"#,##0.00'
            };
            const total = cell.totalValue !== undefined ? cell.totalValue :
                         (cell.totalQuantity && cell.unitRate ? cell.totalQuantity * cell.unitRate : 0);
            ws[XLSX.utils.encode_cell({ r: rowNum, c: totalCol })] = {
              t: 'n',
              v: total,
              z: '"$"#,##0.00'
            };
          } else {
            ws[XLSX.utils.encode_cell({ r: rowNum, c: unitRateCol })] = {
              t: 's',
              v: 'N/A'
            };
            ws[XLSX.utils.encode_cell({ r: rowNum, c: totalCol })] = {
              t: 's',
              v: 'N/A'
            };
          }
        });

        range.e.r = Math.max(range.e.r, rowNum);
        range.e.c = Math.max(range.e.c, startCol + (suppliers.length * 2) - 1);
      });

      ws['!ref'] = XLSX.utils.encode_range(range);

      const filename = `Itemized_Comparison_${projectId}_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, filename);

      console.log('Excel export completed successfully');
    } catch (error) {
      console.error('Error exporting Excel:', error);
      alert('Failed to export Excel. Check console for details.');
    }
  };

  const clearFilters = () => {
    setFilters({});
  };

  const hasActiveFilters = Object.values(filters).some(v => v);

  const handleToggleQuote = (quoteId: string) => {
    setSelectedQuoteIds(prev =>
      prev.includes(quoteId)
        ? prev.filter(id => id !== quoteId)
        : [...prev, quoteId]
    );
  };

  const handleSelectAll = () => {
    const readyQuotes = availableQuotes.filter(isScopeMatrixReady);
    if (selectedQuoteIds.length === readyQuotes.length) {
      setSelectedQuoteIds([]);
    } else {
      setSelectedQuoteIds(readyQuotes.map(q => q.id));
    }
  };

  const handleToggleOriginalQuote = (quoteId: string) => {
    setSelectedOriginalQuoteIds(prev => {
      if (prev.includes(quoteId)) {
        return prev.filter(id => id !== quoteId);
      } else {
        return [...prev, quoteId];
      }
    });
  };

  const handleClearOriginalSelection = () => {
    setSelectedOriginalQuoteIds([]);
  };

  const readyQuotes = availableQuotes.filter(isScopeMatrixReady);

  console.log('=== SCOPE MATRIX QUOTE FILTERING ===');
  console.log('Total available quotes:', availableQuotes.length);
  console.log('Ready quotes:', readyQuotes.length);
  availableQuotes.forEach(quote => {
    const isReady = isScopeMatrixReady(quote);
    console.log(`Quote "${quote.supplier_name}":`, {
      isReady,
      parse_status: quote.parse_status,
      items_count: quote.items_count,
      mapped_items_count: quote.mapped_items_count,
      has_failed_chunks: quote.has_failed_chunks
    });
  });
  console.log('====================================');

  const allSelected = readyQuotes.length > 0 && selectedQuoteIds.length === readyQuotes.length;

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="mb-6">
          <button
            onClick={onNavigateBack}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4 transition-colors"
          >
            <ArrowLeft size={16} />
            Back to Project Dashboard
          </button>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Scope Matrix</h1>
          <p className="text-base text-gray-600">Compare supplier quotes and generate your scope matrix.</p>
        </div>

        <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Supplier Quotes</h2>
            {readyQuotes.length > 0 && (
              <button
                onClick={handleSelectAll}
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 font-medium"
              >
                {allSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                {allSelected ? 'Deselect All' : 'Select All'}
              </button>
            )}
          </div>

          {availableQuotes.length > readyQuotes.length && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
              <div className="flex items-start gap-2">
                <Info size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-blue-800">
                  {availableQuotes.length - readyQuotes.length} quote(s) are not ready for comparison.
                  Fix imports in <a href="#/import-quotes" className="underline font-medium">Import Quotes</a> or{' '}
                  <a href="#/review-clean" className="underline font-medium">Review & Clean</a>.
                </div>
              </div>
            </div>
          )}

          {quotesLoading ? (
            <div className="text-center py-8 text-gray-500 text-sm">Loading quotes...</div>
          ) : readyQuotes.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="mx-auto text-gray-400 mb-4" size={48} />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No quotes ready for Scope Matrix</h3>
              <p className="text-sm text-gray-600 mb-6">
                To compare suppliers, first import and clean at least one supplier quote.
              </p>
              <a
                href="#/import-quotes"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition-colors"
              >
                Go to Import Quotes
              </a>
            </div>
          ) : (
            <div className="space-y-2">
              {readyQuotes.map((quote) => {
                const isSelected = selectedQuoteIds.includes(quote.id);

                return (
                  <button
                    key={quote.id}
                    onClick={() => handleToggleQuote(quote.id)}
                    className={`w-full flex items-center gap-3 py-3 px-3 rounded-lg border transition-all text-left ${
                      isSelected
                        ? 'border-gray-300 bg-gray-50'
                        : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex-shrink-0">
                      {isSelected ? (
                        <CheckSquare className="text-blue-600" size={18} />
                      ) : (
                        <Square className="text-gray-400" size={18} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 text-sm">{quote.supplier_name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {quote.items_count} items •
                        {quote.mapped_items_count > 0 ? (
                          <span className="text-green-600 font-medium"> {quote.mapped_items_count} mapped</span>
                        ) : (
                          <span className="text-amber-600 font-medium"> 0 mapped (needs Review & Clean)</span>
                        )}
                         • ${quote.total_amount?.toLocaleString() || '0'}
                        {quote.mapped_items_count > 0 ? (
                          <span className="text-green-600 font-medium ml-2">✓ Ready</span>
                        ) : (
                          <span className="text-amber-600 font-medium ml-2">⚠ Needs mapping</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {selectedQuoteIds.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="text-sm text-gray-900 font-medium mb-1">
                {(selectedQuoteIds.length + selectedOriginalQuoteIds.length) < 2 ? (
                  'Select at least 2 suppliers to generate a scope matrix.'
                ) : (
                  <>
                    Comparing: {readyQuotes.filter(q => selectedQuoteIds.includes(q.id)).map(q => q.supplier_name).join(' vs ')}
                    {selectedOriginalQuoteIds.length > 0 && (
                      <> vs {originalQuotes.filter(q => selectedOriginalQuoteIds.includes(q.id)).map(q => q.supplier_name).join(' vs ')}</>
                    )}
                  </>
                )}
              </div>
              {selectedQuoteIds.length >= 2 && (() => {
                const selectedQuotes = readyQuotes.filter(q => selectedQuoteIds.includes(q.id));
                const allMapped = selectedQuotes.every(q => q.mapped_items_count > 0);
                const totalMapped = selectedQuotes.reduce((sum, q) => sum + q.mapped_items_count, 0);
                const totalItems = selectedQuotes.reduce((sum, q) => sum + q.items_count, 0);

                return (
                  <div className={`text-xs ${allMapped ? 'text-green-600' : 'text-amber-600'}`}>
                    {allMapped ? (
                      `✓ All selected quotes are normalised and mapped (${totalMapped}/${totalItems} items)`
                    ) : (
                      `⚠ Some quotes need mapping - Go to Review & Clean and run Smart Clean`
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {dashboardMode === 'revisions' && originalQuotes.length > 0 && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <button
                onClick={() => setShowOriginalSelector(!showOriginalSelector)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium mb-3"
              >
                <GitCompare size={16} />
                Compare with Original Quotes
                {selectedOriginalQuoteIds.length > 0 && (
                  <span className="ml-1 px-2 py-0.5 bg-blue-600 text-white rounded-full text-xs">
                    {selectedOriginalQuoteIds.length}
                  </span>
                )}
              </button>

              {showOriginalSelector && (
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-900">Select Original Quotes to Compare</h3>
                    {selectedOriginalQuoteIds.length > 0 && (
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
                          checked={selectedOriginalQuoteIds.includes(quote.id)}
                          onChange={() => handleToggleOriginalQuote(quote.id)}
                          className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        />
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-900">{quote.supplier_name}</div>
                          <div className="text-xs text-gray-500">
                            {quote.items_count} items • {quote.mapped_items_count} mapped
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                  {selectedOriginalQuoteIds.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-600">
                      <p className="flex items-center gap-1">
                        <AlertCircle size={14} />
                        Matrix will include {selectedOriginalQuoteIds.length} original quote{selectedOriginalQuoteIds.length > 1 ? 's' : ''} for comparison
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex items-end justify-end mt-6">
            <div className="text-right">
              <button
                onClick={handleGenerateMatrix}
                disabled={(selectedQuoteIds.length + selectedOriginalQuoteIds.length) < 2 || isGenerating}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed text-sm"
              >
                {isGenerating ? 'Building Matrix...' : 'Generate Scope Matrix'}
              </button>
              <p className="text-xs text-gray-500 mt-2">
                Only updated quotes will be reprocessed.
              </p>
            </div>
          </div>
        </div>

        {!hasGenerated && !loading && selectedQuoteIds.length === 0 && (
          <div className="bg-white rounded-lg p-8 border border-gray-200 text-center">
            <p className="text-gray-600 mb-1">No scope matrix generated yet.</p>
            <p className="text-sm text-gray-500">Generate a matrix to continue.</p>
          </div>
        )}

        {loading && (
          <div className="bg-white rounded-lg p-8 border border-gray-200 text-center">
            <div className="text-gray-600">Building scope matrix...</div>
          </div>
        )}

        {hasGenerated && !loading && comparisonData.length === 0 && (() => {
          const d = diagnostics;
          let title = "No comparison data available";
          let description = "Unable to generate scope matrix for the selected quotes.";
          let actionText = "Go to Review & Clean";
          let actionUrl = "#/review-clean";

          if (d?.reason === 'no_items') {
            title = "No processed items found";
            description = "We couldn't find any processed line items for the selected suppliers. Make sure quotes have been imported and processing completed successfully.";
            actionText = "Check Import Status";
            actionUrl = "#/import-quotes";
          } else if (d?.reason === 'no_mapped_items') {
            title = "Items aren't mapped to systems";
            description = "The selected suppliers have items, but none are mapped to systems. Map items to systems in Review & Clean so they can be compared.";
            actionText = "Go to Review & Clean";
            actionUrl = "#/review-clean";
          } else if (d?.reason === 'no_overlap') {
            title = "No overlapping systems to compare";
            description = "These suppliers don't share any systems, so there's nothing to compare. Try selecting different quotes or adjust system mapping in Review & Clean.";
            actionText = "Go to Review & Clean";
            actionUrl = "#/review-clean";
          }

          return (
            <div className="bg-white rounded-xl p-12 border border-gray-200 shadow-sm">
              <div className="text-center">
                <AlertCircle className="mx-auto mb-4 text-amber-500" size={48} />
                <p className="text-gray-900 text-lg font-semibold mb-2">{title}</p>
                <p className="text-gray-600 mb-6 max-w-2xl mx-auto">
                  {description}
                </p>

                {d && (
                  <div className="text-left max-w-2xl mx-auto bg-gray-50 rounded-lg p-4 text-sm mb-6">
                    <p className="font-semibold text-gray-900 mb-3">Diagnostics:</p>
                    <div className="space-y-2 text-gray-700">
                      <div className="flex justify-between">
                        <span>Total items loaded:</span>
                        <span className="font-medium">{d.totalItems}</span>
                      </div>
                      {Object.entries(d.itemsByQuote).map(([quoteId, count]) => {
                        const quote = availableQuotes.find(q => q.id === quoteId);
                        const mappedCount = d.itemsWithSystemByQuote[quoteId] || 0;
                        return (
                          <div key={quoteId} className="pl-4 border-l-2 border-gray-300">
                            <div className="font-medium text-gray-900">{quote?.supplier_name || 'Unknown'}</div>
                            <div className="text-xs text-gray-600">
                              {count} items • {mappedCount} mapped to systems
                            </div>
                          </div>
                        );
                      })}
                      <div className="flex justify-between pt-2 border-t border-gray-300">
                        <span>Overlapping systems:</span>
                        <span className="font-medium">{d.overlappingSystemsCount}</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-center gap-3">
                  <a
                    href={actionUrl}
                    className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition-colors"
                  >
                    {actionText}
                  </a>
                  <button
                    onClick={() => {
                      console.clear();
                      console.log('═══════════════════════════════════════════════════');
                      console.log('🔍 SCOPE MATRIX DETAILED DIAGNOSTICS');
                      console.log('═══════════════════════════════════════════════════');
                      console.log('');
                      console.log('📊 Full diagnostics object:', diagnostics);
                      console.log('');
                      console.log('📋 Available quotes:', availableQuotes);
                      console.log('');
                      console.log('✅ Selected quote IDs:', selectedQuoteIds);
                      console.log('');
                      console.log('📦 Comparison data length:', comparisonData.length);
                      console.log('');
                      console.log('🎯 Matrix rows length:', matrixRows.length);
                      console.log('');
                      console.log('🏭 Suppliers:', suppliers);
                      console.log('');
                      console.log('═══════════════════════════════════════════════════');
                      alert('✅ Console cleared and diagnostic details logged!\n\nPress F12 or right-click > Inspect > Console to view the detailed information.');
                    }}
                    className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                  >
                    Show Console Details
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {hasGenerated && !loading && comparisonData.length > 0 && (
          <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
          >
            <Filter size={18} />
            Filters
            {hasActiveFilters && (
              <span className="ml-1 px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full">
                {Object.values(filters).filter(v => v).length}
              </span>
            )}
          </button>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
            >
              <X size={16} />
              Clear filters
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSuggestedSystems(true)}
            disabled={suggestions.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            <Lightbulb size={18} />
            Suggested Systems
            {suggestions.length > 0 && (
              <span className="ml-1 px-2 py-0.5 bg-purple-800 text-white text-xs rounded-full">
                {suggestions.length}
              </span>
            )}
          </button>
          <button
            onClick={exportToCSV}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            <Download size={18} />
            Export CSV
          </button>
          <button
            onClick={exportItemizedComparisonToExcel}
            disabled={matrixRows.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
            title={matrixRows.length === 0 ? 'Generate a scope matrix first to export itemized comparison' : 'Export Itemized Comparison to Excel'}
          >
            <FileSpreadsheet size={18} />
            Export Items (Excel)
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Section</label>
              <select
                value={filters.section || ''}
                onChange={(e) => setFilters({ ...filters, section: e.target.value || undefined })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All</option>
                {availableFilters.sections.map(section => (
                  <option key={section} value={section}>{section}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Service</label>
              <select
                value={filters.service || ''}
                onChange={(e) => setFilters({ ...filters, service: e.target.value || undefined })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All</option>
                {availableFilters.services.map(service => (
                  <option key={service} value={service}>{service}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Subclass</label>
              <select
                value={filters.subclass || ''}
                onChange={(e) => setFilters({ ...filters, subclass: e.target.value || undefined })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All</option>
                {availableFilters.subclasses.map(subclass => (
                  <option key={subclass} value={subclass}>{subclass}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">FRR</label>
              <select
                value={filters.frr || ''}
                onChange={(e) => setFilters({ ...filters, frr: e.target.value || undefined })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All</option>
                {availableFilters.frrs.map(frr => (
                  <option key={frr} value={frr}>{frr}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Size Bucket</label>
              <select
                value={filters.sizeBucket || ''}
                onChange={(e) => setFilters({ ...filters, sizeBucket: e.target.value || undefined })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All</option>
                {availableFilters.sizeBuckets.map(bucket => (
                  <option key={bucket} value={bucket}>{bucket}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-gray-900">Scope Matrix</h2>
            <div className="relative group">
              <Info size={18} className="text-gray-400 hover:text-gray-600 cursor-help" />
              <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block z-20 w-80 p-3 bg-gray-900 text-white text-sm rounded-lg shadow-lg">
                <div className="font-semibold mb-1">Scope Matrix</div>
                <div className="text-gray-200">
                  Compare supplier rates for each passive fire system and quickly see pricing differences and missing items.
                </div>
                <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-100 border-2 border-green-300 rounded"></div>
              <span className="text-gray-600">≤10%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-amber-100 border-2 border-amber-300 rounded"></div>
              <span className="text-gray-600">≤20%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-red-100 border-2 border-red-300 rounded"></div>
              <span className="text-gray-600">&gt;20%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-gray-100 border-2 border-gray-300 rounded"></div>
              <span className="text-gray-600">N/A</span>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-3 py-2 text-left font-medium text-gray-700 border border-gray-200 sticky left-0 bg-gray-50 z-10">
                  System
                </th>
                {suppliers.map(supplier => {
                  const detail = supplierDetails[supplier];
                  return (
                    <th key={supplier} className="px-3 py-2 text-center border border-gray-200 min-w-[120px]">
                      <div className="flex flex-col items-center gap-1">
                        <span className="font-medium text-gray-900">{supplier}</span>
                        {detail && (
                          <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                            detail.revisionNumber > 1
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {detail.revisionNumber > 1 ? `Rev ${detail.revisionNumber}` : 'Original'}
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {matrixRows.map((row, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-sm font-medium text-gray-900 border border-gray-200 sticky left-0 bg-white z-10">
                    <div className="flex flex-col">
                      <span className="font-semibold">{row.systemLabel}</span>
                      {row.systemId !== row.systemLabel && (
                        <span className="text-xs text-gray-500">{row.systemId}</span>
                      )}
                    </div>
                  </td>
                  {suppliers.map(supplier => {
                    const cell = row.cells[supplier];
                    if (!cell) {
                      return (
                        <td key={supplier} className="px-3 py-2 text-center border border-gray-200">
                          <span className="text-gray-400">-</span>
                        </td>
                      );
                    }

                    const hasMissingQty = itemsWithMissingQty.has(cell.quoteItemId);

                    return (
                      <td key={supplier} className="px-3 py-2 border border-gray-200">
                        <div className="relative group">
                          <div className={`px-2 py-1.5 rounded text-center font-medium border-2 ${getFlagColor(cell.flag)} flex items-center justify-center gap-1`}>
                            <span>{cell.unitRate !== null ? `$${cell.unitRate.toFixed(2)}` : 'N/A'}</span>
                            {hasMissingQty && (
                              <AlertCircle size={14} className="text-yellow-600" />
                            )}
                          </div>
                          <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block z-20 w-48 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-lg">
                            <div className="space-y-1">
                              {hasMissingQty && (
                                <div className="pb-2 mb-2 border-b border-gray-700 text-yellow-300 flex items-start gap-1">
                                  <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                                  <span>Quantity missing in source quote. Please review before finalising.</span>
                                </div>
                              )}
                              <div className="flex justify-between">
                                <span className="text-gray-300">Unit Rate:</span>
                                <span className="font-semibold">{cell.unitRate !== null ? `$${cell.unitRate.toFixed(2)}` : 'N/A'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-300">Model Rate:</span>
                                <span className="font-semibold">{cell.modelRate !== null ? `$${cell.modelRate.toFixed(2)}` : 'N/A'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-300">Variance:</span>
                                <span className="font-semibold">{cell.variancePct !== null ? `${cell.variancePct > 0 ? '+' : ''}${cell.variancePct.toFixed(1)}%` : 'N/A'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-300">Components:</span>
                                <span className="font-semibold">{cell.componentCount || 'N/A'}</span>
                              </div>
                            </div>
                            <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                          </div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {matrixRows.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No data matches the selected filters.
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-gray-200">
          <button
            onClick={() => setShowMoreInfo(!showMoreInfo)}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            {showMoreInfo ? (
              <>
                <ChevronUp size={16} />
                <span>Less Info</span>
              </>
            ) : (
              <>
                <ChevronDown size={16} />
                <span>More Info</span>
              </>
            )}
          </button>

          {showMoreInfo && (
            <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">How to Read This Matrix</h3>
              <p className="text-sm text-gray-700 leading-relaxed">
                This matrix compares each supplier's rates for the same passive fire systems so you can accurately assess scope and pricing differences. Every row is a system type, and each column shows how each supplier priced that system. Colour indicators highlight where prices vary, helping you quickly identify mismatches, missing items, and potential scope gaps.
              </p>
            </div>
          )}
        </div>
      </div>

            <WorkflowNav
              currentStep={4}
              totalSteps={6}
              onBack={onNavigateBack}
              onNext={onNavigateNext}
              backLabel="Back: Quote Intelligence"
              nextLabel="Next: Equalisation"
            />
          </div>
        )}
      </div>

      {showSuggestedSystems && (
        <SuggestedSystemsPanel
          projectId={projectId}
          organisationId={organisationId}
          onClose={() => setShowSuggestedSystems(false)}
          onSystemCreated={() => {
            loadData();
          }}
        />
      )}
    </div>
  );
}
