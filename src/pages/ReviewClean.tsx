import { useState, useEffect } from 'react';
import { Trash2, Edit2, Check, X, Wand2, AlertCircle, Target, Sparkles, Zap, Play, RefreshCw, ChevronDown, ChevronUp, CheckSquare, Square } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { normaliseUnit, normaliseNumber, deriveRate, deriveTotal } from '../lib/normaliser/unitNormaliser';
import { extractAttributes } from '../lib/normaliser/attributeExtractor';
import { calculateConfidence, getConfidenceColor, getConfidenceLabel } from '../lib/normaliser/confidenceScorer';
import { matchLineToSystem } from '../lib/mapping/systemMatcher';
import { SYSTEM_TEMPLATES } from '../lib/mapping/systemTemplates';
import WorkflowNav from '../components/WorkflowNav';
import { needsQuantity } from '../lib/quoteUtils';
import { getStatusColor, getStatusLabel, type QuoteStatus } from '../lib/quoteProcessing/quotePipeline';
import { QuoteRevisionsHub } from './QuoteRevisionsHub';
import ScoringWeightsEditor from '../components/ScoringWeightsEditor';
import type { DashboardMode } from '../App';

interface Quote {
  id: string;
  supplier_name: string;
  quote_reference: string;
  total_amount: number;
  items_count: number;
  status: string;
  is_selected: boolean;
  quoted_total?: number;
  reconciliation_status?: string;
  reconciliation_variance?: number;
  reconciliation_notes?: string;
}

interface QuoteItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  is_excluded: boolean;
  canonical_unit?: string;
  size?: string;
  frr?: string;
  service?: string;
  subclass?: string;
  material?: string;
  confidence?: number;
  issues?: any;
  system_id?: string;
  system_label?: string;
  system_confidence?: number;
  system_needs_review?: boolean;
  system_manual_override?: boolean;
  matched_factors?: any;
  missed_factors?: any;
  raw_description?: string;
  raw_unit?: string;
  normalized_description?: string;
  normalized_unit?: string;
  mapped_service_type?: string;
  mapped_system?: string;
  mapped_penetration?: string;
  mapping_confidence?: number;
}

interface ReviewCleanProps {
  projectId: string;
  onNavigateBack?: () => void;
  onNavigateNext?: () => void;
  dashboardMode?: DashboardMode;
}

const UNIT_NORMALISATION: Record<string, string> = {
  ea: "No",
  each: "No",
  nr: "No",
  no: "No",
  m: "lm",
  "linear meter": "lm",
  "lineal meter": "lm",
  meter: "lm",
  metres: "lm",
  meters: "lm",
};

function UnitCell({ rawUnit, normalizedUnit, canonicalUnit }: { rawUnit: string; normalizedUnit?: string; canonicalUnit?: string }) {
  const displayNormalized = normalizedUnit || canonicalUnit;
  const finalUnit = displayNormalized || UNIT_NORMALISATION[rawUnit.toLowerCase()] || rawUnit;
  const changed = displayNormalized
    ? displayNormalized.toLowerCase() !== rawUnit.toLowerCase()
    : UNIT_NORMALISATION[rawUnit.toLowerCase()] && UNIT_NORMALISATION[rawUnit.toLowerCase()] !== rawUnit;

  return (
    <div className="flex flex-col text-sm">
      <span className="font-medium text-gray-900">{finalUnit}</span>
      {changed && (
        <span className="text-[10px] text-slate-500">
          normalised from "{rawUnit}"
        </span>
      )}
    </div>
  );
}

function DescriptionCell({ rawDescription, normalizedDescription }: { rawDescription: string; normalizedDescription?: string }) {
  const finalDesc = normalizedDescription || rawDescription;
  const changed = normalizedDescription && normalizedDescription.trim() !== rawDescription.trim();

  return (
    <div className="flex flex-col text-sm">
      <span className="font-medium text-gray-900">{finalDesc}</span>
      {changed && (
        <span className="text-[11px] text-slate-500">
          original: {rawDescription}
        </span>
      )}
    </div>
  );
}

function AttributesCell({
  mappedServiceType,
  mappedSystem,
  mappedPenetration,
  mappingConfidence,
  size,
  frr,
  service,
  subclass,
  material,
}: {
  mappedServiceType?: string;
  mappedSystem?: string;
  mappedPenetration?: string;
  mappingConfidence?: number;
  size?: string;
  frr?: string;
  service?: string;
  subclass?: string;
  material?: string;
}) {
  const hasNewMapping = mappedServiceType || mappedSystem || mappedPenetration;

  return (
    <div className="text-xs space-y-1 break-words">
      {hasNewMapping ? (
        <div className="flex flex-wrap gap-1">
          {mappedServiceType && (
            <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-semibold break-words border border-blue-500/30">
              {mappedServiceType}
            </span>
          )}
          {mappedSystem && (
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold break-words border border-emerald-500/30">
              {mappedSystem}
            </span>
          )}
          {mappedPenetration && (
            <span className="px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-300 font-semibold break-words border border-pink-500/30">
              {mappedPenetration}
            </span>
          )}
          {typeof mappingConfidence === "number" && (
            <span className="px-2 py-0.5 rounded-full bg-slate-700 text-slate-200 font-semibold border border-slate-600">
              {(mappingConfidence * 100).toFixed(0)}%
            </span>
          )}
        </div>
      ) : (
        <>
          {size && <div className="text-gray-900 font-medium break-words">Size: <span className="font-semibold">{size}</span></div>}
          {frr && <div className="text-gray-900 font-medium break-words">FRR: <span className="font-semibold">{frr}</span></div>}
          {service && <div className="text-blue-800 font-medium break-words">Service: <span className="font-semibold">{service}</span></div>}
          {subclass && <div className="text-gray-900 font-medium break-words">Type: <span className="font-semibold">{subclass}</span></div>}
          {material && <div className="text-gray-900 font-medium break-words">Material: <span className="font-semibold">{material}</span></div>}
        </>
      )}
    </div>
  );
}

export default function ReviewClean({ projectId, onNavigateBack, onNavigateNext, dashboardMode = 'original' }: ReviewCleanProps) {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [cleanableQuotes, setCleanableQuotes] = useState<Quote[]>([]);
  const [selectedQuote, setSelectedQuote] = useState<string | null>(null);
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<QuoteItem>>({});
  const [loading, setLoading] = useState(true);
  const [normalising, setNormalising] = useState(false);
  const [mapping, setMapping] = useState(false);
  const [smartCleaning, setSmartCleaning] = useState(false);
  const [processingAllQuotes, setProcessingAllQuotes] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [showIssues, setShowIssues] = useState<string | null>(null);
  const [showMatchDetails, setShowMatchDetails] = useState<string | null>(null);
  const [isTableExpanded, setIsTableExpanded] = useState(false);
  const availableSystems = SYSTEM_TEMPLATES;

  const updateProjectTimestamp = async () => {
    await supabase
      .from('projects')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', projectId);
  };

  const markReviewCleanComplete = async () => {
    try {
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
            review_clean_completed: true,
          },
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'project_id'
        });
    } catch (error) {
      console.error('Error marking Review & Clean as complete:', error);
    }
  };

  useEffect(() => {
    loadQuotes();
  }, [projectId, dashboardMode]);

  useEffect(() => {
    if (selectedQuote) {
      loadItems(selectedQuote);
    }
  }, [selectedQuote]);

  const loadQuotes = async () => {
    setLoading(true);

    // Filter quotes based on dashboard mode
    const { data: allQuotes, error } = await supabase
      .from('quotes')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (!error && allQuotes) {
      // Filter quotes by revision number, treating NULL as revision 1
      const filteredQuotes = allQuotes.filter(q => {
        const revisionNumber = q.revision_number ?? 1;
        if (dashboardMode === 'original') {
          return revisionNumber === 1;
        } else {
          return revisionNumber > 1;
        }
      });

      setQuotes(filteredQuotes);

      const { data: jobsData } = await supabase
        .from('parsing_jobs')
        .select('quote_id, status, error_message, result_data')
        .eq('project_id', projectId);

      const jobMap = new Map();
      if (jobsData) {
        jobsData.forEach(job => {
          if (job.quote_id) {
            jobMap.set(job.quote_id, job);
          }
        });
      }

      const filtered = filteredQuotes.filter(quote => {
        const job = jobMap.get(quote.id);
        const itemCount = quote.items_count || 0;

        if (itemCount === 0) return false;

        if (job) {
          const hasFailedChunks = job.error_message?.includes('chunks failed') || false;
          const jobFailed = job.status === 'failed';

          if (jobFailed || hasFailedChunks) return false;
        }

        return true;
      });

      setCleanableQuotes(filtered);

      if (filtered.length > 0 && !selectedQuote) {
        setSelectedQuote(filtered[0].id);
      } else if (filtered.length === 0) {
        setSelectedQuote(null);
      } else if (selectedQuote && !filtered.find(q => q.id === selectedQuote)) {
        setSelectedQuote(filtered[0].id);
      }
    }
    setLoading(false);
  };

  const loadItems = async (quoteId: string) => {
    console.log('loadItems: Loading items for quote', quoteId);
    const { data, error } = await supabase
      .from('quote_items')
      .select('*')
      .eq('quote_id', quoteId)
      .order('created_at', { ascending: true });

    if (!error && data) {
      console.log('loadItems: Loaded', data.length, 'items');
      if (data.length > 0) {
        console.log('loadItems: First item sample:', {
          id: data[0].id,
          size: data[0].size,
          frr: data[0].frr,
          service: data[0].service,
          confidence: data[0].confidence,
          system_label: data[0].system_label
        });
      }
      setItems(data);
    } else if (error) {
      console.error('loadItems: Error loading items:', error);
    }
  };

  const normaliseAllItems = async (itemsToProcess?: QuoteItem[]) => {
    if (!selectedQuote) {
      console.error('normaliseAllItems: No selectedQuote');
      return;
    }

    setNormalising(true);
    setMessage({ type: 'info', text: 'Normalising items...' });

    const targetItems = itemsToProcess || items;
    console.log('normaliseAllItems: Processing', targetItems.length, 'items');

    try {
      const updates = targetItems.map(item => {
        const qty = normaliseNumber(item.quantity);
        const rate = normaliseNumber(item.unit_price);
        let total = normaliseNumber(item.total_price);

        const derivedRate = deriveRate(total, qty);
        const derivedTotal = deriveTotal(qty, rate);

        const finalRate = rate || derivedRate;
        const finalTotal = total || derivedTotal;

        const unitResult = normaliseUnit(item.unit);
        const attributes = extractAttributes(item.description);

        if (targetItems.indexOf(item) === 0) {
          console.log('normaliseAllItems: First item description:', item.description);
          console.log('normaliseAllItems: First item attributes:', attributes);
        }

        const { confidence, issues } = calculateConfidence(
          item.description,
          qty,
          item.unit,
          unitResult.canonical,
          finalRate,
          finalTotal,
          attributes.confidence
        );

        return {
          id: item.id,
          quantity: qty || item.quantity,
          unit_price: finalRate || item.unit_price,
          total_price: finalTotal || item.total_price,
          canonical_unit: unitResult.canonical || '',
          size: attributes.size || '',
          frr: attributes.frr || '',
          service: attributes.service || '',
          subclass: attributes.subclass || '',
          material: attributes.material || '',
          confidence,
          issues: JSON.stringify(issues),
        };
      });

      console.log('normaliseAllItems: Saving', updates.length, 'updates to database');
      console.log('normaliseAllItems: Sample update:', updates[0]);

      for (let i = 0; i < updates.length; i++) {
        const update = updates[i];
        const { id, ...data } = update;

        if (i === 0) {
          console.log('normaliseAllItems: First update ID:', id);
          console.log('normaliseAllItems: First update data:', JSON.stringify(data, null, 2));
        }

        const { error } = await supabase
          .from('quote_items')
          .update(data)
          .eq('id', id);

        if (error) {
          console.error('normaliseAllItems: Error updating item', id, error);
        } else if (i === 0) {
          console.log('normaliseAllItems: First item updated successfully');
        }
      }

      console.log('normaliseAllItems: All database updates complete');

      await updateProjectTimestamp();
      await loadItems(selectedQuote);
      await loadQuotes();

      const lowConfidenceCount = updates.filter(u => u.confidence < 0.6).length;
      console.log('normaliseAllItems: Complete!', updates.length, 'items,', lowConfidenceCount, 'low confidence');
      setMessage({
        type: 'success',
        text: `Normalisation complete! ${updates.length} items processed. ${lowConfidenceCount} items need review.`
      });
    } catch (error) {
      console.error('Normalisation error:', error);
      setMessage({ type: 'error', text: 'Failed to normalise items. Please try again.' });
    } finally {
      setNormalising(false);
    }
  };

  const mapAllItemsToSystems = async (itemsToProcess?: QuoteItem[]) => {
    if (!selectedQuote) {
      console.error('mapAllItemsToSystems: No selectedQuote');
      return;
    }

    setMapping(true);
    setMessage({ type: 'info', text: 'Mapping items to systems...' });

    const targetItems = itemsToProcess || items;
    console.log('mapAllItemsToSystems: Processing', targetItems.length, 'items');

    try {
      const updates = targetItems.map(item => {
        const mappingResult = matchLineToSystem({
          description: item.description,
          size: item.size,
          frr: item.frr,
          service: item.service,
          subclass: item.subclass,
          material: item.material,
        });

        return {
          id: item.id,
          system_id: mappingResult.systemId || null,
          system_label: mappingResult.systemLabel || null,
          system_confidence: mappingResult.confidence,
          system_needs_review: mappingResult.needsReview,
          system_manual_override: false,
          matched_factors: JSON.stringify(mappingResult.matchedFactors),
          missed_factors: JSON.stringify(mappingResult.missedFactors),
        };
      });

      console.log('mapAllItemsToSystems: Saving', updates.length, 'updates to database');
      console.log('mapAllItemsToSystems: Sample update:', updates[0]);
      const updatesWithSystem = updates.filter(u => u.system_id);
      console.log('mapAllItemsToSystems: Items with system_id:', updatesWithSystem.length, '/', updates.length);

      for (const update of updates) {
        const { id, ...data } = update;
        const { error } = await supabase
          .from('quote_items')
          .update(data)
          .eq('id', id);

        if (error) {
          console.error('mapAllItemsToSystems: Error updating item', id, error);
        }
      }

      console.log('mapAllItemsToSystems: Database updates complete. Verifying...');

      const { data: verifyData, error: verifyError } = await supabase
        .from('quote_items')
        .select('id, description, system_id, system_label, size, frr, service, subclass')
        .eq('quote_id', selectedQuote)
        .limit(5);

      if (verifyData) {
        console.log('mapAllItemsToSystems: Verification - Sample saved items:', verifyData);
        const savedWithSystem = verifyData.filter(item => item.system_id);
        console.log('mapAllItemsToSystems: Verification - Items with system_id:', savedWithSystem.length, '/', verifyData.length);
      }

      await updateProjectTimestamp();
      await loadItems(selectedQuote);
      await markReviewCleanComplete();

      const needsReviewCount = updates.filter(u => u.system_needs_review).length;
      const mappedCount = updates.filter(u => u.system_id).length;
      console.log('mapAllItemsToSystems: Complete!', mappedCount, '/', updates.length, 'mapped,', needsReviewCount, 'need review');
      setMessage({
        type: 'success',
        text: `Mapping complete! ${mappedCount}/${updates.length} items mapped. ${needsReviewCount} need review.`
      });
    } catch (error) {
      console.error('Mapping error:', error);
      setMessage({ type: 'error', text: 'Failed to map items to systems. Please try again.' });
    } finally {
      setMapping(false);
    }
  };

  const smartClean = async (itemsToProcess?: QuoteItem[]) => {
    console.log('=== smartClean called ===');
    console.log('selectedQuote:', selectedQuote);
    console.log('normalising:', normalising, 'mapping:', mapping, 'smartCleaning:', smartCleaning);
    console.log('itemsToProcess:', itemsToProcess?.length, 'items:', items.length);

    if (!selectedQuote || normalising || mapping || smartCleaning) {
      console.log('Exit: Early return condition met');
      return;
    }

    console.log('smartClean: Starting processing');
    setSmartCleaning(true);
    setMessage({ type: 'info', text: 'Step 1/2: Normalising items...' });

    const targetItems = itemsToProcess || items;
    console.log('smartClean: Will process', targetItems.length, 'items');

    try {
      let normaliseSuccess = true;

      try {
        await normaliseAllItems(targetItems);
      } catch (error) {
        console.error('Normalise step failed:', error);
        setMessage({ type: 'error', text: 'Normalise failed — please try again.' });
        normaliseSuccess = false;
      }

      if (!normaliseSuccess) {
        return;
      }

      setMessage({ type: 'info', text: 'Step 2/2: Mapping items to systems...' });

      await new Promise(resolve => setTimeout(resolve, 200));

      const { data: refreshedItems } = await supabase
        .from('quote_items')
        .select('*')
        .eq('quote_id', selectedQuote)
        .order('created_at', { ascending: true });

      let mappingSuccess = true;

      try {
        await mapAllItemsToSystems(refreshedItems || targetItems);
      } catch (error) {
        console.error('Mapping step failed:', error);
        setMessage({ type: 'error', text: 'System mapping failed — please review items.' });
        mappingSuccess = false;
      }

      if (!mappingSuccess) {
        return;
      }

      setMessage({
        type: 'success',
        text: 'Smart Clean complete! All items normalised and mapped.'
      });
    } catch (error) {
      console.error('Smart Clean error:', error);
      setMessage({ type: 'error', text: 'Smart Clean failed. Please try individual steps.' });
    } finally {
      setSmartCleaning(false);
    }
  };

  const handleCleanAndMapSelectedQuote = async () => {
    console.log('=== handleCleanAndMapSelectedQuote called ===');
    console.log('selectedQuote:', selectedQuote);
    console.log('normalising:', normalising, 'mapping:', mapping, 'smartCleaning:', smartCleaning);
    console.log('items.length:', items.length);

    if (!selectedQuote) {
      console.log('Exit: No selectedQuote');
      return;
    }
    if (normalising || mapping || smartCleaning) {
      console.log('Exit: Already processing');
      return;
    }

    const quoteData = quotes.find(q => q.id === selectedQuote);
    if (!quoteData) {
      console.log('Exit: No quoteData found');
      return;
    }

    if (!quoteData.is_selected) {
      setMessage({ type: 'error', text: 'Please select this quote before processing.' });
      return;
    }

    console.log('Starting processing for:', quoteData.supplier_name);
    setMessage({ type: 'info', text: `Processing "${quoteData.supplier_name}"...` });

    try {
      await supabase
        .from('quotes')
        .update({ status: 'processing' })
        .eq('id', selectedQuote);

      await smartClean(items);

      await supabase
        .from('quotes')
        .update({ status: 'ready' })
        .eq('id', selectedQuote);

      await loadQuotes();
      await loadItems(selectedQuote);
      setMessage({ type: 'success', text: `"${quoteData.supplier_name}" processed successfully!` });
    } catch (error) {
      console.error('Clean & Map error:', error);
      await supabase
        .from('quotes')
        .update({
          status: 'error'
        })
        .eq('id', selectedQuote);

      await loadQuotes();
      setMessage({ type: 'error', text: `Failed to process "${quoteData.supplier_name}"` });
    } finally {
      setSmartCleaning(false);
    }
  };

  const handleProcessAllPendingQuotes = async () => {
    if (normalising || mapping || smartCleaning || processingAllQuotes) return;

    const selectedQuotes = cleanableQuotes.filter(q => q.is_selected);

    if (selectedQuotes.length === 0) {
      setMessage({ type: 'error', text: 'Please select at least one quote to process.' });
      return;
    }

    const pendingQuotes = selectedQuotes.filter(q =>
      q.status === 'imported' || q.status === 'pending' || q.status === 'error'
    );

    if (pendingQuotes.length === 0) {
      setMessage({ type: 'info', text: 'No pending quotes to process in selection.' });
      return;
    }

    console.log('========== PROCESS PENDING QUOTES STARTED ==========');
    console.log('Processing', pendingQuotes.length, 'pending quotes');

    setProcessingAllQuotes(true);

    try {
      for (let i = 0; i < pendingQuotes.length; i++) {
        const quote = pendingQuotes[i];
        console.log(`\n--- Processing quote ${i + 1}/${pendingQuotes.length}: ${quote.supplier_name} ---`);
        setMessage({ type: 'info', text: `Processing quote ${i + 1}/${pendingQuotes.length}: ${quote.supplier_name}` });

        setSelectedQuote(quote.id);

        await supabase
          .from('quotes')
          .update({ status: 'processing' })
          .eq('id', quote.id);

        const { data: quoteItems } = await supabase
          .from('quote_items')
          .select('*')
          .eq('quote_id', quote.id)
          .order('created_at', { ascending: true });

        if (!quoteItems || quoteItems.length === 0) {
          console.warn(`No items found for quote ${quote.supplier_name}`);
          await supabase
            .from('quotes')
            .update({ status: 'error' })
            .eq('id', quote.id);
          continue;
        }

        console.log('Loaded', quoteItems.length, 'items for quote', quote.supplier_name);
        setItems(quoteItems);

        try {
          await smartClean(quoteItems);
          await supabase
            .from('quotes')
            .update({ status: 'ready' })
            .eq('id', quote.id);
          console.log('Successfully processed quote:', quote.supplier_name);
        } catch (error) {
          console.error(`Processing failed for quote ${quote.supplier_name}:`, error);
          await supabase
            .from('quotes')
            .update({
              status: 'error'
            })
            .eq('id', quote.id);
        }
      }

      console.log('\n========== PROCESS PENDING QUOTES COMPLETE ==========');

      if (selectedQuote) {
        await loadItems(selectedQuote);
      }
      await loadQuotes();

      setMessage({ type: 'success', text: `All ${pendingQuotes.length} pending quotes processed.` });
    } catch (error) {
      console.error('Process All Pending error:', error);
      setMessage({ type: 'error', text: 'Failed to process all quotes. Some quotes may have been processed.' });
    } finally {
      setProcessingAllQuotes(false);
    }
  };

  const processAllQuotes = async () => {
    await handleProcessAllPendingQuotes();
  };

  const handleSystemOverride = async (itemId: string, systemId: string) => {
    const system = availableSystems.find(s => s.id === systemId);
    if (!system) return;

    const { error } = await supabase
      .from('quote_items')
      .update({
        system_id: systemId,
        system_label: system.label,
        system_manual_override: true,
        system_needs_review: false,
      })
      .eq('id', itemId);

    if (!error && selectedQuote) {
      await updateProjectTimestamp();
      loadItems(selectedQuote);
    }
  };

  const startEdit = (item: QuoteItem) => {
    setEditingItem(item.id);
    setEditForm({
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unit_price: item.unit_price,
      canonical_unit: item.canonical_unit,
      size: item.size,
      frr: item.frr,
      service: item.service,
      subclass: item.subclass,
      material: item.material,
    });
  };

  const cancelEdit = () => {
    setEditingItem(null);
    setEditForm({});
  };

  const saveEdit = async (itemId: string) => {
    const totalPrice = (editForm.quantity || 0) * (editForm.unit_price || 0);

    const unitResult = normaliseUnit(editForm.unit);
    const attributes = extractAttributes(editForm.description || '');

    const { confidence, issues } = calculateConfidence(
      editForm.description,
      editForm.quantity,
      editForm.unit,
      editForm.canonical_unit as any || unitResult.canonical,
      editForm.unit_price,
      totalPrice,
      attributes.confidence
    );

    const { error } = await supabase
      .from('quote_items')
      .update({
        ...editForm,
        total_price: totalPrice,
        canonical_unit: editForm.canonical_unit || unitResult.canonical || '',
        confidence,
        issues: JSON.stringify(issues),
      })
      .eq('id', itemId);

    if (!error) {
      await updateProjectTimestamp();
      setEditingItem(null);
      setEditForm({});
      loadItems(selectedQuote!);
      loadQuotes();
    }
  };

  const toggleExclude = async (itemId: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from('quote_items')
      .update({ is_excluded: !currentStatus })
      .eq('id', itemId);

    if (!error && selectedQuote) {
      await updateProjectTimestamp();
      loadItems(selectedQuote);
    }
  };

  const deleteItem = async (itemId: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return;

    const { error } = await supabase
      .from('quote_items')
      .delete()
      .eq('id', itemId);

    if (!error && selectedQuote) {
      await updateProjectTimestamp();
      loadItems(selectedQuote);
      loadQuotes();
    }
  };

  const deleteQuote = async (quoteId: string) => {
    if (!confirm('Are you sure you want to delete this entire quote?')) return;

    try {
      // First, get the quote details before deletion
      const { data: quoteToDelete, error: fetchError } = await supabase
        .from('quotes')
        .select('supplier_name, project_id, is_latest, created_at')
        .eq('id', quoteId)
        .single();

      if (fetchError || !quoteToDelete) {
        console.error('Error fetching quote details:', fetchError);
        alert('Failed to fetch quote details');
        return;
      }

      // If this quote is marked as latest, find and update the previous quote from same supplier
      if (quoteToDelete.is_latest) {
        const { data: previousQuotes, error: prevError } = await supabase
          .from('quotes')
          .select('id')
          .eq('supplier_name', quoteToDelete.supplier_name)
          .eq('project_id', quoteToDelete.project_id)
          .neq('id', quoteId)
          .order('created_at', { ascending: false })
          .limit(1);

        if (!prevError && previousQuotes && previousQuotes.length > 0) {
          // Update the previous quote to be the latest
          const { error: updateError } = await supabase
            .from('quotes')
            .update({ is_latest: true })
            .eq('id', previousQuotes[0].id);

          if (updateError) {
            console.error('Error updating previous quote:', updateError);
          }
        }
      }

      // Now delete the quote
      const { error: deleteError } = await supabase
        .from('quotes')
        .delete()
        .eq('id', quoteId);

      if (deleteError) {
        console.error('Error deleting quote:', deleteError);
        alert('Failed to delete quote');
        return;
      }

      // Update UI state
      if (selectedQuote === quoteId) {
        setSelectedQuote(null);
        setItems([]);
      }

      // Reload the quotes list
      loadQuotes();
    } catch (error) {
      console.error('Error in deleteQuote:', error);
      alert('An unexpected error occurred while deleting the quote');
    }
  };

  const toggleQuoteSelection = async (quoteId: string, currentSelection: boolean) => {
    const { error } = await supabase
      .from('quotes')
      .update({ is_selected: !currentSelection })
      .eq('id', quoteId);

    if (!error) {
      await loadQuotes();
    }
  };

  const selectAllQuotes = async () => {
    const { error } = await supabase
      .from('quotes')
      .update({ is_selected: true })
      .eq('project_id', projectId);

    if (!error) {
      await loadQuotes();
      setMessage({ type: 'success', text: 'All quotes selected' });
    }
  };

  const deselectAllQuotes = async () => {
    const { error } = await supabase
      .from('quotes')
      .update({ is_selected: false })
      .eq('project_id', projectId);

    if (!error) {
      await loadQuotes();
      setMessage({ type: 'success', text: 'All quotes deselected' });
    }
  };

  const getConfidenceBadge = (confidence?: number) => {
    if (confidence === undefined || confidence === 0) {
      return (
        <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-slate-700 text-slate-300 border border-slate-600">
          Not analysed
        </span>
      );
    }

    const color = getConfidenceColor(confidence);
    const label = getConfidenceLabel(confidence);
    const colorClasses = {
      green: 'bg-green-500/20 text-green-300 border border-green-500/30',
      amber: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30',
      red: 'bg-red-500/20 text-red-300 border border-red-500/30',
    };

    return (
      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${colorClasses[color as keyof typeof colorClasses]}`}>
        {label} ({Math.round(confidence * 100)}%)
      </span>
    );
  };

  const parseIssues = (issuesData: any): string[] => {
    if (!issuesData) return [];
    if (typeof issuesData === 'string') {
      try {
        return JSON.parse(issuesData);
      } catch {
        return [];
      }
    }
    if (Array.isArray(issuesData)) return issuesData;
    return [];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading quotes...</div>
      </div>
    );
  }

  if (quotes.length === 0) {
    return (
      <div className="bg-slate-800/60 rounded-lg shadow-sm border border-slate-700 p-12 text-center">
        <p className="text-slate-400 text-lg">No quotes imported yet.</p>
        <p className="text-slate-500 mt-2">Go to Import Quotes to add your first quote.</p>
      </div>
    );
  }

  const selectedQuoteData = quotes.find(q => q.id === selectedQuote);
  const showReconciliationAlert = selectedQuoteData?.reconciliation_status === 'failed';

  return (
    <div className="space-y-6">
      {showReconciliationAlert && selectedQuoteData && (
        <div className="bg-red-500/20 border-2 border-red-500/50 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle size={24} className="text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-bold text-red-300 text-lg">⚠️ Totals Reconciliation Failed</h4>
              <p className="text-red-300 mt-1">{selectedQuoteData.reconciliation_notes}</p>
              <p className="text-red-700 mt-2 text-sm">
                <strong>Variance:</strong> {((selectedQuoteData.reconciliation_variance || 0) * 100).toFixed(2)}%
                {selectedQuoteData.quoted_total && (
                  <>
                    {' | '}
                    <strong>PDF Total:</strong> ${selectedQuoteData.quoted_total.toLocaleString()}
                    {' | '}
                    <strong>Extracted Total:</strong> ${selectedQuoteData.total_amount.toLocaleString()}
                  </>
                )}
              </p>
              <p className="text-red-300 mt-3 font-medium">
                This quote requires manual review. Possible causes: column swap, missing items, or incorrect extraction.
              </p>
            </div>
          </div>
        </div>
      )}

      {message && (
        <div className={`p-4 rounded-md ${
          message.type === 'success' ? 'bg-green-500/20 text-green-300 border border-green-500/30' :
          message.type === 'error' ? 'bg-red-500/20 text-red-300 border border-red-500/30' :
          'bg-blue-500/20 text-blue-300 border border-blue-500/30'
        }`}>
          <div className="flex items-start gap-2">
            <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
            <span>{message.text}</span>
          </div>
        </div>
      )}

      {cleanableQuotes.length === 0 && !loading ? (
        <div className="bg-slate-800/60 rounded-lg border border-slate-700 p-12 text-center">
          <AlertCircle className="mx-auto text-slate-400 mb-4" size={48} />
          <h3 className="text-xl font-bold text-slate-100 mb-2">No quotes ready to clean</h3>
          <p className="text-slate-400 mb-6">
            Import supplier quotes or fix failed imports on the Import Quotes page before continuing.
          </p>
          <button
            onClick={() => window.location.href = '#/import'}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition-colors"
          >
            Go to Import Quotes
          </button>
          <p className="text-xs text-slate-500 mt-4">
            Only successfully imported quotes with line items will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Scoring & Weighting Criteria Section */}
          <ScoringWeightsEditor projectId={projectId} />

          {/* Quotes Section - Horizontal Display */}
          <div className="bg-slate-800/60 rounded-lg shadow-sm border border-slate-700">
            <div className="p-4 border-b border-slate-700">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-slate-100">Quotes</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    {cleanableQuotes.filter(q => q.is_selected).length} of {cleanableQuotes.length} quotes selected
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={selectAllQuotes}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 rounded-md transition-colors"
                  >
                    <CheckSquare size={14} />
                    Select All
                  </button>
                  <button
                    onClick={deselectAllQuotes}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 rounded-md transition-colors"
                  >
                    <Square size={14} />
                    Deselect All
                  </button>
                </div>
              </div>
            </div>
            <div className="p-4">
              <div className="flex gap-4 overflow-x-auto pb-2">
                {cleanableQuotes.map((quote) => (
                  <div
                    key={quote.id}
                    className={`flex-shrink-0 w-64 rounded-lg border-2 transition-all ${
                      selectedQuote === quote.id
                        ? 'bg-slate-700/70 border-blue-500 shadow-lg shadow-blue-500/20'
                        : 'bg-slate-800/40 border-slate-600 hover:bg-slate-700/50 hover:border-slate-500'
                    } ${quote.is_selected ? 'ring-2 ring-green-500/30' : ''}`}
                  >
                    <div className="p-4">
                      <div className="flex items-start gap-3 mb-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleQuoteSelection(quote.id, quote.is_selected);
                          }}
                          className="flex-shrink-0 mt-0.5"
                        >
                          {quote.is_selected ? (
                            <CheckSquare size={20} className="text-green-400" />
                          ) : (
                            <Square size={20} className="text-slate-500 hover:text-slate-300" />
                          )}
                        </button>
                        <div
                          className="flex-1 min-w-0 cursor-pointer"
                          onClick={() => setSelectedQuote(quote.id)}
                        >
                          <p className="font-semibold text-slate-100 text-sm truncate">{quote.supplier_name}</p>
                          <p className="text-xs text-slate-400 truncate mt-0.5">{quote.quote_reference || 'No reference'}</p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteQuote(quote.id);
                          }}
                          className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-500/10 rounded transition-colors flex-shrink-0"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div
                        className="flex items-center justify-between cursor-pointer"
                        onClick={() => setSelectedQuote(quote.id)}
                      >
                        <span className="text-lg font-bold text-slate-100">
                          ${quote.total_amount.toLocaleString()}
                        </span>
                        <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-green-500/20 text-green-300 border border-green-500/30">
                          Ready
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Main Table - Full Width */}
          <div>
          <div className="bg-slate-800/60 rounded-lg shadow-sm border border-slate-700">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Review & Clean {selectedQuoteData && `– ${selectedQuoteData.supplier_name}`}
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Normalise, clean and map items for this supplier quote.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCleanAndMapSelectedQuote}
                    disabled={smartCleaning || normalising || mapping || !selectedQuote || items.length === 0 || !selectedQuoteData?.is_selected}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed text-sm font-medium"
                    title={selectedQuoteData && !selectedQuoteData.is_selected ? "Please select this quote first" : "Run normalisation and mapping for this quote"}
                  >
                    <Play size={16} />
                    {smartCleaning ? 'Processing...' : 'Clean & Map Quote'}
                  </button>
                  <button
                    onClick={handleProcessAllPendingQuotes}
                    disabled={processingAllQuotes || normalising || mapping || smartCleaning || cleanableQuotes.filter(q => q.is_selected).length === 0}
                    className="flex items-center gap-2 px-3 py-2 border border-slate-600 text-slate-300 rounded-md hover:bg-slate-700 transition-colors disabled:bg-slate-800 disabled:cursor-not-allowed text-sm"
                    title={cleanableQuotes.filter(q => q.is_selected).length === 0 ? "Please select at least one quote" : "Process all selected pending/error quotes"}
                  >
                    <Zap size={14} />
                    {processingAllQuotes ? 'Processing...' : 'Run for All Pending'}
                  </button>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full table-auto">
                <thead className="bg-slate-900/50 border-b border-slate-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase min-w-[250px]">Description</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-20">Qty</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-24">Unit</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-28">Rate</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-28">Total</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase min-w-[180px]">Attributes</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase min-w-[200px]">Suggest System</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-32">Confidence</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-28">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase w-32">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {(isTableExpanded ? items : items.slice(0, 5)).map((item) => {
                    const issues = parseIssues(item.issues);
                    return (
                      <tr key={item.id} className={item.is_excluded ? 'bg-slate-800/30 opacity-60' : ''}>
                        {editingItem === item.id ? (
                          <>
                            <td className="px-4 py-3">
                              <input
                                type="text"
                                value={editForm.description || ''}
                                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm text-gray-900"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="number"
                                value={editForm.quantity || ''}
                                onChange={(e) => setEditForm({ ...editForm, quantity: parseFloat(e.target.value) || 0 })}
                                className="w-20 px-2 py-1 border border-gray-300 rounded text-sm text-gray-900"
                                step="0.01"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="text"
                                value={editForm.unit || ''}
                                onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}
                                className="w-20 px-2 py-1 border border-gray-300 rounded text-sm text-gray-900"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="number"
                                value={editForm.unit_price || ''}
                                onChange={(e) => setEditForm({ ...editForm, unit_price: parseFloat(e.target.value) || 0 })}
                                className="w-24 px-2 py-1 border border-gray-300 rounded text-sm text-gray-900"
                                step="0.01"
                              />
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              ${((editForm.quantity || 0) * (editForm.unit_price || 0)).toFixed(2)}
                            </td>
                            <td className="px-4 py-3">
                              <div className="text-xs space-y-1">
                                {editForm.canonical_unit && <div>Unit: {editForm.canonical_unit}</div>}
                                {editForm.service && <div>Service: {editForm.service}</div>}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-sm text-gray-500">Editing...</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-sm text-gray-500">Editing</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-sm text-gray-500">-</span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => saveEdit(item.id)}
                                  className="p-1 text-green-400 hover:bg-green-500/10 rounded"
                                >
                                  <Check size={18} />
                                </button>
                                <button
                                  onClick={cancelEdit}
                                  className="p-1 text-red-400 hover:bg-red-500/10 rounded"
                                >
                                  <X size={18} />
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <DescriptionCell
                                  rawDescription={item.raw_description || item.description}
                                  normalizedDescription={item.normalized_description}
                                />
                                {needsQuantity(item) && (
                                  <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 whitespace-nowrap">
                                    Needs quantity
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900">{item.quantity}</td>
                            <td className="px-4 py-3">
                              <UnitCell
                                rawUnit={item.raw_unit || item.unit}
                                normalizedUnit={item.normalized_unit}
                                canonicalUnit={item.canonical_unit}
                              />
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900">${item.unit_price.toFixed(2)}</td>
                            <td className="px-4 py-3 text-sm text-gray-900">${item.total_price.toFixed(2)}</td>
                            <td className="px-4 py-3 max-w-[200px]">
                              <AttributesCell
                                mappedServiceType={item.mapped_service_type}
                                mappedSystem={item.mapped_system}
                                mappedPenetration={item.mapped_penetration}
                                mappingConfidence={item.mapping_confidence}
                                size={item.size}
                                frr={item.frr}
                                service={item.service}
                                subclass={item.subclass}
                                material={item.material}
                              />
                            </td>
                            <td className="px-4 py-3 max-w-[250px]">
                              {item.system_label ? (
                                <div className="space-y-2">
                                  <div className="flex items-start gap-2">
                                    <div className="flex-1">
                                      <div className="text-xs font-medium text-gray-900 break-words">
                                        {item.system_label}
                                      </div>
                                      <div className="text-xs text-gray-300 break-all">{item.system_id}</div>
                                      {item.system_manual_override && (
                                        <div className="text-xs text-blue-600 mt-0.5">Manual override</div>
                                      )}
                                    </div>
                                    {item.system_confidence !== undefined && (
                                      <span className={`inline-flex px-1.5 py-0.5 text-xs font-medium rounded border ${
                                        item.system_confidence >= 0.7 ? 'bg-green-500/20 text-green-300 border-green-500/30' :
                                        item.system_confidence >= 0.5 ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' :
                                        'bg-red-500/20 text-red-300 border-red-500/30'
                                      }`}>
                                        {Math.round(item.system_confidence * 100)}%
                                      </span>
                                    )}
                                  </div>
                                  <select
                                    value={item.system_id || ''}
                                    onChange={(e) => handleSystemOverride(item.id, e.target.value)}
                                    className="w-full text-xs border border-slate-600 rounded px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-slate-900/50 text-slate-100 [&>option]:text-slate-900 [&>option]:bg-white"
                                  >
                                    <option value="">-- Change System --</option>
                                    {availableSystems.map(sys => (
                                      <option key={sys.id} value={sys.id}>{sys.label}</option>
                                    ))}
                                  </select>
                                  {(item.matched_factors || item.missed_factors) && (
                                    <button
                                      onClick={() => setShowMatchDetails(showMatchDetails === item.id ? null : item.id)}
                                      className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                    >
                                      <AlertCircle size={12} />
                                      Match details
                                    </button>
                                  )}
                                  {showMatchDetails === item.id && (
                                    <div className="mt-1 p-2 bg-slate-800/40 rounded text-xs">
                                      {item.matched_factors && JSON.parse(item.matched_factors).length > 0 && (
                                        <div className="mb-2">
                                          <div className="font-medium text-green-700 mb-1">Matched:</div>
                                          <ul className="list-disc list-inside text-green-600 space-y-0.5">
                                            {JSON.parse(item.matched_factors).map((factor: string, idx: number) => (
                                              <li key={idx}>{factor}</li>
                                            ))}
                                          </ul>
                                        </div>
                                      )}
                                      {item.missed_factors && JSON.parse(item.missed_factors).length > 0 && (
                                        <div>
                                          <div className="font-medium text-red-700 mb-1">Missed:</div>
                                          <ul className="list-disc list-inside text-red-400 space-y-0.5">
                                            {JSON.parse(item.missed_factors).map((factor: string, idx: number) => (
                                              <li key={idx}>{factor}</li>
                                            ))}
                                          </ul>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="text-xs text-gray-400">Not mapped</div>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="space-y-1">
                                {getConfidenceBadge(item.confidence)}
                                {issues.length > 0 && (
                                  <button
                                    onClick={() => setShowIssues(showIssues === item.id ? null : item.id)}
                                    className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                                  >
                                    <AlertCircle size={12} />
                                    {issues.length} issue{issues.length !== 1 ? 's' : ''}
                                  </button>
                                )}
                              </div>
                              {showIssues === item.id && issues.length > 0 && (
                                <div className="mt-2 p-2 bg-red-500/20 rounded text-xs text-red-300 border border-red-500/30">
                                  <ul className="list-disc list-inside space-y-1">
                                    {issues.map((issue, idx) => (
                                      <li key={idx}>{issue}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <button
                                onClick={() => toggleExclude(item.id, item.is_excluded)}
                                className={`inline-flex px-2 py-1 text-xs font-medium rounded-full border ${
                                  item.is_excluded
                                    ? 'bg-red-500/20 text-red-300 border-red-500/30 hover:bg-red-500/30'
                                    : 'bg-green-500/20 text-green-300 border-green-500/30 hover:bg-green-500/30'
                                }`}
                              >
                                {item.is_excluded ? 'Excluded' : 'Included'}
                              </button>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => startEdit(item)}
                                  className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                                >
                                  <Edit2 size={16} />
                                </button>
                                <button
                                  onClick={() => deleteItem(item.id)}
                                  className="p-1 text-red-400 hover:bg-red-500/10 rounded"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {items.length > 5 && (
              <div className="flex justify-center items-center py-4 border-t border-slate-700">
                <button
                  onClick={() => setIsTableExpanded(!isTableExpanded)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 rounded-lg transition-all"
                >
                  {isTableExpanded ? (
                    <>
                      <ChevronUp size={18} />
                      Show Less (First 5 rows)
                    </>
                  ) : (
                    <>
                      <ChevronDown size={18} />
                      Show All ({items.length} rows)
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      <WorkflowNav
        currentStep={2}
        onBack={onNavigateBack}
        onNext={onNavigateNext}
        backLabel="Back: Import Quotes"
        nextLabel="Next: Quote Intelligence"
      />
    </div>
  );
}
