import { supabase } from '../supabase';
import type { ImportClaimPayload, ClaimItemInput } from '../../types/claims.types';

export interface ImportClaimsResult {
  success: boolean;
  claimItemsCreated: number;
  claimIds: string[];
  error?: string;
}

export async function importClaims(
  payload: ImportClaimPayload
): Promise<ImportClaimsResult> {
  const { projectId, claimNumber, period, items } = payload;

  try {
    const claimItems: any[] = items.map((item) => ({
      project_id: projectId,
      claim_number: claimNumber,
      period: period,
      description: item.description,
      qty_claimed: item.qty_claimed,
      qty_previous: item.qty_previous || 0,
      qty_total: (item.qty_previous || 0) + item.qty_claimed,
      unit: item.unit,
      unit_rate: item.unit_rate,
      amount: item.amount,
      certified_qty: item.certified_qty || item.qty_claimed,
      certified_amount: item.certified_amount || item.amount,
      retentions: item.retentions || 0,
      deductions: item.deductions || 0,
      base_tracker_id: null,
      matching_confidence: 0,
      matching_method: '',
      variance_pct: 0,
      variance_flag: '',
      raw_data: item,
    }));

    const { data: created, error: insertError } = await supabase
      .from('payment_claims')
      .insert(claimItems)
      .select('id');

    if (insertError) {
      return {
        success: false,
        claimItemsCreated: 0,
        claimIds: [],
        error: insertError.message,
      };
    }

    return {
      success: true,
      claimItemsCreated: created?.length || 0,
      claimIds: created?.map((item) => item.id) || [],
    };
  } catch (error: any) {
    return {
      success: false,
      claimItemsCreated: 0,
      claimIds: [],
      error: error.message || 'Unknown error occurred',
    };
  }
}
