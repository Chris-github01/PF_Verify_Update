export type TradeCategory = 'plumbing' | 'passive_fire' | 'active_fire' | 'electrical' | 'hvac' | 'civil' | 'structural' | 'generic';
export type ModuleStatus = 'active' | 'beta' | 'experimental' | 'disabled';

export interface ModuleCapabilities {
  parsing: boolean;
  predictive: boolean;
  learning: boolean;
  optimization: boolean;
  review: boolean;
  shadow: boolean;
}

export interface TradeModuleDefinition {
  module_key: string;
  module_name: string;
  trade_category: TradeCategory;
  status: ModuleStatus;
  version: string;
  capabilities: ModuleCapabilities;
  description: string;
  parser_available: boolean;
  regression_suite_count: number;
}

export const TRADE_MODULES: Record<string, TradeModuleDefinition> = {
  plumbing_parser: {
    module_key: 'plumbing_parser',
    module_name: 'Plumbing Parser',
    trade_category: 'plumbing',
    status: 'active',
    version: '13.0.0',
    capabilities: { parsing: true, predictive: true, learning: true, optimization: true, review: true, shadow: true },
    description: 'Full-featured plumbing quote parser. Reference implementation for the intelligence platform.',
    parser_available: true,
    regression_suite_count: 0,
  },
  passive_fire_parser: {
    module_key: 'passive_fire_parser',
    module_name: 'Passive Fire Parser',
    trade_category: 'passive_fire',
    status: 'active',
    version: '2.0.0',
    capabilities: { parsing: true, predictive: false, learning: false, optimization: false, review: false, shadow: false },
    description: 'Passive fire protection quote parser. Isolated and protected. Intelligence expansion scheduled.',
    parser_available: true,
    regression_suite_count: 0,
  },
  active_fire_parser: {
    module_key: 'active_fire_parser',
    module_name: 'Active Fire Parser',
    trade_category: 'active_fire',
    status: 'experimental',
    version: '0.1.0',
    capabilities: { parsing: true, predictive: false, learning: false, optimization: false, review: false, shadow: false },
    description: 'Active fire protection parser. Parsing exists; intelligence layer pending.',
    parser_available: true,
    regression_suite_count: 0,
  },
  electrical_parser: {
    module_key: 'electrical_parser',
    module_name: 'Electrical Parser',
    trade_category: 'electrical',
    status: 'experimental',
    version: '0.1.0',
    capabilities: { parsing: false, predictive: false, learning: false, optimization: false, review: false, shadow: false },
    description: 'Electrical trade parser. Scaffolding complete. Parser implementation pending.',
    parser_available: false,
    regression_suite_count: 0,
  },
  hvac_parser: {
    module_key: 'hvac_parser',
    module_name: 'HVAC Parser',
    trade_category: 'hvac',
    status: 'experimental',
    version: '0.1.0',
    capabilities: { parsing: false, predictive: false, learning: false, optimization: false, review: false, shadow: false },
    description: 'HVAC trade parser. Scaffolding complete. Parser implementation pending.',
    parser_available: false,
    regression_suite_count: 0,
  },
};

export function getModule(moduleKey: string): TradeModuleDefinition | undefined {
  return TRADE_MODULES[moduleKey];
}

export function getActiveModules(): TradeModuleDefinition[] {
  return Object.values(TRADE_MODULES).filter((m) => m.status !== 'disabled');
}

export function getModulesWithCapability(capability: keyof ModuleCapabilities): TradeModuleDefinition[] {
  return Object.values(TRADE_MODULES).filter((m) => m.capabilities[capability]);
}

export function hasCapability(moduleKey: string, capability: keyof ModuleCapabilities): boolean {
  return TRADE_MODULES[moduleKey]?.capabilities[capability] ?? false;
}

export const CAPABILITY_LABELS: Record<keyof ModuleCapabilities, string> = {
  parsing: 'Parsing',
  predictive: 'Predictive',
  learning: 'Learning',
  optimization: 'Optimization',
  review: 'Review',
  shadow: 'Shadow',
};

export const STATUS_COLORS: Record<ModuleStatus, string> = {
  active: 'text-teal-300',
  beta: 'text-cyan-300',
  experimental: 'text-amber-300',
  disabled: 'text-gray-600',
};

export const TRADE_COLORS: Record<TradeCategory, string> = {
  plumbing: 'text-blue-300',
  passive_fire: 'text-orange-300',
  active_fire: 'text-red-300',
  electrical: 'text-yellow-300',
  hvac: 'text-cyan-300',
  civil: 'text-stone-300',
  structural: 'text-gray-300',
  generic: 'text-gray-400',
};
