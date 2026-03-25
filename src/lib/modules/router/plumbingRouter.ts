import { resolveFlag } from '../../shadow/featureFlags';
import { isInternalUser, getCurrentUserOrgId } from '../../auth/isInternalUser';

export type PlumbingRouterDecision = 'live' | 'shadow';
export type PlumbingRolloutContext = 'internal_beta' | 'org_beta' | 'percentage_beta';

export interface PlumbingRoutingContext {
  userId?: string;
  orgId?: string;
  environment?: 'development' | 'staging' | 'production';
}

export interface PlumbingRouterResult {
  decision: PlumbingRouterDecision;
  rolloutContext?: PlumbingRolloutContext;
}

function simpleHash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export async function resolvePlumbingParser(
  ctx?: PlumbingRoutingContext
): Promise<PlumbingRouterResult> {
  const env = ctx?.environment ?? 'production';

  const killSwitch = await resolveFlag('plumbing_parser.kill_switch', {
    userId: ctx?.userId,
    orgId: ctx?.orgId,
    environment: env,
  });
  if (killSwitch.enabled) return { decision: 'live' };

  const betaEnabled = await resolveFlag('plumbing_parser.beta_enabled', {
    userId: ctx?.userId,
    orgId: ctx?.orgId,
    environment: env,
  });
  if (!betaEnabled.enabled) return { decision: 'live' };

  const internalOnly = await resolveFlag('plumbing_parser.internal_only', {
    userId: ctx?.userId,
    orgId: ctx?.orgId,
    environment: env,
  });
  if (internalOnly.enabled) {
    const internal = await isInternalUser();
    return internal
      ? { decision: 'shadow', rolloutContext: 'internal_beta' }
      : { decision: 'live' };
  }

  const allowedOrgs = await resolveFlag('plumbing_parser.allowed_orgs', {
    userId: ctx?.userId,
    orgId: ctx?.orgId,
    environment: env,
  });
  if (allowedOrgs.enabled) {
    const orgIds = (allowedOrgs.config as { orgIds?: string[] }).orgIds ?? [];
    const orgId = ctx?.orgId ?? await getCurrentUserOrgId() ?? '';
    if (orgIds.length > 0 && orgIds.includes(orgId)) {
      return { decision: 'shadow', rolloutContext: 'org_beta' };
    }
  }

  const pctFlag = await resolveFlag('plumbing_parser.rollout_percentage', {
    userId: ctx?.userId,
    orgId: ctx?.orgId,
    environment: env,
  });
  if (pctFlag.enabled) {
    const pct = (pctFlag.config as { percentage?: number }).percentage ?? 0;
    if (pct > 0) {
      const basis = ctx?.orgId ?? ctx?.userId ?? '';
      const hash = simpleHash('plumbing_parser' + basis) % 100;
      if (hash < pct) return { decision: 'shadow', rolloutContext: 'percentage_beta' };
    }
  }

  return { decision: 'live' };
}

export async function isKillSwitchActive(): Promise<boolean> {
  const { enabled } = await resolveFlag('plumbing_parser.kill_switch', {
    environment: 'production',
  });
  return enabled;
}
