import { supabase } from '../supabase';

export interface CopilotProjectData {
  project: {
    id: string;
    name: string;
    client: string | null;
    reference: string | null;
    status: string;
    created_at: string;
    trade?: string;
  };
  quotes: Array<{
    id: string;
    supplier_name: string;
    total_amount: number;
    quoted_total: number | null;
    items_count: number;
    status: string;
    revision_number: number | null;
    created_at: string;
    items: Array<{
      id: string;
      description: string;
      quantity: number;
      unit: string;
      unit_price: number;
      total_price: number;
      service: string | null;
      scope_category: string | null;
      system_id: string | null;
      system_label: string | null;
      normalised_system: string | null;
      confidence: number | null;
      notes: string | null;
    }>;
  }>;
  scopeMatrix?: {
    systems: string[];
    suppliers: string[];
    coverage: Record<string, Record<string, boolean>>;
    totals: Record<string, number>;
  };
  quoteIntelligence?: Array<{
    quote_id: string;
    supplier_name: string;
    analysis: {
      serviceTypes: string[];
      riskFactors: string[];
      coverageScore: number;
      qualityScore: number;
    };
  }>;
  awardReports?: Array<{
    id: string;
    generated_at: string;
    result_json: any;
  }>;
  workflowStatus: {
    hasQuotes: boolean;
    hasReviewedItems: boolean;
    hasScopeMatrix: boolean;
    hasReports: boolean;
    completedSteps: number;
    totalSteps: number;
  };
}

export async function fetchProjectDataForCopilot(
  projectId: string
): Promise<CopilotProjectData | null> {
  console.log(`[Copilot] Fetching data for project ID: ${projectId}`);

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    console.log(`[Copilot] Current user:`, user?.id, user?.email, userError);

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, name, client, reference, status, created_at, trade, organisation_id')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      console.error('[Copilot] Error fetching project:', projectError);
      return null;
    }

    console.log(`[Copilot] Project found: ${project.name} (org: ${project.organisation_id})`);

    let { data: quotes, error: quotesError } = await supabase
      .from('quotes')
      .select(`
        id,
        supplier_name,
        total_amount,
        quoted_total,
        items_count,
        status,
        revision_number,
        created_at,
        is_latest
      `)
      .eq('project_id', projectId)
      .eq('is_latest', true)
      .order('created_at', { ascending: true });

    if (quotesError) {
      console.error('Error fetching quotes with is_latest filter:', quotesError);
    }

    if (!quotes || quotes.length === 0) {
      console.log('No quotes found with is_latest=true, trying without filter...');
      const { data: allQuotes, error: allQuotesError } = await supabase
        .from('quotes')
        .select(`
          id,
          supplier_name,
          total_amount,
          quoted_total,
          items_count,
          status,
          revision_number,
          created_at,
          is_latest
        `)
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });

      if (allQuotesError) {
        console.error('Error fetching all quotes:', allQuotesError);
      } else {
        console.log(`Found ${allQuotes?.length || 0} total quotes for project`);
        quotes = allQuotes;
      }
    } else {
      console.log(`Found ${quotes.length} quotes with is_latest=true`);
    }

    const quotesWithItems = await Promise.all(
      (quotes || []).map(async (quote) => {
        const { data: items, error: itemsError } = await supabase
          .from('quote_items')
          .select(`
            id,
            description,
            quantity,
            unit,
            unit_price,
            total_price,
            service,
            scope_category,
            system_id,
            system_label,
            normalised_system,
            confidence,
            notes
          `)
          .eq('quote_id', quote.id)
          .order('id', { ascending: true });

        if (itemsError) {
          console.error(`Error fetching items for quote ${quote.id}:`, itemsError);
        } else {
          console.log(`Quote ${quote.supplier_name}: ${items?.length || 0} items`);
        }

        return {
          ...quote,
          items: items || [],
        };
      })
    );

    console.log(`Total quotes with items: ${quotesWithItems.length}`);

    const { data: awardReports } = await supabase
      .from('award_reports')
      .select('id, generated_at, result_json')
      .eq('project_id', projectId)
      .order('generated_at', { ascending: false })
      .limit(5);

    const workflowStatus = {
      hasQuotes: quotesWithItems.length > 0,
      hasReviewedItems: quotesWithItems.some(q =>
        q.items.some(item => item.system_id !== null)
      ),
      hasScopeMatrix: quotesWithItems.some(q =>
        q.items.some(item => item.normalised_system !== null)
      ),
      hasReports: (awardReports || []).length > 0,
      completedSteps: 0,
      totalSteps: 8,
    };

    workflowStatus.completedSteps = [
      workflowStatus.hasQuotes,
      workflowStatus.hasReviewedItems,
      workflowStatus.hasScopeMatrix,
      workflowStatus.hasReports,
    ].filter(Boolean).length;

    const totalItems = quotesWithItems.reduce((sum, q) => sum + q.items.length, 0);
    console.log(`[Copilot] Data summary: ${quotesWithItems.length} quotes, ${totalItems} total items`);

    return {
      project,
      quotes: quotesWithItems,
      awardReports: awardReports || [],
      workflowStatus,
    };
  } catch (error) {
    console.error('[Copilot] Error in fetchProjectDataForCopilot:', error);
    return null;
  }
}

export function formatProjectDataForAI(data: CopilotProjectData): string {
  const lines: string[] = [];

  lines.push('=== PROJECT OVERVIEW ===');
  lines.push(`Project: ${data.project.name}`);
  if (data.project.client) lines.push(`Client: ${data.project.client}`);
  if (data.project.reference) lines.push(`Reference: ${data.project.reference}`);
  if (data.project.trade) lines.push(`Trade: ${data.project.trade}`);
  lines.push(`Status: ${data.project.status}`);
  lines.push('');

  lines.push('=== WORKFLOW STATUS ===');
  lines.push(`Progress: ${data.workflowStatus.completedSteps}/${data.workflowStatus.totalSteps} steps completed`);
  lines.push(`✓ Quotes Imported: ${data.workflowStatus.hasQuotes ? 'Yes' : 'No'}`);
  lines.push(`✓ Items Reviewed: ${data.workflowStatus.hasReviewedItems ? 'Yes' : 'No'}`);
  lines.push(`✓ Scope Matrix Built: ${data.workflowStatus.hasScopeMatrix ? 'Yes' : 'No'}`);
  lines.push(`✓ Reports Generated: ${data.workflowStatus.hasReports ? 'Yes' : 'No'}`);
  lines.push('');

  lines.push('=== QUOTES SUMMARY ===');
  lines.push(`Total Quotes: ${data.quotes.length}`);

  if (data.quotes.length === 0) {
    lines.push('No quotes have been imported yet. The user should navigate to the Quotes tab to import supplier quotes.');
  } else {
    let totalValue = 0;
    data.quotes.forEach((quote, idx) => {
      lines.push(`\nQuote ${idx + 1}: ${quote.supplier_name}`);
      lines.push(`  - Total Amount: $${quote.total_amount.toLocaleString()}`);
      lines.push(`  - Line Items: ${quote.items.length || quote.items_count}`);
      lines.push(`  - Status: ${quote.status}`);
      if (quote.revision_number) {
        lines.push(`  - Revision: ${quote.revision_number}`);
      }
      totalValue += quote.total_amount || 0;
    });
    lines.push(`\nTotal Value Across All Quotes: $${totalValue.toLocaleString()}`);
  }
  lines.push('');

  const allItems = data.quotes.flatMap(q => q.items);
  if (allItems.length > 0) {
    lines.push('=== LINE ITEMS DETAILED ANALYSIS ===');
    lines.push(`Total Line Items: ${allItems.length}`);

    const serviceTypes = new Set(
      allItems.map(item => item.service).filter(Boolean)
    );
    if (serviceTypes.size > 0) {
      lines.push(`Service Types Detected: ${Array.from(serviceTypes).join(', ')}`);
    }

    const systems = new Set(
      allItems.map(item => item.system_label || item.normalised_system).filter(Boolean)
    );
    if (systems.size > 0) {
      lines.push(`Fire Protection Systems: ${Array.from(systems).join(', ')}`);
    }

    const scopeCategories = new Set(
      allItems.map(item => item.scope_category).filter(Boolean)
    );
    if (scopeCategories.size > 0) {
      lines.push(`Scope Categories: ${Array.from(scopeCategories).join(', ')}`);
    }

    const itemsWithConfidence = allItems.filter(item => item.confidence !== null && item.confidence !== undefined);
    if (itemsWithConfidence.length > 0) {
      const avgConfidence = itemsWithConfidence.reduce((sum, item) => sum + (item.confidence || 0), 0) / itemsWithConfidence.length;
      lines.push(`Average Classification Confidence: ${(avgConfidence * 100).toFixed(1)}%`);
      lines.push(`Items with AI Confidence Scores: ${itemsWithConfidence.length} of ${allItems.length}`);
    }

    const totalItemsValue = allItems.reduce((sum, item) => sum + (item.total_price || 0), 0);
    lines.push(`Total Value of All Line Items: $${totalItemsValue.toLocaleString()}`);

    lines.push('');

    lines.push('=== SAMPLE LINE ITEMS (First 10) ===');
    allItems.slice(0, 10).forEach((item, idx) => {
      lines.push(`${idx + 1}. ${item.description}`);
      lines.push(`   Qty: ${item.quantity} ${item.unit} @ $${item.unit_price.toFixed(2)} = $${item.total_price.toFixed(2)}`);
      if (item.system_label) lines.push(`   System: ${item.system_label}`);
      if (item.service) lines.push(`   Service: ${item.service}`);
    });
    lines.push('');
  } else if (data.quotes.length > 0) {
    lines.push('=== LINE ITEMS ===');
    lines.push('Quotes have been imported but no line items are visible. This could mean:');
    lines.push('- Quotes are still being processed');
    lines.push('- Line items failed to extract during import');
    lines.push('- There may be an access issue with the quote_items table');
    lines.push('');
  }

  if (data.awardReports && data.awardReports.length > 0) {
    lines.push('=== AWARD REPORTS ===');
    lines.push(`Total Reports Generated: ${data.awardReports.length}`);
    const latestReport = data.awardReports[0];
    if (latestReport.result_json?.awardSummary) {
      const summary = latestReport.result_json.awardSummary;
      lines.push(`Latest Report Generated: ${new Date(latestReport.generated_at).toLocaleDateString()}`);
      if (summary.suppliers && summary.suppliers.length > 0) {
        const topSupplier = summary.suppliers[0];
        lines.push(`Recommended Supplier: ${topSupplier.supplierName}`);
        lines.push(`  - Total: $${topSupplier.total?.toLocaleString() || 'N/A'}`);
        lines.push(`  - Coverage: ${topSupplier.coveragePercent?.toFixed(1) || 'N/A'}%`);
        if (topSupplier.matchScore) {
          lines.push(`  - Match Score: ${(topSupplier.matchScore * 100).toFixed(1)}%`);
        }
      }
    }
    lines.push('');
  }

  lines.push('=== AI COPILOT CAPABILITIES ===');
  lines.push('I can help you with:');
  lines.push('- Navigate to different workflow sections (quotes, review, scope matrix, reports, contract manager)');
  lines.push('- Answer questions about quote details, pricing, line items, and suppliers');
  lines.push('- Provide insights on supplier comparisons and coverage analysis');
  lines.push('- Explain workflow steps and recommend next actions');
  lines.push('- Help interpret data, identify issues, and troubleshoot problems');
  lines.push('- Analyze pricing trends and identify outliers');
  lines.push('- Compare supplier quotes and highlight differences');
  lines.push('- Suggest which items need review or clarification');
  lines.push('');
  lines.push('Ask me anything about your project, quotes, or the VerifyPlus platform!');

  return lines.join('\n');
}

export async function fetchOrganisationContext(organisationId: string): Promise<string> {
  try {
    const { data: org } = await supabase
      .from('organisations')
      .select('name, seat_limit, monthly_quote_limit, quotes_used_this_month')
      .eq('id', organisationId)
      .single();

    if (!org) return '';

    const lines: string[] = [];
    lines.push('=== ORGANISATION CONTEXT ===');
    lines.push(`Organisation: ${org.name}`);
    lines.push(`Subscription: ${org.seat_limit} seats, ${org.monthly_quote_limit} quotes/month`);
    lines.push(`Quotes Used This Month: ${org.quotes_used_this_month || 0}`);
    lines.push('');

    return lines.join('\n');
  } catch (error) {
    console.error('Error fetching organisation context:', error);
    return '';
  }
}
