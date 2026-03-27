import { supabase } from '../../supabase';
import { getShadowVersion } from './shadowVersioningService';

export type RolloutStage = 'shadow_only' | 'limited' | 'expanded' | 'full';
export type RolloutStatus = 'planned' | 'active' | 'paused' | 'rolled_back' | 'completed';

export interface RolloutPlan {
  id: string;
  version_id: string;
  module_key: string;
  rollout_stage: RolloutStage;
  rollout_percentage: number;
  success_metrics_json: Record<string, unknown>;
  rollback_trigger_conditions_json: Record<string, unknown>;
  status: RolloutStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  activated_at: string | null;
  completed_at: string | null;
}

export interface RolloutPlanEvent {
  id: string;
  rollout_plan_id: string;
  event_type: string;
  description: string;
  previous_stage: string | null;
  new_stage: string | null;
  previous_status: string | null;
  new_status: string | null;
  actor_user_id: string | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
}

// Default success metrics for each stage
const DEFAULT_SUCCESS_METRICS: Record<RolloutStage, Record<string, unknown>> = {
  shadow_only: {
    min_run_count: 5,
    max_error_rate_pct: 5,
    min_confidence_score: 60,
  },
  limited: {
    min_run_count: 10,
    max_error_rate_pct: 3,
    min_confidence_score: 70,
    max_risk_score: 60,
  },
  expanded: {
    min_run_count: 25,
    max_error_rate_pct: 2,
    min_confidence_score: 75,
    max_risk_score: 50,
  },
  full: {
    min_run_count: 50,
    max_error_rate_pct: 1,
    min_confidence_score: 80,
    max_risk_score: 40,
  },
};

const DEFAULT_ROLLBACK_CONDITIONS: Record<string, unknown> = {
  max_error_rate_pct: 10,
  max_risk_score: 80,
  min_confidence_score: 40,
  max_consecutive_failures: 3,
};

const STAGE_PERCENTAGES: Record<RolloutStage, number> = {
  shadow_only: 0,
  limited: 10,
  expanded: 40,
  full: 100,
};

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createRolloutPlan(params: {
  versionId: string;
  moduleKey: string;
  notes?: string;
}): Promise<RolloutPlan> {
  const version = await getShadowVersion(params.versionId);
  if (!version) throw new Error(`[Phase4/Rollout] Version ${params.versionId} not found`);
  if (version.status !== 'approved') {
    throw new Error(`[Phase4/Rollout] Version must be in 'approved' status before creating a rollout plan (current: ${version.status})`);
  }

  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('rollout_plans')
    .insert({
      version_id: params.versionId,
      module_key: params.moduleKey,
      rollout_stage: 'shadow_only',
      rollout_percentage: 0,
      success_metrics_json: DEFAULT_SUCCESS_METRICS.shadow_only,
      rollback_trigger_conditions_json: DEFAULT_ROLLBACK_CONDITIONS,
      status: 'planned',
      notes: params.notes ?? null,
      created_by: user?.id ?? null,
    })
    .select('*')
    .single();

  if (error) throw new Error(`[Phase4/Rollout] createRolloutPlan failed: ${error.message}`);

  await logRolloutEvent(data.id as string, {
    eventType: 'plan_created',
    description: `Rollout plan created for version ${version.version_name}`,
    newStage: 'shadow_only',
    newStatus: 'planned',
  });

  console.log(`[Phase4/Rollout] Plan created: planId=${data.id} version=${version.version_name} module=${params.moduleKey}`);
  return data as RolloutPlan;
}

// ---------------------------------------------------------------------------
// Stage advancement (human-triggered only)
// ---------------------------------------------------------------------------

export async function advanceRolloutStage(
  planId: string,
): Promise<RolloutPlan> {
  const plan = await getRolloutPlan(planId);
  if (!plan) throw new Error(`[Phase4/Rollout] Plan ${planId} not found`);
  if (plan.status === 'rolled_back' || plan.status === 'completed') {
    throw new Error(`[Phase4/Rollout] Cannot advance a ${plan.status} rollout`);
  }

  const stageOrder: RolloutStage[] = ['shadow_only', 'limited', 'expanded', 'full'];
  const currentIdx = stageOrder.indexOf(plan.rollout_stage);
  if (currentIdx === stageOrder.length - 1) {
    throw new Error('[Phase4/Rollout] Already at full rollout stage');
  }

  const nextStage = stageOrder[currentIdx + 1];
  const nextPercentage = STAGE_PERCENTAGES[nextStage];
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('rollout_plans')
    .update({
      rollout_stage: nextStage,
      rollout_percentage: nextPercentage,
      success_metrics_json: DEFAULT_SUCCESS_METRICS[nextStage],
      status: 'active',
      activated_at: plan.activated_at ?? now,
      updated_at: now,
    })
    .eq('id', planId)
    .select('*')
    .single();

  if (error) throw new Error(`[Phase4/Rollout] advanceRolloutStage failed: ${error.message}`);

  await logRolloutEvent(planId, {
    eventType: 'stage_advanced',
    description: `Rollout advanced from ${plan.rollout_stage} to ${nextStage} (${nextPercentage}%)`,
    previousStage: plan.rollout_stage,
    newStage: nextStage,
    previousStatus: plan.status,
    newStatus: 'active',
  });

  console.log(`[Phase4/Rollout] Stage advanced: planId=${planId} ${plan.rollout_stage} → ${nextStage}`);
  return data as RolloutPlan;
}

// ---------------------------------------------------------------------------
// Pause
// ---------------------------------------------------------------------------

export async function pauseRollout(planId: string, reason?: string): Promise<void> {
  const plan = await getRolloutPlan(planId);
  if (!plan) throw new Error(`[Phase4/Rollout] Plan ${planId} not found`);

  await supabase
    .from('rollout_plans')
    .update({ status: 'paused', updated_at: new Date().toISOString() })
    .eq('id', planId);

  await logRolloutEvent(planId, {
    eventType: 'rollout_paused',
    description: reason ?? 'Rollout paused by admin',
    previousStatus: plan.status,
    newStatus: 'paused',
  });
}

// ---------------------------------------------------------------------------
// Rollback
// ---------------------------------------------------------------------------

export async function rollbackPlan(planId: string, reason?: string): Promise<void> {
  const plan = await getRolloutPlan(planId);
  if (!plan) throw new Error(`[Phase4/Rollout] Plan ${planId} not found`);

  const now = new Date().toISOString();
  await supabase
    .from('rollout_plans')
    .update({
      status: 'rolled_back',
      rollout_stage: 'shadow_only',
      rollout_percentage: 0,
      updated_at: now,
    })
    .eq('id', planId);

  await logRolloutEvent(planId, {
    eventType: 'rollback_triggered',
    description: reason ?? 'Rollback triggered by admin',
    previousStage: plan.rollout_stage,
    newStage: 'shadow_only',
    previousStatus: plan.status,
    newStatus: 'rolled_back',
    metadata: { reason },
  });

  console.log(`[Phase4/Rollout] Rollback triggered: planId=${planId} reason=${reason ?? 'no reason given'}`);
}

// ---------------------------------------------------------------------------
// Complete
// ---------------------------------------------------------------------------

export async function completeRollout(planId: string): Promise<void> {
  const plan = await getRolloutPlan(planId);
  if (!plan) throw new Error(`[Phase4/Rollout] Plan ${planId} not found`);
  if (plan.rollout_stage !== 'full') {
    throw new Error('[Phase4/Rollout] Can only complete a rollout that has reached full stage');
  }

  const now = new Date().toISOString();
  await supabase
    .from('rollout_plans')
    .update({ status: 'completed', completed_at: now, updated_at: now })
    .eq('id', planId);

  await logRolloutEvent(planId, {
    eventType: 'rollout_completed',
    description: 'Rollout completed successfully at 100%',
    previousStatus: plan.status,
    newStatus: 'completed',
  });
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function getRolloutPlans(moduleKey?: string): Promise<RolloutPlan[]> {
  let q = supabase
    .from('rollout_plans')
    .select('*')
    .order('created_at', { ascending: false });

  if (moduleKey) q = q.eq('module_key', moduleKey);

  const { data, error } = await q;
  if (error) return [];
  return (data ?? []) as RolloutPlan[];
}

export async function getRolloutPlan(planId: string): Promise<RolloutPlan | null> {
  const { data, error } = await supabase
    .from('rollout_plans')
    .select('*')
    .eq('id', planId)
    .maybeSingle();

  if (error) return null;
  return data as RolloutPlan | null;
}

export async function getRolloutPlanEvents(planId: string): Promise<RolloutPlanEvent[]> {
  const { data, error } = await supabase
    .from('rollout_plan_events')
    .select('*')
    .eq('rollout_plan_id', planId)
    .order('created_at', { ascending: false });

  if (error) return [];
  return (data ?? []) as RolloutPlanEvent[];
}

// ---------------------------------------------------------------------------
// Internal event logging
// ---------------------------------------------------------------------------

async function logRolloutEvent(
  planId: string,
  params: {
    eventType: string;
    description: string;
    previousStage?: string;
    newStage?: string;
    previousStatus?: string;
    newStatus?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await supabase.from('rollout_plan_events').insert({
    rollout_plan_id: planId,
    event_type: params.eventType,
    description: params.description,
    previous_stage: params.previousStage ?? null,
    new_stage: params.newStage ?? null,
    previous_status: params.previousStatus ?? null,
    new_status: params.newStatus ?? null,
    actor_user_id: user?.id ?? null,
    metadata_json: params.metadata ?? {},
  });

  if (error) {
    console.warn(`[Phase4/Rollout] logRolloutEvent failed: ${error.message}`);
  }
}
