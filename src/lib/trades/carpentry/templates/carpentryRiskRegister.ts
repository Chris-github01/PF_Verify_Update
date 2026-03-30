export type RiskLikelihood = 'low' | 'medium' | 'high';
export type RiskImpact = 'low' | 'medium' | 'high' | 'critical';

export interface RiskRegisterItem {
  id: string;
  category: string;
  risk: string;
  cause: string;
  consequence: string;
  likelihood: RiskLikelihood;
  impact: RiskImpact;
  mitigation: string;
  owner: string;
}

export const carpentryRiskRegister: RiskRegisterItem[] = [
  {
    id: 'rr-carp-001',
    category: 'Scope',
    risk: 'Wall type scope omissions',
    cause: 'Incorrect or incomplete wall schedule leading to unquoted wall types',
    consequence: 'Variation claims post-award; programme delays',
    likelihood: 'high',
    impact: 'high',
    mitigation:
      'Issue full wall type schedule with tender documents. Require tenderers to confirm all wall types are included in their lump sum. ' +
      'Clarify any omissions before contract execution.',
    owner: 'Quantity Surveyor / Contract Administrator',
  },
  {
    id: 'rr-carp-002',
    category: 'Scope',
    risk: 'Lump sum pricing without floor-by-floor breakdown',
    cause: 'Tenderer prices a global lump sum without itemisation by level',
    consequence: 'Difficulty assessing variations; no basis for progress claims',
    likelihood: 'medium',
    impact: 'medium',
    mitigation:
      'Require level-by-level pricing schedule at tender. Make floor-by-floor breakdown a mandatory tender requirement.',
    owner: 'Quantity Surveyor',
  },
  {
    id: 'rr-carp-003',
    category: 'Scope',
    risk: 'Plasterboard scope excluded from carpentry tender',
    cause: 'GIB supply/fix/stop priced separately or excluded from trade package',
    consequence: 'Interface risk with separate GIB contractor; duplication or gaps in scope',
    likelihood: 'medium',
    impact: 'high',
    mitigation:
      'Clearly define in tender documents whether GIB is to be included in the carpentry package or let separately. ' +
      'Confirm at tender review stage that no scope gaps exist.',
    owner: 'Contract Administrator',
  },
  {
    id: 'rr-carp-004',
    category: 'Quality',
    risk: 'Acoustic performance failure of intertenancy assemblies',
    cause: 'Incorrect insulation specification; inadequate acoustic sealing; framing defects',
    consequence: 'Failed acoustic testing; costly remediation; programme delays',
    likelihood: 'medium',
    impact: 'critical',
    mitigation:
      'Specify tested assembly details from manufacturer. Require acoustic consultant sign-off. ' +
      'Hold inspection point before close-in of all intertenancy walls and floors.',
    owner: 'Site Manager / Acoustic Consultant',
  },
  {
    id: 'rr-carp-005',
    category: 'Quality',
    risk: 'Fire-rated assembly non-compliance',
    cause: 'Incorrect board type; incorrect assembly; unauthorized substitutions',
    consequence: 'Failed fire engineering assessment; code compliance failure; liability',
    likelihood: 'low',
    impact: 'critical',
    mitigation:
      'Issue fire-rated assembly schedule to subcontractor. Require fire engineer inspection sign-off. ' +
      'No substitution to fire-rated assemblies without written approval from fire engineer.',
    owner: 'Fire Engineer / Site Manager',
  },
  {
    id: 'rr-carp-006',
    category: 'Programme',
    risk: 'Carpentry programme delay impacting follow-on trades',
    cause: 'Labour shortages; slow framing progress; wet weather (if external framing)',
    consequence: 'Delayed plasterboard; delayed finishing trades; critical path impact',
    likelihood: 'medium',
    impact: 'high',
    mitigation:
      'Confirm subcontractor resource plan at contract execution. Monitor weekly progress against floor-by-floor programme. ' +
      'Identify early acceleration options.',
    owner: 'Project Manager',
  },
  {
    id: 'rr-carp-007',
    category: 'Commercial',
    risk: 'Day-work rate disputes on variations',
    cause: 'No agreed day-work schedule at contract execution',
    consequence: 'Commercial disputes; delayed variation resolution; programme disputes',
    likelihood: 'medium',
    impact: 'medium',
    mitigation:
      'Include agreed day-work schedule (labour rates, plant rates, materials mark-up) in the executed contract.',
    owner: 'Quantity Surveyor',
  },
  {
    id: 'rr-carp-008',
    category: 'Commercial',
    risk: 'Material cost escalation (timber, GIB, insulation)',
    cause: 'Supply chain disruption; global commodity price increases',
    consequence: 'Subcontractor loss on fixed-price contract; claims for cost relief',
    likelihood: 'medium',
    impact: 'medium',
    mitigation:
      'Consider fixed-price materials procurement clauses or agreed fluctuation provisions for projects exceeding 12 months.',
    owner: 'Commercial Manager',
  },
  {
    id: 'rr-carp-009',
    category: 'Interface',
    risk: 'Premature wall close-in before services rough-in complete',
    cause: 'Pressure on carpentry programme; inadequate hold points',
    consequence: 'Rework to open walls; cost dispute between trades; programme delay',
    likelihood: 'medium',
    impact: 'high',
    mitigation:
      'Establish formal hold-point approval process before close-in of any wall. ' +
      'Require services contractor sign-off before GIB is fixed.',
    owner: 'Site Manager',
  },
  {
    id: 'rr-carp-010',
    category: 'Health and Safety',
    risk: 'Manual handling injuries (heavy GIB boards, framing)',
    cause: 'Heavy materials; repetitive lifting; working at heights on scaffolding',
    consequence: 'Worker injury; Lost Time Injury; health and safety enforcement action',
    likelihood: 'medium',
    impact: 'high',
    mitigation:
      'Require subcontractor SSSP specific to carpentry and GIB works. ' +
      'Mandate mechanical handling aids (board lifters, frame jigging) on site.',
    owner: 'H&S Manager / Subcontractor',
  },
];
