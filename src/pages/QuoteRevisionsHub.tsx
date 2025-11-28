import { useState, useEffect } from 'react';
import { FileText, Plus, ArrowLeft, Download, RefreshCw, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { RevisionImportModal } from '../components/RevisionImportModal';
import { RevisionDiffView } from '../components/RevisionDiffView';
import { RevisionTimeline } from '../components/RevisionTimeline';
import PageHeader from '../components/PageHeader';
import type { SupplierRevisionHistory, QuoteRevisionDiff } from '../types/revision.types';

interface QuoteRevisionsHubProps {
  projectId: string;
  projectName?: string;
}

export function QuoteRevisionsHub({ projectId, projectName }: QuoteRevisionsHubProps) {
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [supplierHistories, setSupplierHistories] = useState<SupplierRevisionHistory[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);
  const [selectedDiff, setSelectedDiff] = useState<QuoteRevisionDiff | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (projectId) {
      loadSupplierRevisions();
    }
  }, [projectId]);

  const loadSupplierRevisions = async () => {
    setIsLoading(true);
    try {
      // Fetch all quotes for this project
      const { data: quotes, error: quotesError } = await supabase
        .from('quotes')
        .select('*')
        .eq('project_id', projectId)
        .order('supplier_name')
        .order('revision_number');

      if (quotesError) throw quotesError;

      // Group by supplier
      const supplierMap = new Map<string, any>();

      quotes?.forEach((quote) => {
        if (!supplierMap.has(quote.supplier_name)) {
          supplierMap.set(quote.supplier_name, {
            supplier_name: quote.supplier_name,
            project_id: projectId,
            revisions: [],
            latest_revision: null,
            original_quote: null,
            timeline: [],
            total_revisions: 0,
            total_price_changes: 0,
            latest_total_price: 0,
            original_total_price: 0
          });
        }

        const supplierData = supplierMap.get(quote.supplier_name);
        supplierData.revisions.push(quote);

        if (quote.revision_number === 1) {
          supplierData.original_quote = quote;
          supplierData.original_total_price = quote.total_price || 0;
        }

        if (quote.is_latest) {
          supplierData.latest_revision = quote;
          supplierData.latest_total_price = quote.total_price || 0;
        }

        supplierData.total_revisions = supplierData.revisions.length;
      });

      // After processing all quotes, ensure latest_revision is set if is_latest flag is not set
      supplierMap.forEach((supplierData) => {
        if (!supplierData.latest_revision && supplierData.revisions.length > 0) {
          // Use the highest revision number as latest
          const sortedRevisions = [...supplierData.revisions].sort((a, b) =>
            (b.revision_number || 0) - (a.revision_number || 0)
          );
          supplierData.latest_revision = sortedRevisions[0];
          supplierData.latest_total_price = sortedRevisions[0].total_price || 0;
        }

        supplierData.total_price_changes =
          supplierData.latest_total_price - supplierData.original_total_price;
      });

      // Load timeline events for each supplier
      const { data: timelineEvents } = await supabase
        .from('quote_revision_timeline')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      timelineEvents?.forEach((event) => {
        const supplierData = supplierMap.get(event.supplier_name);
        if (supplierData) {
          supplierData.timeline.push(event);
        }
      });

      setSupplierHistories(Array.from(supplierMap.values()));
    } catch (error) {
      console.error('Error loading supplier revisions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewDiff = async (supplierName: string) => {
    const history = supplierHistories.find(h => h.supplier_name === supplierName);
    if (!history || history.total_revisions < 2 || !history.latest_revision || !history.original_quote) return;

    try {
      // Fetch line items for both quotes
      const { data: originalItems, error: originalError } = await supabase
        .from('quote_items')
        .select('*')
        .eq('quote_id', history.original_quote.id);

      if (originalError) throw originalError;

      const { data: latestItems, error: latestError } = await supabase
        .from('quote_items')
        .select('*')
        .eq('quote_id', history.latest_revision.id);

      if (latestError) throw latestError;

      // Generate diff between original and latest
      const { generateQuoteDiff } = await import('../lib/revision/revisionDiffEngine');

      const diff = await generateQuoteDiff(
        {
          id: history.original_quote.id,
          supplier_name: history.supplier_name,
          revision_number: history.original_quote.revision_number,
          total_price: history.original_quote.total_price,
          line_items: originalItems || []
        },
        {
          id: history.latest_revision.id,
          supplier_name: history.supplier_name,
          revision_number: history.latest_revision.revision_number,
          total_price: history.latest_revision.total_price,
          line_items: latestItems || []
        },
        projectId
      );

      setSelectedDiff(diff);
      setSelectedSupplier(supplierName);
    } catch (error) {
      console.error('Error generating diff:', error);
      alert('Failed to generate diff. Please try again.');
    }
  };

  const handleImportComplete = () => {
    setIsImportModalOpen(false);
    loadSupplierRevisions();
  };

  const handleDeleteRevision = async (supplierName: string, revisionNumber: number) => {
    if (!confirm(`Are you sure you want to delete version ${revisionNumber} of ${supplierName}? This cannot be undone.`)) {
      return;
    }

    try {
      console.log('Looking for quote:', { projectId, supplierName, revisionNumber });

      // Find the quote to delete
      const { data: quoteToDelete, error: fetchError } = await supabase
        .from('quotes')
        .select('id, parent_quote_id, revision_number')
        .eq('project_id', projectId)
        .eq('supplier_name', supplierName)
        .eq('revision_number', revisionNumber)
        .maybeSingle();

      console.log('Found quote:', quoteToDelete);
      if (fetchError) {
        console.error('Fetch error:', fetchError);
        throw fetchError;
      }
      if (!quoteToDelete) throw new Error('Quote not found');

      // Delete the quote (this will cascade to line_items and timeline events)
      console.log('Deleting quote:', quoteToDelete.id);
      const { error: deleteError } = await supabase
        .from('quotes')
        .delete()
        .eq('id', quoteToDelete.id);

      if (deleteError) {
        console.error('Delete error:', deleteError);
        throw deleteError;
      }

      console.log('Quote deleted successfully');

      // If this was the latest revision, mark the parent as latest
      if (quoteToDelete.parent_quote_id) {
        console.log('Updating parent quote:', quoteToDelete.parent_quote_id);
        const { error: updateError } = await supabase
          .from('quotes')
          .update({ is_latest: true })
          .eq('id', quoteToDelete.parent_quote_id);

        if (updateError) {
          console.error('Update error:', updateError);
        }
      }

      alert('Revision deleted successfully!');
      // Reload the data
      loadSupplierRevisions();
    } catch (error: any) {
      console.error('Error deleting revision:', error);
      alert(`Failed to delete revision: ${error.message || 'Unknown error'}`);
    }
  };

  if (selectedSupplier && selectedDiff) {
    const history = supplierHistories.find(h => h.supplier_name === selectedSupplier);

    return (
      <div className="min-h-screen bg-gray-50 pb-12">
        <PageHeader
          title={`${selectedSupplier} - Revision Analysis`}
          subtitle={projectName}
          onBack={() => {
            setSelectedSupplier(null);
            setSelectedDiff(null);
          }}
        />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 space-y-6">
          <RevisionDiffView diff={selectedDiff} />

          {history && <RevisionTimeline events={history.timeline} supplierName={selectedSupplier} />}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <PageHeader
        title="Quote Revisions & RFIs"
        subtitle={projectName || 'Track and compare quote revisions'}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        {/* Action Bar */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Supplier Revision History
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {supplierHistories.length} suppliers with revisions tracked
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => loadSupplierRevisions()}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>

            <button
              onClick={() => setIsImportModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              <Plus className="w-4 h-4" />
              Import Updated Quote / RFI
            </button>
          </div>
        </div>

        {/* Supplier Cards */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
            <p className="text-gray-600 mt-4">Loading revisions...</p>
          </div>
        ) : supplierHistories.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No Revisions Yet
            </h3>
            <p className="text-gray-600 mb-6">
              Import updated quotes or RFI responses to start tracking revisions
            </p>
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              <Plus className="w-5 h-5" />
              Import First Revision
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {supplierHistories.map((history) => {
              const hasRevisions = history.total_revisions > 1;
              const priceChangePercent = history.original_total_price > 0
                ? ((history.total_price_changes / history.original_total_price) * 100)
                : 0;
              const isPriceIncrease = history.total_price_changes > 0;

              return (
                <div
                  key={history.supplier_name}
                  className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg transition-shadow"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 text-lg">
                        {history.supplier_name}
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        {history.total_revisions} version{history.total_revisions !== 1 ? 's' : ''}
                      </p>
                    </div>

                    {hasRevisions && (
                      <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                        isPriceIncrease
                          ? 'bg-red-100 text-red-700'
                          : 'bg-green-100 text-green-700'
                      }`}>
                        {isPriceIncrease ? '+' : ''}{priceChangePercent.toFixed(1)}%
                      </div>
                    )}
                  </div>

                  <div className="space-y-3 mb-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Original (v1):</span>
                      <span className="font-medium text-gray-900">
                        ${history.original_total_price.toLocaleString()}
                      </span>
                    </div>

                    {hasRevisions && history.latest_revision && (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">
                            Latest (v{history.latest_revision.revision_number}):
                          </span>
                          <span className="font-medium text-gray-900">
                            ${history.latest_total_price.toLocaleString()}
                          </span>
                        </div>

                        <div className="flex justify-between text-sm pt-2 border-t border-gray-200">
                          <span className="text-gray-600">Total Change:</span>
                          <span className={`font-semibold ${
                            isPriceIncrease ? 'text-red-600' : 'text-green-600'
                          }`}>
                            {isPriceIncrease ? '+' : ''}
                            ${Math.abs(history.total_price_changes).toLocaleString()}
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  {history.latest_revision?.rfi_reference && (
                    <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                      <p className="text-xs text-orange-700 font-medium">
                        RFI: {history.latest_revision.rfi_reference}
                      </p>
                      {history.latest_revision.rfi_reason && (
                        <p className="text-xs text-orange-600 mt-1">
                          {history.latest_revision.rfi_reason}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleViewDiff(history.supplier_name)}
                      disabled={!hasRevisions}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                      View Diff
                    </button>

                    {hasRevisions && history.latest_revision && (
                      <button
                        onClick={() => handleDeleteRevision(history.supplier_name, history.latest_revision.revision_number)}
                        className="px-4 py-2 border border-red-300 rounded-lg text-red-700 hover:bg-red-50 font-medium text-sm"
                        title="Delete latest revision"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}

                    <button
                      className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium text-sm"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <RevisionImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        projectId={projectId}
        onImportComplete={handleImportComplete}
      />
    </div>
  );
}
