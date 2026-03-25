import { supabase } from '../supabase';
import type { FeatureFlagRecord } from '../../types/shadow';

export interface FlagResolutionContext {
  userId?: string;
  orgId?: string;
  role?: string;
  environment?: 'development' | 'staging' | 'production';
}

export async function resolveFlag(
  flagKey: string,
  context: FlagResolutionContext = {}
): Promise<{ enabled: boolean; config: Record<string, unknown> }> {
  const env = context.environment ?? 'production';

  const { data: flags } = await supabase
    .from('feature_flags')
    .select('*')
    .eq('flag_key', flagKey)
    .eq('environment', env)
    .order('priority', { ascending: true });

  if (!flags || flags.length === 0) return { enabled: false, config: {} };

  const now = new Date();

  for (const flag of flags as FeatureFlagRecord[]) {
    if (flag.starts_at && new Date(flag.starts_at) > now) continue;
    if (flag.ends_at && new Date(flag.ends_at) < now) continue;

    switch (flag.target_type) {
      case 'global':
        return { enabled: flag.enabled, config: flag.config_json };

      case 'user':
        if (flag.target_id === context.userId) {
          return { enabled: flag.enabled, config: flag.config_json };
        }
        break;

      case 'org':
        if (flag.target_id === context.orgId) {
          return { enabled: flag.enabled, config: flag.config_json };
        }
        break;

      case 'role':
        if (flag.target_id === context.role) {
          return { enabled: flag.enabled, config: flag.config_json };
        }
        break;

      case 'percentage': {
        const basis = context.orgId ?? context.userId ?? '';
        const hash = simpleHash(flagKey + basis);
        const pct = (flag.config_json as { percentage?: number }).percentage ?? 0;
        if (hash % 100 < pct) {
          return { enabled: flag.enabled, config: flag.config_json };
        }
        break;
      }
    }
  }

  return { enabled: false, config: {} };
}

export async function isKillSwitchActive(moduleKey: string): Promise<boolean> {
  const { enabled } = await resolveFlag(`kill_switch.${moduleKey}`);
  return enabled;
}

export async function isShadowEnabled(moduleKey: string, context: FlagResolutionContext = {}): Promise<boolean> {
  const { enabled } = await resolveFlag(`shadow.${moduleKey}.enabled`, context);
  return enabled;
}

export async function getAllFlags(): Promise<FeatureFlagRecord[]> {
  const { data } = await supabase
    .from('feature_flags')
    .select('*')
    .order('flag_key', { ascending: true });
  return (data ?? []) as FeatureFlagRecord[];
}

export async function upsertFlag(flag: Partial<FeatureFlagRecord> & { flag_key: string; target_type: string }): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from('feature_flags').upsert({
    ...flag,
    updated_at: new Date().toISOString(),
    updated_by: user?.id,
  });
}

function simpleHash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
