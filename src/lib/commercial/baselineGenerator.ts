/**
 * COMMERCIAL BASELINE GENERATOR
 *
 * Generates independent commercial baselines from awarded quotes.
 * Replaces dependency on BOQ Builder by using quote_items as source.
 *
 * Key Features:
 * - Converts quote items to baseline items
 * - Adds structural enhancements (allowances, retention)
 * - Supports provisional sums
 * - Completely independent of BOQ Builder
 */

import { supabase } from '../supabase';

export interface BaselineGenerationOptions {
  projectId: string;
  awardApprovalId: string;
  quoteId: string;
  tradeKey: string;
  includeAllowances?: boolean;
  includeRetention?: boolean;
  retentionPercentage?: number;
  allowanceConfig?: AllowanceConfig;
}

export interface AllowanceConfig {
  [key: string]: {
    percentage: number;
    description: string;
    enabled?: boolean;
  };
}

export interface BaselineItem {
  project_id: string;
  award_approval_id: string;
  trade_key: string;
  source_quote_id: string;
  source_quote_item_id: string | null;
  line_number: string;
  line_type: 'awarded_item' | 'allowance' | 'retention' | 'provisional_sum';
  description: string;
  system_category: string | null;
  scope_category: string | null;
  location_zone: string | null;
  unit: string;
  quantity: number;
  unit_rate: number;
  is_active: boolean;
  notes?: string;
}

/**
 * Default allowance configuration
 */
const DEFAULT_ALLOWANCES: AllowanceConfig = {
  site_establishment: {
    percentage: 2.5,
    description: 'Site Establishment & Preliminaries',
    enabled: true
  },
  project_management: {
    percentage: 5.0,
    description: 'Project Management & Coordination',
    enabled: true
  },
  risk_contingency: {
    percentage: 3.0,
    description: 'Risk & Contingency Allowance',
    enabled: true
  }
};

/**
 * Generate commercial baseline from awarded quote
 */
export async function generateCommercialBaseline(
  options: BaselineGenerationOptions
): Promise<{ success: boolean; itemCount: number; totalValue: number }> {
  const {
    projectId,
    awardApprovalId,
    quoteId,
    tradeKey,
    includeAllowances = true,
    includeRetention = true,
    retentionPercentage = 5,
    allowanceConfig = DEFAULT_ALLOWANCES
  } = options;

  console.log('[Baseline Generator] Starting generation:', {
    projectId,
    awardApprovalId,
    quoteId,
    tradeKey
  });

  // Step 1: Check if baseline already exists
  const { data: existing } = await supabase
    .from('commercial_baseline_items')
    .select('id')
    .eq('award_approval_id', awardApprovalId)
    .limit(1)
    .single();

  if (existing) {
    console.log('[Baseline Generator] Baseline already exists for award:', awardApprovalId);
    throw new Error('Commercial baseline already exists for this award');
  }

  // Step 2: Fetch all quote items from awarded quote
  const { data: quoteItems, error: quoteError } = await supabase
    .from('quote_items')
    .select('*')
    .eq('quote_id', quoteId)
    .order('id');

  if (quoteError) {
    console.error('[Baseline Generator] Error fetching quote items:', quoteError);
    throw quoteError;
  }

  if (!quoteItems || quoteItems.length === 0) {
    throw new Error('No quote items found for awarded quote');
  }

  console.log(`[Baseline Generator] Found ${quoteItems.length} quote items`);

  const baselineItems: BaselineItem[] = [];

  // Step 3: Convert quote items to baseline items
  for (const [index, item] of quoteItems.entries()) {
    const lineNumber = `BT-${String(index + 1).padStart(4, '0')}`;

    baselineItems.push({
      project_id: projectId,
      award_approval_id: awardApprovalId,
      trade_key: tradeKey,
      source_quote_id: quoteId,
      source_quote_item_id: item.id,
      line_number: lineNumber,
      line_type: 'awarded_item',
      description: item.description || 'Unnamed Item',
      system_category: item.service_type || item.mapped_service_type || null,
      scope_category: item.scope_category || null,
      location_zone: item.location || null,
      unit: item.unit || 'ea',
      quantity: parseFloat(item.quantity) || 0,
      unit_rate: parseFloat(item.unit_price) || 0,
      is_active: true,
      notes: item.notes || null
    });
  }

  // Calculate base contract value (before allowances and retention)
  const baseContractValue = baselineItems.reduce(
    (sum, item) => sum + (item.quantity * item.unit_rate),
    0
  );

  console.log(`[Baseline Generator] Base contract value: $${baseContractValue.toFixed(2)}`);

  // Step 4: Add allowances (if enabled)
  if (includeAllowances) {
    const allowanceItems = generateAllowanceItems({
      projectId,
      awardApprovalId,
      tradeKey,
      quoteId,
      baseContractValue,
      allowanceConfig
    });

    baselineItems.push(...allowanceItems);
    console.log(`[Baseline Generator] Added ${allowanceItems.length} allowance items`);
  }

  // Calculate subtotal (base + allowances)
  const subtotal = baselineItems.reduce(
    (sum, item) => sum + (item.quantity * item.unit_rate),
    0
  );

  // Step 5: Add retention line (if enabled)
  if (includeRetention && retentionPercentage > 0) {
    const retentionAmount = subtotal * (retentionPercentage / 100);

    baselineItems.push({
      project_id: projectId,
      award_approval_id: awardApprovalId,
      trade_key: 'general',
      source_quote_id: quoteId,
      source_quote_item_id: null,
      line_number: 'BT-RET',
      line_type: 'retention',
      description: `Retention @ ${retentionPercentage}%`,
      system_category: 'Commercial',
      scope_category: 'Included',
      location_zone: null,
      unit: '%',
      quantity: retentionPercentage,
      unit_rate: -retentionAmount / retentionPercentage, // Negative to deduct
      is_active: true,
      notes: `${retentionPercentage}% retention held until practical completion`
    });

    console.log(`[Baseline Generator] Added retention: -$${retentionAmount.toFixed(2)}`);
  }

  // Calculate final total
  const totalValue = baselineItems.reduce(
    (sum, item) => sum + (item.quantity * item.unit_rate),
    0
  );

  console.log(`[Baseline Generator] Total baseline value: $${totalValue.toFixed(2)}`);
  console.log(`[Baseline Generator] Total items: ${baselineItems.length}`);

  // Step 6: Insert all baseline items in a single transaction
  const { error: insertError } = await supabase
    .from('commercial_baseline_items')
    .insert(baselineItems);

  if (insertError) {
    console.error('[Baseline Generator] Error inserting baseline items:', insertError);
    throw insertError;
  }

  // Step 7: Log the action
  await supabase.from('commercial_audit_log').insert({
    project_id: projectId,
    action_type: 'baseline_generated',
    entity_type: 'commercial_baseline',
    entity_id: awardApprovalId,
    user_id: (await supabase.auth.getUser()).data.user?.id,
    details: {
      award_approval_id: awardApprovalId,
      quote_id: quoteId,
      item_count: baselineItems.length,
      base_value: baseContractValue,
      total_value: totalValue,
      includes_allowances: includeAllowances,
      includes_retention: includeRetention,
      retention_percentage: retentionPercentage
    }
  });

  console.log('[Baseline Generator] ✅ Baseline generation complete');

  return {
    success: true,
    itemCount: baselineItems.length,
    totalValue
  };
}

/**
 * Generate allowance items
 */
function generateAllowanceItems(options: {
  projectId: string;
  awardApprovalId: string;
  tradeKey: string;
  quoteId: string;
  baseContractValue: number;
  allowanceConfig: AllowanceConfig;
}): BaselineItem[] {
  const {
    projectId,
    awardApprovalId,
    tradeKey,
    quoteId,
    baseContractValue,
    allowanceConfig
  } = options;

  const allowanceItems: BaselineItem[] = [];
  let allowanceIndex = 9000;

  for (const [key, config] of Object.entries(allowanceConfig)) {
    if (config.enabled === false) continue;

    const amount = baseContractValue * (config.percentage / 100);
    const lineNumber = `BT-${allowanceIndex}`;

    allowanceItems.push({
      project_id: projectId,
      award_approval_id: awardApprovalId,
      trade_key: tradeKey,
      source_quote_id: quoteId,
      source_quote_item_id: null,
      line_number: lineNumber,
      line_type: 'allowance',
      description: config.description,
      system_category: 'Allowances',
      scope_category: 'Included',
      location_zone: null,
      unit: '%',
      quantity: config.percentage,
      unit_rate: amount / config.percentage,
      is_active: true,
      notes: `Calculated as ${config.percentage}% of base contract value ($${baseContractValue.toFixed(2)})`
    });

    allowanceIndex++;
  }

  return allowanceItems;
}

/**
 * Add a provisional sum to an existing baseline
 */
export async function addProvisionalSum(options: {
  projectId: string;
  awardApprovalId: string;
  tradeKey: string;
  description: string;
  amount: number;
  notes?: string;
}): Promise<{ success: boolean; lineNumber: string }> {
  const { projectId, awardApprovalId, tradeKey, description, amount, notes } = options;

  // Get the award to find the source quote
  const { data: award } = await supabase
    .from('award_approvals')
    .select('final_approved_quote_id')
    .eq('id', awardApprovalId)
    .single();

  if (!award) {
    throw new Error('Award not found');
  }

  // Get next line number for provisional sums
  const { data: lineNumberResult } = await supabase
    .rpc('get_next_baseline_line_number', {
      p_project_id: projectId,
      p_award_approval_id: awardApprovalId,
      p_line_type: 'provisional_sum'
    });

  const lineNumber = lineNumberResult || 'BT-9100';

  const provisionalSum: BaselineItem = {
    project_id: projectId,
    award_approval_id: awardApprovalId,
    trade_key: tradeKey,
    source_quote_id: award.final_approved_quote_id,
    source_quote_item_id: null,
    line_number: lineNumber,
    line_type: 'provisional_sum',
    description: description,
    system_category: 'Provisional Sums',
    scope_category: 'Included',
    location_zone: null,
    unit: 'sum',
    quantity: 1,
    unit_rate: amount,
    is_active: true,
    notes: notes || null
  };

  const { error } = await supabase
    .from('commercial_baseline_items')
    .insert([provisionalSum]);

  if (error) {
    console.error('[Baseline Generator] Error adding provisional sum:', error);
    throw error;
  }

  console.log(`[Baseline Generator] Added provisional sum: ${lineNumber} - $${amount.toFixed(2)}`);

  return { success: true, lineNumber };
}

/**
 * Get baseline summary for an award
 */
export async function getBaselineSummary(awardApprovalId: string) {
  const { data, error } = await supabase
    .rpc('get_baseline_summary', { p_award_approval_id: awardApprovalId });

  if (error) {
    console.error('[Baseline Generator] Error getting summary:', error);
    throw error;
  }

  return data;
}

/**
 * Lock a baseline to prevent further edits
 */
export async function lockBaseline(awardApprovalId: string) {
  const { error } = await supabase
    .rpc('lock_commercial_baseline', { p_award_approval_id: awardApprovalId });

  if (error) {
    console.error('[Baseline Generator] Error locking baseline:', error);
    throw error;
  }

  console.log(`[Baseline Generator] Locked baseline for award: ${awardApprovalId}`);
}
