import type { TradeModule, TradeSpec, ValidationRule } from './types';
import { passiveFireSpec } from './specs/passiveFireSpec';
import { electricalSpec } from './specs/electricalSpec';
import { activeFireSpec } from './specs/activeFireSpec';
import { hvacSpec } from './specs/hvacSpec';
import { plumbingSpec } from './specs/plumbingSpec';
import { carpentrySpec } from './specs/carpentrySpec';

const TRADE_SPECS: Record<TradeModule, TradeSpec> = {
  passive_fire: passiveFireSpec,
  electrical: electricalSpec,
  active_fire: activeFireSpec,
  hvac: hvacSpec,
  plumbing: plumbingSpec,
  carpentry: carpentrySpec,
};

export function getTradeSpec(tradeModule: TradeModule): TradeSpec {
  return TRADE_SPECS[tradeModule];
}

export function getAllTradeSpecs(): TradeSpec[] {
  return Object.values(TRADE_SPECS);
}

export interface GroupedScopeItem {
  groupName: string;
  items: Array<{
    service_type: string;
    coverage: string;
    item_count: number;
    details: string[];
  }>;
  totalItems: number;
}

export function applyGroupingRules(
  scopeSystems: Array<{ service_type: string; coverage: string; item_count: number; details: string[] }>,
  tradeModule: TradeModule
): GroupedScopeItem[] {
  const spec = getTradeSpec(tradeModule);
  const { groupingRules } = spec;

  const grouped = new Map<string, GroupedScopeItem>();

  scopeSystems.forEach(system => {
    const serviceType = system.service_type.toLowerCase();
    let matchedGroup = 'Other Systems';

    for (const rule of groupingRules) {
      const matches = rule.keywords.some(kw => serviceType.includes(kw.toLowerCase()));
      if (matches) {
        matchedGroup = rule.groupName;
        break;
      }
    }

    if (!grouped.has(matchedGroup)) {
      grouped.set(matchedGroup, {
        groupName: matchedGroup,
        items: [],
        totalItems: 0,
      });
    }

    const group = grouped.get(matchedGroup)!;
    group.items.push(system);
    group.totalItems += system.item_count;
  });

  const specGroupNames = groupingRules.map(r => r.groupName);
  const result: GroupedScopeItem[] = [];

  specGroupNames.forEach(name => {
    if (grouped.has(name)) {
      result.push(grouped.get(name)!);
    }
  });

  if (grouped.has('Other Systems')) {
    result.push(grouped.get('Other Systems')!);
  }

  return result;
}

export interface ValidationResult {
  rule: ValidationRule;
  passed: boolean;
  message: string;
}

export interface TradeValidationReport {
  tradeModule: TradeModule;
  passed: boolean;
  errors: ValidationResult[];
  warnings: ValidationResult[];
  allResults: ValidationResult[];
}

interface ContractData {
  scopeSystems?: Array<{ service_type: string; item_count: number }>;
  clauses?: string[];
  checklistItems?: string[];
  region?: 'NZ' | 'AU' | 'both';
}

export function runTradeValidation(
  tradeModule: TradeModule,
  contractData: ContractData
): TradeValidationReport {
  const spec = getTradeSpec(tradeModule);
  const results: ValidationResult[] = [];

  spec.validationRules.forEach(rule => {
    let passed = true;
    let message = '';

    switch (rule.id) {
      case 'val-pf-001':
        passed = (contractData.scopeSystems?.length ?? 0) > 0;
        message = passed ? 'Scope items present' : rule.message;
        break;

      case 'val-pf-002':
        passed = contractData.clauses?.some(c => c.includes('testing') || c.includes('inspection')) ?? false;
        message = passed ? 'Testing clause found' : rule.message;
        break;

      case 'val-af-001':
        passed = contractData.clauses?.some(c => c.toLowerCase().includes('cause') || c.toLowerCase().includes('commissioning')) ?? false;
        message = passed ? 'Commissioning clause found' : rule.message;
        break;

      case 'val-af-002':
        if (contractData.region === 'NZ') {
          passed = contractData.clauses?.some(c => c.toLowerCase().includes('ps3') || c.toLowerCase().includes('producer')) ?? false;
          message = passed ? 'PS3 clause found' : rule.message;
        } else {
          passed = true;
          message = 'PS3 not required for this region';
        }
        break;

      case 'val-elec-001':
        if (contractData.region === 'NZ') {
          passed = contractData.clauses?.some(c => c.toLowerCase().includes('coc') || c.toLowerCase().includes('certificate of compliance')) ?? false;
          message = passed ? 'CoC clause found' : rule.message;
        } else {
          passed = true;
          message = 'CoC requirement varies by jurisdiction';
        }
        break;

      case 'val-elec-002':
        passed = contractData.clauses?.some(c => c.toLowerCase().includes('3000') || c.toLowerCase().includes('wiring rules')) ?? false;
        message = passed ? 'AS/NZS 3000 clause found' : rule.message;
        break;

      case 'val-hvac-001':
        passed = contractData.checklistItems?.some(i => i.toLowerCase().includes('tab')) ?? false;
        message = passed ? 'TAB item found in checklist' : rule.message;
        break;

      case 'val-hvac-002':
        passed = contractData.checklistItems?.some(i => i.toLowerCase().includes('damper')) ?? false;
        message = passed ? 'Damper testing found in checklist' : rule.message;
        break;

      case 'val-plumb-001':
        passed = contractData.clauses?.some(c => c.toLowerCase().includes('backflow')) ?? false;
        message = passed ? 'Backflow clause found' : rule.message;
        break;

      case 'val-plumb-002':
        passed = contractData.checklistItems?.some(i => i.toLowerCase().includes('pressure')) ?? false;
        message = passed ? 'Pressure testing found in checklist' : rule.message;
        break;

      case 'val-plumb-004':
        passed = contractData.clauses?.some(c => c.toLowerCase().includes('licens')) ?? false;
        message = passed ? 'Licensing clause found' : rule.message;
        break;

      case 'val-carp-001':
        passed = contractData.clauses?.some(c => c.toLowerCase().includes('fire-rated') || c.toLowerCase().includes('fire rated')) ?? false;
        message = passed ? 'Fire-rated assembly clause found' : rule.message;
        break;

      case 'val-carp-002':
        passed = contractData.clauses?.some(c => c.toLowerCase().includes('co-ordination') || c.toLowerCase().includes('coordination')) ?? false;
        message = passed ? 'Coordination clause found' : rule.message;
        break;

      default:
        passed = true;
        message = 'Rule not evaluated';
    }

    results.push({ rule, passed, message });
  });

  const errors = results.filter(r => !r.passed && r.rule.severity === 'error');
  const warnings = results.filter(r => !r.passed && r.rule.severity === 'warning');

  return {
    tradeModule,
    passed: errors.length === 0,
    errors,
    warnings,
    allResults: results,
  };
}
