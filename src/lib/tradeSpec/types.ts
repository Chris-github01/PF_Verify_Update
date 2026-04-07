export type TradeModule =
  | 'passive_fire'
  | 'electrical'
  | 'active_fire'
  | 'hvac'
  | 'plumbing'
  | 'carpentry';

export interface ContractClauseSpec {
  id: string;
  title: string;
  body: string;
  category: 'scope' | 'exclusions' | 'interfaces' | 'testing' | 'documentation' | 'programme' | 'variations' | 'quality' | 'technical' | 'coordination' | 'commercial';
  mandatory: boolean;
}

export interface ChecklistPhase {
  id: string;
  title: string;
  items: ChecklistItem[];
}

export interface ChecklistItem {
  id: string;
  text: string;
  mandatory: boolean;
  notes?: string;
}

export interface RiskItem {
  id: string;
  category: string;
  risk: string;
  cause?: string;
  consequence?: string;
  likelihood: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high' | 'critical';
  mitigation: string;
  owner?: string;
}

export interface ScopeGroupingRule {
  groupName: string;
  keywords: string[];
  serviceTypes?: string[];
}

export interface ComplianceRequirement {
  id: string;
  label: string;
  description: string;
  mandatory: boolean;
  region?: 'NZ' | 'AU' | 'both';
}

export interface ValidationRule {
  id: string;
  check: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface AwardWording {
  approved: { status: string; template: string };
  clarificationRequired: { status: string; template: string };
  notRecommended: { status: string; template: string };
}

export interface TradeSpec {
  tradeModule: TradeModule;
  name: string;
  color: string;
  accentHex: string;
  description: string;
  scopeCategories: string[];
  groupingRules: ScopeGroupingRule[];
  contractClauses: ContractClauseSpec[];
  checklistPhases: ChecklistPhase[];
  riskRegister: RiskItem[];
  complianceRequirements: ComplianceRequirement[];
  validationRules: ValidationRule[];
  awardWording: AwardWording;
  normalizationStrategy: 'frl_based' | 'section_based' | 'service_based' | 'system_based';
}
