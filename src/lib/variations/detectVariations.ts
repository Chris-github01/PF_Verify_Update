import { supabase } from '../supabase';
import type { CreateVariationPayload } from '../../types/variations.types';
import { DETECTION_RULES } from '../../types/variations.types';

export interface DetectVariationsParams {
  projectId: string;
  claimItem: any;
  baseItem: any | null;
  variancePct: number;
}

export interface DetectVariationsResult {
  variationsCreated: number;
  variationIds: string[];
}

const QTY_EXCEED_THRESHOLD = 10;

export async function detectAndCreateVariations(
  params: DetectVariationsParams
): Promise<DetectVariationsResult> {
  const { projectId, claimItem, baseItem, variancePct } = params;

  const variations: CreateVariationPayload[] = [];

  if (!baseItem) {
    variations.push({
      projectId,
      source: 'Claim',
      description: `New item not in base: ${claimItem.description}`,
      qty: claimItem.qty_claimed,
      unit: claimItem.unit,
      unit_rate: claimItem.unit_rate,
      total: claimItem.amount,
      reason: 'Scope',
      status: 'Pending',
      claim_id: claimItem.id,
      auto_created: true,
      detection_rule: DETECTION_RULES.ITEM_NOT_IN_BASE,
      date_identified: new Date().toISOString().split('T')[0],
    });
  } else {
    if (claimItem.unit !== baseItem.unit) {
      variations.push({
        projectId,
        source: 'Claim',
        description: `Unit changed from ${baseItem.unit} to ${claimItem.unit}: ${claimItem.description}`,
        qty: claimItem.qty_claimed,
        unit: claimItem.unit,
        unit_rate: claimItem.unit_rate,
        total: claimItem.amount,
        reason: 'Scope',
        status: 'Pending',
        base_tracker_id: baseItem.id,
        claim_id: claimItem.id,
        auto_created: true,
        detection_rule: DETECTION_RULES.UNIT_CHANGED,
        date_identified: new Date().toISOString().split('T')[0],
      });
    }

    if (variancePct > QTY_EXCEED_THRESHOLD) {
      const excessQty = claimItem.qty_total - baseItem.qty_base;
      const excessValue = excessQty * baseItem.unit_rate;

      variations.push({
        projectId,
        source: 'Claim',
        description: `Quantity exceeds base by ${variancePct.toFixed(1)}%: ${claimItem.description}`,
        qty: excessQty,
        unit: baseItem.unit,
        unit_rate: baseItem.unit_rate,
        total: excessValue,
        reason: 'Scope',
        status: 'Pending',
        base_tracker_id: baseItem.id,
        claim_id: claimItem.id,
        auto_created: true,
        detection_rule: DETECTION_RULES.QTY_EXCEEDS_BASE,
        date_identified: new Date().toISOString().split('T')[0],
      });
    }

    if (
      claimItem.unit_rate !== baseItem.unit_rate &&
      Math.abs(claimItem.unit_rate - baseItem.unit_rate) > 0.01
    ) {
      const rateDiff = claimItem.unit_rate - baseItem.unit_rate;
      const impactValue = rateDiff * claimItem.qty_total;

      variations.push({
        projectId,
        source: 'Claim',
        description: `Rate changed from $${baseItem.unit_rate} to $${claimItem.unit_rate}: ${claimItem.description}`,
        qty: claimItem.qty_total,
        unit: claimItem.unit,
        unit_rate: rateDiff,
        total: impactValue,
        reason: 'VO',
        status: 'Pending',
        base_tracker_id: baseItem.id,
        claim_id: claimItem.id,
        auto_created: true,
        detection_rule: DETECTION_RULES.RATE_CHANGED,
        date_identified: new Date().toISOString().split('T')[0],
      });
    }
  }

  if (variations.length === 0) {
    return {
      variationsCreated: 0,
      variationIds: [],
    };
  }

  const variationRecords = variations.map((v, index) => ({
    project_id: v.projectId,
    variation_number: generateVariationNumber(projectId, index),
    source: v.source,
    description: v.description,
    qty: v.qty,
    unit: v.unit,
    unit_rate: v.unit_rate,
    total: v.total,
    reason: v.reason,
    status: v.status || 'Pending',
    linked_ref: v.linked_ref || '',
    date_identified: v.date_identified || null,
    date_submitted: v.date_submitted || null,
    date_approved: v.date_approved || null,
    date_billed: v.date_billed || null,
    base_tracker_id: v.base_tracker_id || null,
    claim_id: v.claim_id || null,
    auto_created: v.auto_created || false,
    detection_rule: v.detection_rule || '',
    notes: v.notes || '',
  }));

  const { data: created, error } = await supabase
    .from('variations')
    .insert(variationRecords)
    .select('id');

  if (error) {
    console.error('Failed to create variations:', error);
    return {
      variationsCreated: 0,
      variationIds: [],
    };
  }

  return {
    variationsCreated: created?.length || 0,
    variationIds: created?.map((v) => v.id) || [],
  };
}

function generateVariationNumber(projectId: string, index: number): string {
  const timestamp = Date.now();
  return `VAR-${timestamp}-${index + 1}`;
}
