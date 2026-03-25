export type AdminRole = 'internal_admin' | 'god_mode';

export type ModuleType = 'parser' | 'scoring' | 'export' | 'classifier' | 'workflow';

export type RolloutStatus =
  | 'live_only'
  | 'shadow_only'
  | 'internal_beta'
  | 'org_beta'
  | 'partial_rollout'
  | 'global_live'
  | 'rolled_back';

export type RunMode = 'shadow_only' | 'live_vs_shadow' | 'regression_suite';

export type RunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export type DraftStatus = 'draft' | 'approved' | 'rejected' | 'promoted' | 'archived';

export type FeatureFlagTargetType = 'global' | 'user' | 'org' | 'role' | 'percentage';

export type RolloutEventType =
  | 'shadow_enabled'
  | 'beta_enabled'
  | 'org_rollout_enabled'
  | 'global_promoted'
  | 'rollback_triggered'
  | 'kill_switch_enabled'
  | 'kill_switch_disabled';

export interface AdminRoleRecord {
  id: string;
  user_id: string;
  role: AdminRole;
  created_at: string;
  created_by?: string;
}

export interface ModuleRegistryRecord {
  id: string;
  module_key: string;
  module_name: string;
  module_type: ModuleType;
  description?: string;
  is_shadow_enabled: boolean;
  created_at: string;
}

export interface ModuleVersionRecord {
  id: string;
  module_key: string;
  live_version: string;
  shadow_version?: string;
  promoted_candidate_version?: string;
  rollback_version?: string;
  rollout_status: RolloutStatus;
  updated_at: string;
  updated_by?: string;
}

export interface FeatureFlagRecord {
  id: string;
  flag_key: string;
  module_key?: string;
  environment: 'development' | 'staging' | 'production';
  target_type: FeatureFlagTargetType;
  target_id?: string;
  enabled: boolean;
  config_json: Record<string, unknown>;
  priority: number;
  starts_at?: string;
  ends_at?: string;
  created_at: string;
  created_by?: string;
  updated_at: string;
  updated_by?: string;
}

export interface ShadowRunRecord {
  id: string;
  module_key: string;
  source_type: string;
  source_id: string;
  source_label?: string;
  initiated_by: string;
  org_id?: string;
  live_version?: string;
  shadow_version?: string;
  run_mode: RunMode;
  status: RunStatus;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
  metadata_json: Record<string, unknown>;
  created_at: string;
}

export interface ShadowRunResultRecord {
  id: string;
  shadow_run_id: string;
  result_type: 'live' | 'shadow' | 'diff' | 'summary';
  output_json: Record<string, unknown>;
  metrics_json: Record<string, unknown>;
  created_at: string;
}

export interface ShadowDraftRecord {
  id: string;
  module_key: string;
  source_type: string;
  source_id: string;
  draft_name: string;
  payload_json: Record<string, unknown>;
  status: DraftStatus;
  created_by: string;
  approved_by?: string;
  promoted_by?: string;
  created_at: string;
  updated_at: string;
}

export interface RolloutEventRecord {
  id: string;
  module_key: string;
  event_type: RolloutEventType;
  previous_state_json?: Record<string, unknown>;
  new_state_json?: Record<string, unknown>;
  triggered_by: string;
  created_at: string;
}

export interface AdminAuditLogRecord {
  id: string;
  actor_user_id: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  module_key?: string;
  before_json?: Record<string, unknown>;
  after_json?: Record<string, unknown>;
  metadata_json: Record<string, unknown>;
  created_at: string;
}

export interface RegressionSuiteRecord {
  id: string;
  module_key: string;
  suite_name: string;
  description?: string;
  created_by: string;
  created_at: string;
}

export interface RegressionSuiteCaseRecord {
  id: string;
  suite_id: string;
  source_type: string;
  source_id: string;
  expected_json?: Record<string, unknown>;
  created_at: string;
}

export interface RegressionSuiteRunRecord {
  id: string;
  suite_id: string;
  module_key: string;
  version_under_test: string;
  initiated_by: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  summary_json: Record<string, unknown>;
  started_at?: string;
  completed_at?: string;
  created_at: string;
}

export interface ModuleExecutionContext {
  moduleKey: string;
  sourceType: string;
  sourceId: string;
  orgId?: string;
  actorUserId: string;
  environment: 'development' | 'staging' | 'production';
  mode: 'live' | 'shadow';
}

export interface ModuleExecutionResult {
  status: 'success' | 'warning' | 'error';
  version: string;
  output: Record<string, unknown>;
  metrics?: Record<string, unknown>;
  warnings?: string[];
  errors?: string[];
}

export interface ComparableModuleOutput {
  summary: Record<string, unknown>;
  items: Array<Record<string, unknown>>;
  totals: {
    parsedValue?: number;
    documentValue?: number;
    itemCount?: number;
  };
  warnings: string[];
  errors: string[];
}

export interface ModuleDiff {
  totalsDelta?: number;
  totalsMatch: boolean;
  addedItems: Array<Record<string, unknown>>;
  removedItems: Array<Record<string, unknown>>;
  changedItems: Array<{ before: Record<string, unknown>; after: Record<string, unknown> }>;
  addedWarnings: string[];
  removedWarnings: string[];
  itemCountDelta: number;
  passRating: 'pass' | 'warn' | 'fail';
}

export interface ShadowCompareResult {
  runId: string;
  moduleKey: string;
  sourceId: string;
  liveOutput: ComparableModuleOutput;
  shadowOutput: ComparableModuleOutput;
  diff: ModuleDiff;
  liveVersion: string;
  shadowVersion: string;
  completedAt: string;
}
