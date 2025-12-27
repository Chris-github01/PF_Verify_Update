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
  try {
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, name, client, reference, status, created_at, trade')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      console.error('Error fetching project:', projectError);
      return null;
    }

    const { data: quotes, error: quotesError } = await supabase
      .from('quotes')
      .select(`
        id,
        supplier_name,
        total_amount,
        quoted_total,
        items_count,
        status,
        revision_number,
        created_at
      `)
      .eq('project_id', projectId)
      .eq('is_latest', true)
      .order('created_at', { ascending: true });

    if (quotesError) {
      console.error('Error fetching quotes:', quotesError);
    }

    const quotesWithItems = await Promise.all(
      (quotes || []).map(async (quote) => {
        const { data: items } = await supabase
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

        return {
          ...quote,
          items: items || [],
        };
      })
    );

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

    return {
      project,
      quotes: quotesWithItems,
      awardReports: awardReports || [],
      workflowStatus,
    };
  } catch (error) {
    console.error('Error in fetchProjectDataForCopilot:', error);
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
  data.quotes.forEach((quote, idx) => {
    lines.push(`\nQuote ${idx + 1}: ${quote.supplier_name}`);
    lines.push(`  - Total Amount: $${quote.total_amount.toLocaleString()}`);
    lines.push(`  - Line Items: ${quote.items_count}`);
    lines.push(`  - Status: ${quote.status}`);
    if (quote.revision_number) {
      lines.push(`  - Revision: ${quote.revision_number}`);
    }
  });
  lines.push('');

  const allItems = data.quotes.flatMap(q => q.items);
  if (allItems.length > 0) {
    lines.push('=== LINE ITEMS SUMMARY ===');
    lines.push(`Total Line Items: ${allItems.length}`);

    const serviceTypes = new Set(
      allItems.map(item => item.service).filter(Boolean)
    );
    if (serviceTypes.size > 0) {
      lines.push(`Service Types Detected: ${Array.from(serviceTypes).join(', ')}`);
    }

    const systems = new Set(
      allItems.map(item => item.system_label).filter(Boolean)
    );
    if (systems.size > 0) {
      lines.push(`Fire Protection Systems: ${Array.from(systems).join(', ')}`);
    }

    const avgConfidence = allItems
      .filter(item => item.confidence !== null)
      .reduce((sum, item) => sum + (item.confidence || 0), 0) / allItems.length;

    if (avgConfidence > 0) {
      lines.push(`Average Classification Confidence: ${(avgConfidence * 100).toFixed(1)}%`);
    }
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
      }
    }
    lines.push('');
  }

  lines.push('=== AVAILABLE ACTIONS ===');
  lines.push('- Navigate to different sections (quotes, review, scope matrix, reports, etc.)');
  lines.push('- Answer questions about quote details, pricing, and coverage');
  lines.push('- Provide insights on supplier comparisons');
  lines.push('- Explain workflow steps and next actions');
  lines.push('- Help with data interpretation and analysis');

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
