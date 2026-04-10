export const EXPERIMENTS = {
  SHADOW_LOGGING: true,
  MOCK_AI_ANALYSIS: true,
  ADVANCED_SCOPE_GAP_DETECTION: false,
  LLM_INTEGRATION: false,
} as const;

export type ExperimentKey = keyof typeof EXPERIMENTS;

export function isExperimentEnabled(key: ExperimentKey): boolean {
  const enabled = EXPERIMENTS[key];
  console.log(`[VERIFYTRADE NEXT] Experiment "${key}" is ${enabled ? 'ENABLED' : 'DISABLED'}`);
  return enabled;
}
