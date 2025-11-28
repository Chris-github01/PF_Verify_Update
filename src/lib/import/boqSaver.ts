import { supabase } from '../supabase';
import type { NormalisedBOQRow } from '../../types/import.types';
import { detectServiceTypesInBatch } from '../quoteIntelligence/aiServiceDetector';
import { reconcileQuoteTotal } from '../validation/quoteValidator';

function extractServiceFromDescription(description: string): string {
  const upperDesc = description.toUpperCase();

  const patterns = [
    { regex: /CABLE TRAY/i, type: 'Cable Tray' },
    { regex: /CABLE BUNDLE/i, type: 'Cable Bundle' },
    { regex: /CONDUIT/i, type: 'Conduit' },
    { regex: /PVC PIPE/i, type: 'PVC Pipe' },
    { regex: /COPPER PIPE/i, type: 'Copper Pipe' },
    { regex: /STEEL PIPE/i, type: 'Steel Pipe' },
    { regex: /DUCT/i, type: 'Duct' },
    { regex: /BEAM/i, type: 'Beam' },
    { regex: /PURLIN/i, type: 'Purlin' },
  ];

  for (const { regex, type } of patterns) {
    if (regex.test(description)) return type;
  }

  return 'General';
}

function getSectionFromServiceType(serviceType: string): string {
  if (serviceType.startsWith('Electrical Services')) return 'Electrical Services';
  if (serviceType.startsWith('Fire Protection Services')) return 'Fire Protection Services';
  if (serviceType.startsWith('Hydraulics Services')) return 'Hydraulics Services';
  if (serviceType.startsWith('Mechanical Services')) return 'Mechanical Services';
  if (serviceType.startsWith('Structural Penetrations')) return 'Structural Penetrations';
  return 'Passive Fire (General)';
}

export async function saveBOQToDatabase(
  projectId: string,
  boqData: NormalisedBOQRow[],
  quotedTotals?: Map<string, number>,
  dashboardMode: 'original' | 'revisions' = 'original'
): Promise<{ success: boolean; error?: string; suppliersCreated?: number }> {
  console.log('[BOQ Saver] Starting save process', { projectId, totalRows: boqData.length });

  try {
    if (!boqData || boqData.length === 0) {
      console.error('[BOQ Saver] No data to save');
      return { success: false, error: 'No data provided' };
    }

    const supplierMap = new Map<string, NormalisedBOQRow[]>();

    for (const row of boqData) {
      if (!supplierMap.has(row.supplier)) {
        supplierMap.set(row.supplier, []);
      }
      supplierMap.get(row.supplier)!.push(row);
    }

    console.log('[BOQ Saver] Grouped into suppliers', { supplierCount: supplierMap.size });

    let suppliersCreated = 0;

    for (const [supplierName, rows] of supplierMap.entries()) {
      console.log('[BOQ Saver] Processing supplier', { supplierName, rowCount: rows.length });

      // Determine revision number
      let revisionNumber = 1;
      if (dashboardMode === 'revisions') {
        // Get the latest revision number for this supplier in this project
        const { data: latestQuote } = await supabase
          .from('quotes')
          .select('revision_number')
          .eq('project_id', projectId)
          .eq('supplier_name', supplierName)
          .order('revision_number', { ascending: false })
          .limit(1)
          .maybeSingle();

        revisionNumber = latestQuote ? latestQuote.revision_number + 1 : 2;
        console.log('[BOQ Saver] Setting revision number', { supplierName, revisionNumber });
      }

      const lineItemsTotal = rows.reduce((sum, row) => sum + row.total, 0);
      const quotedTotal = quotedTotals?.get(supplierName);
      const contingencyAmount = quotedTotal && quotedTotal > lineItemsTotal
        ? quotedTotal - lineItemsTotal
        : 0;
      const totalAmount = quotedTotal || lineItemsTotal;

      console.log('[BOQ Saver] Quote totals calculated', {
        supplierName,
        lineItemsTotal,
        quotedTotal,
        contingencyAmount,
        totalAmount,
        revisionNumber
      });

      const { data: quote, error: quoteError } = await supabase
        .from('quotes')
        .insert({
          project_id: projectId,
          supplier_name: supplierName,
          total_amount: totalAmount,
          quoted_total: quotedTotal || null,
          contingency_amount: contingencyAmount,
          items_count: rows.length,
          status: 'pending',
          quote_reference: rows[0].sourceSheet || '',
          revision_number: revisionNumber,
        })
        .select()
        .single();

      if (quoteError) {
        console.error('[BOQ Saver] Quote insert error', quoteError);
        throw quoteError;
      }

      console.log('[BOQ Saver] Quote created', { quoteId: quote.id });

      console.log('[BOQ Saver] Running AI service detection...');
      const itemsForDetection = rows.map((row, idx) => ({
        id: `temp-${idx}`,
        description: row.description,
      }));

      const aiDetections = await detectServiceTypesInBatch(itemsForDetection);
      console.log('[BOQ Saver] AI detection complete', { detectedCount: aiDetections.size });

      const quoteItems = rows.map((row, idx) => {
        const detection = aiDetections.get(`temp-${idx}`);
        const serviceType = detection?.serviceType || extractServiceFromDescription(row.description);
        const section = getSectionFromServiceType(serviceType);

        return {
          quote_id: quote.id,
          description: row.description,
          quantity: row.qty,
          unit: row.unit,
          unit_price: row.rate,
          total_price: row.total,
          section: section,
          scope_category: section,
          service: serviceType,
          normalised_system: serviceType,
          notes: row.notes || '',
        };
      });

      console.log('[BOQ Saver] Inserting quote items', {
        quoteId: quote.id,
        itemCount: quoteItems.length,
        firstItem: quoteItems[0]
      });

      const { data: insertedItems, error: itemsError } = await supabase
        .from('quote_items')
        .insert(quoteItems)
        .select();

      if (itemsError) {
        console.error('[BOQ Saver] Quote items insert error', {
          error: itemsError,
          code: itemsError.code,
          message: itemsError.message,
          details: itemsError.details,
          hint: itemsError.hint
        });
        throw new Error(`Failed to insert quote items: ${itemsError.message} (${itemsError.code})`);
      }

      console.log('[BOQ Saver] Quote items created', { itemCount: insertedItems?.length });

      console.log('[BOQ Saver] Running reconciliation check...');
      try {
        const reconciliationResult = await reconcileQuoteTotal(quote.id);
        console.log('[BOQ Saver] Reconciliation result', {
          quoteId: quote.id,
          status: reconciliationResult.status,
          variance: reconciliationResult.variancePercent,
          notes: reconciliationResult.notes
        });

        if (reconciliationResult.status === 'failed') {
          console.warn('[BOQ Saver] ⚠️  RECONCILIATION FAILED', {
            supplierName,
            extractedTotal: reconciliationResult.extractedTotal,
            pdfTotal: reconciliationResult.pdfTotal,
            variancePercent: (reconciliationResult.variancePercent * 100).toFixed(2) + '%'
          });
        }
      } catch (reconciliationError) {
        console.error('[BOQ Saver] Reconciliation check failed', reconciliationError);
      }

      suppliersCreated++;
    }

    await supabase
      .from('projects')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', projectId);

    console.log('[BOQ Saver] Save completed successfully', { suppliersCreated });

    return { success: true, suppliersCreated };
  } catch (error) {
    console.error('[BOQ Saver] Error saving BOQ to database:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
