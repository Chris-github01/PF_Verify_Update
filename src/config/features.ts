/**
 * FEATURE FLAGS CONFIGURATION
 *
 * Centralized feature flag management for the application.
 * Controls which features are enabled and their integration modes.
 */

export interface FeatureFlags {
  commercialControl: {
    enabled: boolean;
    independentMode: boolean; // true = no BOQ dependency (current default)
    boqIntegration: boolean;  // false = BOQ Builder not required (current default)
    autoGenerateBaseline: boolean; // Auto-generate baseline on award approval
  };
  boqBuilder: {
    enabled: boolean;
    tier1Support: boolean;
  };
  tradeModules: {
    enabled: boolean;
    allowMultipleTrades: boolean;
  };
}

/**
 * Current feature flag configuration
 */
export const features: FeatureFlags = {
  commercialControl: {
    enabled: true,
    independentMode: true,   // ✅ Commercial Control operates independently
    boqIntegration: false,   // ❌ BOQ Builder integration disabled (future feature)
    autoGenerateBaseline: true // ✅ Auto-generate baseline when supplier awarded
  },
  boqBuilder: {
    enabled: false,          // ❌ BOQ Builder not required for Commercial Control
    tier1Support: false
  },
  tradeModules: {
    enabled: true,
    allowMultipleTrades: true
  }
};

/**
 * Check if a feature is enabled
 */
export function isFeatureEnabled(feature: string): boolean {
  const parts = feature.split('.');
  let current: any = features;

  for (const part of parts) {
    if (current[part] === undefined) {
      return false;
    }
    current = current[part];
  }

  return Boolean(current);
}

/**
 * Get feature configuration
 */
export function getFeatureConfig<T>(feature: string): T | null {
  const parts = feature.split('.');
  let current: any = features;

  for (const part of parts) {
    if (current[part] === undefined) {
      return null;
    }
    current = current[part];
  }

  return current as T;
}

/**
 * Feature flag helpers for common checks
 */
export const FeatureChecks = {
  /**
   * Is Commercial Control operating in independent mode?
   */
  isCommercialControlIndependent(): boolean {
    return features.commercialControl.enabled && features.commercialControl.independentMode;
  },

  /**
   * Is BOQ Builder integration enabled?
   */
  isBOQIntegrationEnabled(): boolean {
    return features.commercialControl.boqIntegration && features.boqBuilder.enabled;
  },

  /**
   * Should baseline be auto-generated on award?
   */
  shouldAutoGenerateBaseline(): boolean {
    return features.commercialControl.enabled && features.commercialControl.autoGenerateBaseline;
  },

  /**
   * Can use BOQ Builder features?
   */
  canUseBOQBuilder(): boolean {
    return features.boqBuilder.enabled;
  }
};

/**
 * Development/Debug: Log current feature flags
 */
export function logFeatureFlags() {
  console.log('=== FEATURE FLAGS ===');
  console.log('Commercial Control:', features.commercialControl);
  console.log('BOQ Builder:', features.boqBuilder);
  console.log('Trade Modules:', features.tradeModules);
  console.log('=====================');
}
