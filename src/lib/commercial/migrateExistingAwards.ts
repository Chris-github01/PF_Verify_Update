/**
 * MIGRATION SCRIPT: Backfill Commercial Baselines
 *
 * This script generates commercial baselines for existing awards
 * that were created before the independent Commercial Control system.
 *
 * Usage:
 * - Run this once after deploying the new system
 * - Can be run safely multiple times (skips existing baselines)
 * - Logs all actions for audit trail
 */

import { supabase } from '../supabase';
import { generateCommercialBaseline } from './baselineGenerator';

interface MigrationResult {
  totalAwards: number;
  skipped: number;
  generated: number;
  failed: number;
  errors: Array<{ awardId: string; error: string }>;
}

/**
 * Migrate all existing awards to have commercial baselines
 */
export async function migrateExistingAwards(): Promise<MigrationResult> {
  console.log('[Migration] Starting commercial baseline backfill...');

  const result: MigrationResult = {
    totalAwards: 0,
    skipped: 0,
    generated: 0,
    failed: 0,
    errors: []
  };

  try {
    // Get all existing awards
    const { data: awards, error: awardsError } = await supabase
      .from('award_approvals')
      .select(`
        id,
        project_id,
        final_approved_quote_id,
        final_approved_supplier,
        approved_at,
        projects (
          trade
        )
      `)
      .order('approved_at', { ascending: false });

    if (awardsError) {
      console.error('[Migration] Error fetching awards:', awardsError);
      throw awardsError;
    }

    if (!awards || awards.length === 0) {
      console.log('[Migration] No awards found to migrate');
      return result;
    }

    result.totalAwards = awards.length;
    console.log(`[Migration] Found ${awards.length} awards to process`);

    // Process each award
    for (const award of awards) {
      try {
        // Check if baseline already exists
        const { data: existing } = await supabase
          .from('commercial_baseline_items')
          .select('id')
          .eq('award_approval_id', award.id)
          .limit(1)
          .single();

        if (existing) {
          console.log(`[Migration] ⏭️  Skipping award ${award.id} - baseline already exists`);
          result.skipped++;
          continue;
        }

        // Check if quote has items
        const { data: quoteItems } = await supabase
          .from('quote_items')
          .select('id')
          .eq('quote_id', award.final_approved_quote_id)
          .limit(1);

        if (!quoteItems || quoteItems.length === 0) {
          console.log(`[Migration] ⚠️  Skipping award ${award.id} - no quote items found`);
          result.skipped++;
          continue;
        }

        // Get trade key from project
        const tradeKey = (award.projects as any)?.trade || 'general';

        // Generate baseline
        console.log(`[Migration] 🔄 Generating baseline for award ${award.id} (${award.final_approved_supplier})...`);

        await generateCommercialBaseline({
          projectId: award.project_id,
          awardApprovalId: award.id,
          quoteId: award.final_approved_quote_id,
          tradeKey: tradeKey,
          includeAllowances: true,
          includeRetention: true,
          retentionPercentage: 5
        });

        console.log(`[Migration] ✅ Generated baseline for award ${award.id}`);
        result.generated++;

      } catch (error: any) {
        console.error(`[Migration] ❌ Failed for award ${award.id}:`, error);
        result.failed++;
        result.errors.push({
          awardId: award.id,
          error: error.message || 'Unknown error'
        });
      }
    }

    // Log summary
    console.log('[Migration] ===== MIGRATION COMPLETE =====');
    console.log(`[Migration] Total Awards: ${result.totalAwards}`);
    console.log(`[Migration] Generated: ${result.generated}`);
    console.log(`[Migration] Skipped: ${result.skipped}`);
    console.log(`[Migration] Failed: ${result.failed}`);

    if (result.errors.length > 0) {
      console.log('[Migration] Errors:');
      result.errors.forEach(e => {
        console.log(`  - ${e.awardId}: ${e.error}`);
      });
    }

    return result;

  } catch (error: any) {
    console.error('[Migration] Critical error:', error);
    throw error;
  }
}

/**
 * Migrate a specific award
 */
export async function migrateAward(awardApprovalId: string): Promise<boolean> {
  console.log(`[Migration] Migrating award: ${awardApprovalId}`);

  try {
    // Get award details
    const { data: award, error: awardError } = await supabase
      .from('award_approvals')
      .select(`
        id,
        project_id,
        final_approved_quote_id,
        projects (
          trade
        )
      `)
      .eq('id', awardApprovalId)
      .single();

    if (awardError || !award) {
      throw new Error('Award not found');
    }

    // Check if baseline already exists
    const { data: existing } = await supabase
      .from('commercial_baseline_items')
      .select('id')
      .eq('award_approval_id', awardApprovalId)
      .limit(1)
      .single();

    if (existing) {
      console.log('[Migration] Baseline already exists');
      return true;
    }

    // Get trade key
    const tradeKey = (award.projects as any)?.trade || 'general';

    // Generate baseline
    await generateCommercialBaseline({
      projectId: award.project_id,
      awardApprovalId: award.id,
      quoteId: award.final_approved_quote_id,
      tradeKey: tradeKey,
      includeAllowances: true,
      includeRetention: true,
      retentionPercentage: 5
    });

    console.log('[Migration] ✅ Baseline generated successfully');
    return true;

  } catch (error: any) {
    console.error('[Migration] Error:', error);
    throw error;
  }
}

/**
 * Verify migration completeness
 */
export async function verifyMigration(): Promise<{
  totalAwards: number;
  withBaseline: number;
  withoutBaseline: number;
  missingAwards: string[];
}> {
  console.log('[Migration] Verifying migration...');

  const { data: awards } = await supabase
    .from('award_approvals')
    .select('id');

  const totalAwards = awards?.length || 0;
  const missingAwards: string[] = [];
  let withBaseline = 0;

  for (const award of awards || []) {
    const { data: baseline } = await supabase
      .from('commercial_baseline_items')
      .select('id')
      .eq('award_approval_id', award.id)
      .limit(1)
      .single();

    if (baseline) {
      withBaseline++;
    } else {
      missingAwards.push(award.id);
    }
  }

  const result = {
    totalAwards,
    withBaseline,
    withoutBaseline: totalAwards - withBaseline,
    missingAwards
  };

  console.log('[Migration] Verification complete:');
  console.log(`  Total Awards: ${result.totalAwards}`);
  console.log(`  With Baseline: ${result.withBaseline}`);
  console.log(`  Without Baseline: ${result.withoutBaseline}`);

  if (missingAwards.length > 0) {
    console.log(`  Missing baselines for: ${missingAwards.join(', ')}`);
  }

  return result;
}
