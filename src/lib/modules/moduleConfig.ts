import type { TradeCategory } from './tradeRegistry';

export interface ModuleThresholds {
  minRegressionPassRate: number;
  maxAnomalyRate: number;
  maxRegressionDrop: number;
  maxFailuresIntroduced: number;
  confidenceMinimum: number;
}

export interface ModuleLearningParams {
  minPatternOccurrences: number;
  suggestionConfidenceThreshold: number;
  maxActiveSuggestions: number;
}

export interface ModulePredictiveWeights {
  regressionWeight: number;
  anomalyWeight: number;
  financialWeight: number;
  predictiveWeight: number;
}

export interface ModuleConfig {
  module_key: string;
  trade_category: TradeCategory;
  thresholds: ModuleThresholds;
  learning: ModuleLearningParams;
  predictive_weights: ModulePredictiveWeights;
  feature_flags: Record<string, boolean>;
  ruleConfig_source: string;
}

const DEFAULT_THRESHOLDS: ModuleThresholds = {
  minRegressionPassRate: 80,
  maxAnomalyRate: 10,
  maxRegressionDrop: 5,
  maxFailuresIntroduced: 5,
  confidenceMinimum: 4.0,
};

const DEFAULT_LEARNING: ModuleLearningParams = {
  minPatternOccurrences: 3,
  suggestionConfidenceThreshold: 6.0,
  maxActiveSuggestions: 20,
};

const DEFAULT_PREDICTIVE_WEIGHTS: ModulePredictiveWeights = {
  regressionWeight: 0.40,
  anomalyWeight: 0.25,
  financialWeight: 0.20,
  predictiveWeight: 0.15,
};

export const MODULE_CONFIGS: Record<string, ModuleConfig> = {
  plumbing_parser: {
    module_key: 'plumbing_parser',
    trade_category: 'plumbing',
    thresholds: { ...DEFAULT_THRESHOLDS, minRegressionPassRate: 85, maxAnomalyRate: 8 },
    learning: { ...DEFAULT_LEARNING, minPatternOccurrences: 2 },
    predictive_weights: DEFAULT_PREDICTIVE_WEIGHTS,
    feature_flags: {
      predictive_enabled: true,
      learning_enabled: true,
      optimization_enabled: true,
      review_enabled: true,
      shadow_enabled: true,
      cross_trade_learning: true,
    },
    ruleConfig_source: 'src/lib/modules/parsers/plumbing/ruleConfig.ts',
  },
  passive_fire_parser: {
    module_key: 'passive_fire_parser',
    trade_category: 'passive_fire',
    thresholds: DEFAULT_THRESHOLDS,
    learning: DEFAULT_LEARNING,
    predictive_weights: DEFAULT_PREDICTIVE_WEIGHTS,
    feature_flags: {
      predictive_enabled: false,
      learning_enabled: false,
      optimization_enabled: false,
      review_enabled: false,
      shadow_enabled: false,
      cross_trade_learning: false,
    },
    ruleConfig_source: 'protected',
  },
  active_fire_parser: {
    module_key: 'active_fire_parser',
    trade_category: 'active_fire',
    thresholds: DEFAULT_THRESHOLDS,
    learning: DEFAULT_LEARNING,
    predictive_weights: DEFAULT_PREDICTIVE_WEIGHTS,
    feature_flags: {
      predictive_enabled: false,
      learning_enabled: false,
      optimization_enabled: false,
      review_enabled: false,
      shadow_enabled: false,
      cross_trade_learning: false,
    },
    ruleConfig_source: 'src/importer/parsers/globalFireQuote.ts',
  },
  electrical_parser: {
    module_key: 'electrical_parser',
    trade_category: 'electrical',
    thresholds: DEFAULT_THRESHOLDS,
    learning: DEFAULT_LEARNING,
    predictive_weights: DEFAULT_PREDICTIVE_WEIGHTS,
    feature_flags: {
      predictive_enabled: false,
      learning_enabled: false,
      optimization_enabled: false,
      review_enabled: false,
      shadow_enabled: false,
      cross_trade_learning: false,
    },
    ruleConfig_source: 'pending',
  },
  hvac_parser: {
    module_key: 'hvac_parser',
    trade_category: 'hvac',
    thresholds: DEFAULT_THRESHOLDS,
    learning: DEFAULT_LEARNING,
    predictive_weights: DEFAULT_PREDICTIVE_WEIGHTS,
    feature_flags: {
      predictive_enabled: false,
      learning_enabled: false,
      optimization_enabled: false,
      review_enabled: false,
      shadow_enabled: false,
      cross_trade_learning: false,
    },
    ruleConfig_source: 'pending',
  },
};

export function getModuleConfig(moduleKey: string): ModuleConfig {
  return MODULE_CONFIGS[moduleKey] ?? {
    module_key: moduleKey,
    trade_category: 'generic',
    thresholds: DEFAULT_THRESHOLDS,
    learning: DEFAULT_LEARNING,
    predictive_weights: DEFAULT_PREDICTIVE_WEIGHTS,
    feature_flags: {},
    ruleConfig_source: 'unknown',
  };
}

export function isFeatureEnabled(moduleKey: string, flag: string): boolean {
  const config = getModuleConfig(moduleKey);
  return config.feature_flags[flag] ?? false;
}

export function getThresholds(moduleKey: string): ModuleThresholds {
  return getModuleConfig(moduleKey).thresholds;
}
