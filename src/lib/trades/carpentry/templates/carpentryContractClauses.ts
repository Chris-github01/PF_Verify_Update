export interface ContractClause {
  id: string;
  title: string;
  body: string;
  category: string;
  mandatory: boolean;
}

export const carpentryContractClauses: ContractClause[] = [
  {
    id: 'carp-001',
    title: 'Scope of Works — Carpentry',
    category: 'scope',
    mandatory: true,
    body:
      'The subcontractor shall supply all labour, materials, plant, and equipment necessary to complete the carpentry works ' +
      'in strict accordance with the contract documents. This includes, but is not limited to, external and internal wall framing, ' +
      'ceiling framing, door installation, finishing carpentry, and all associated fixings and hardware.',
  },
  {
    id: 'carp-002',
    title: 'Scope of Works — Plasterboard (GIB)',
    category: 'scope',
    mandatory: true,
    body:
      'The subcontractor shall supply and install all plasterboard (GIB board) works as specified, including supply, fixing, ' +
      'stopping, and sanding to the required finish levels. Works shall include all GIB Standard, GIB Aqualine, and GIB Fyreline ' +
      'as indicated on the drawings. All stopping shall be to Level 4 unless otherwise specified.',
  },
  {
    id: 'carp-003',
    title: 'Scope of Works — Insulation',
    category: 'scope',
    mandatory: true,
    body:
      'The subcontractor shall supply and install all thermal and acoustic insulation as specified, including wall batts (minimum ' +
      'R2.2 Pink Batts or approved equivalent) and mid-floor acoustic insulation (Silencer or approved equivalent). ' +
      'Installation shall be in accordance with the manufacturer\'s specifications and all applicable building codes.',
  },
  {
    id: 'carp-004',
    title: 'Wall Types and Specifications',
    category: 'technical',
    mandatory: true,
    body:
      'All wall framing shall be constructed in accordance with the wall type schedule contained in the contract documents. ' +
      'Wall types W30 through W36 (as defined in the drawings) shall be built to the specified stud sizes, spacings, ' +
      'and performance requirements. Any conflicts between the wall type schedule and drawings shall be referred to the ' +
      'contract administrator prior to proceeding.',
  },
  {
    id: 'carp-005',
    title: 'Fire-Rated Assemblies',
    category: 'technical',
    mandatory: true,
    body:
      'Fire-rated wall and ceiling assemblies shall be constructed strictly in accordance with the specified fire rating. ' +
      'GIB Fyreline and other fire-rated boards shall be installed in compliance with the manufacturer\'s tested assembly ' +
      'instructions. No substitutions to fire-rated assemblies are permitted without written approval from the fire engineer.',
  },
  {
    id: 'carp-006',
    title: 'Co-ordination with Other Trades',
    category: 'coordination',
    mandatory: true,
    body:
      'The subcontractor shall co-ordinate with all relevant trades prior to closing walls and ceilings to ensure that all ' +
      'mechanical, electrical, plumbing, and fire services penetrations are properly accommodated. The subcontractor shall not ' +
      'close any wall or ceiling until written approval is received from the contract administrator.',
  },
  {
    id: 'carp-007',
    title: 'Moisture Management and Wet Area Boards',
    category: 'technical',
    mandatory: false,
    body:
      'All wet area substrates shall be constructed using moisture-resistant boards (GIB Aqualine or approved equivalent). ' +
      'The subcontractor shall ensure adequate sealing at all wall-to-floor junctions in wet areas prior to the application ' +
      'of any waterproofing membrane by others.',
  },
  {
    id: 'carp-008',
    title: 'Acoustic Requirements',
    category: 'technical',
    mandatory: false,
    body:
      'All intertenancy walls and mid-floor assemblies shall achieve the specified acoustic performance ratings (Rw + Ctr) ' +
      'as noted on the drawings. The subcontractor shall ensure that all acoustic sealing, resilient mounts, and specified ' +
      'insulation products are installed in accordance with the tested assembly to achieve the design rating.',
  },
  {
    id: 'carp-009',
    title: 'Defects and Workmanship',
    category: 'quality',
    mandatory: true,
    body:
      'All carpentry and plasterboard works shall be completed to a standard consistent with first-class workmanship. ' +
      'Plasterboard stopping shall be free from ridges, tool marks, shadows, and blistering. All framing shall be plumb, ' +
      'level, and true within tolerances specified in NZS 3604 or as otherwise noted. Defects identified at practical ' +
      'completion shall be rectified within the defects liability period at no additional cost.',
  },
  {
    id: 'carp-010',
    title: 'Variations to Scope',
    category: 'commercial',
    mandatory: true,
    body:
      'No variations to the scope of works shall be executed without a written variation order issued by the contract ' +
      'administrator prior to the works being carried out. Verbal instructions do not constitute an instruction to vary ' +
      'the works. Day-work rates applicable to variations shall be agreed in writing at the time of contract execution.',
  },
];
