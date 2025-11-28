export interface SystemTemplate {
  id: string;
  label: string;
  service?: string;
  frr?: number;
  size_min?: number;
  size_max?: number;
  subclass?: string;
}

export const SYSTEM_TEMPLATES: SystemTemplate[] = [
  { id: 'ELEC_CABLE_120_SM', label: 'Electrical Cables - Small (FRL 120)', service: 'Electrical', frr: 120, size_min: 0, size_max: 50, subclass: 'Cables' },
  { id: 'ELEC_CABLE_120_MD', label: 'Electrical Cables - Medium (FRL 120)', service: 'Electrical', frr: 120, size_min: 51, size_max: 150, subclass: 'Cables' },
  { id: 'ELEC_CABLE_120_LG', label: 'Electrical Cables - Large (FRL 120)', service: 'Electrical', frr: 120, size_min: 151, size_max: 300, subclass: 'Cables' },

  { id: 'ELEC_CABLE_90_SM', label: 'Electrical Cables - Small (FRL 90)', service: 'Electrical', frr: 90, size_min: 0, size_max: 50, subclass: 'Cables' },
  { id: 'ELEC_CABLE_90_MD', label: 'Electrical Cables - Medium (FRL 90)', service: 'Electrical', frr: 90, size_min: 51, size_max: 150, subclass: 'Cables' },
  { id: 'ELEC_CABLE_90_LG', label: 'Electrical Cables - Large (FRL 90)', service: 'Electrical', frr: 90, size_min: 151, size_max: 300, subclass: 'Cables' },

  { id: 'ELEC_CONDUIT_120_SM', label: 'Electrical Conduit - Small (FRL 120)', service: 'Electrical', frr: 120, size_min: 0, size_max: 40, subclass: 'Conduit' },
  { id: 'ELEC_CONDUIT_120_MD', label: 'Electrical Conduit - Medium (FRL 120)', service: 'Electrical', frr: 120, size_min: 41, size_max: 100, subclass: 'Conduit' },
  { id: 'ELEC_CONDUIT_120_LG', label: 'Electrical Conduit - Large (FRL 120)', service: 'Electrical', frr: 120, size_min: 101, size_max: 200, subclass: 'Conduit' },

  { id: 'MECH_DUCT_120_SM', label: 'Mechanical Duct - Small (FRL 120)', service: 'Mechanical', frr: 120, size_min: 0, size_max: 200, subclass: 'Ducts' },
  { id: 'MECH_DUCT_120_MD', label: 'Mechanical Duct - Medium (FRL 120)', service: 'Mechanical', frr: 120, size_min: 201, size_max: 500, subclass: 'Ducts' },
  { id: 'MECH_DUCT_120_LG', label: 'Mechanical Duct - Large (FRL 120)', service: 'Mechanical', frr: 120, size_min: 501, size_max: 1000, subclass: 'Ducts' },

  { id: 'MECH_DUCT_90_SM', label: 'Mechanical Duct - Small (FRL 90)', service: 'Mechanical', frr: 90, size_min: 0, size_max: 200, subclass: 'Ducts' },
  { id: 'MECH_DUCT_90_MD', label: 'Mechanical Duct - Medium (FRL 90)', service: 'Mechanical', frr: 90, size_min: 201, size_max: 500, subclass: 'Ducts' },
  { id: 'MECH_DUCT_90_LG', label: 'Mechanical Duct - Large (FRL 90)', service: 'Mechanical', frr: 90, size_min: 501, size_max: 1000, subclass: 'Ducts' },

  { id: 'PLUMB_PIPE_120_SM', label: 'Plumbing Pipe - Small (FRL 120)', service: 'Plumbing', frr: 120, size_min: 0, size_max: 50, subclass: 'Pipes' },
  { id: 'PLUMB_PIPE_120_MD', label: 'Plumbing Pipe - Medium (FRL 120)', service: 'Plumbing', frr: 120, size_min: 51, size_max: 150, subclass: 'Pipes' },
  { id: 'PLUMB_PIPE_120_LG', label: 'Plumbing Pipe - Large (FRL 120)', service: 'Plumbing', frr: 120, size_min: 151, size_max: 300, subclass: 'Pipes' },

  { id: 'PLUMB_PIPE_90_SM', label: 'Plumbing Pipe - Small (FRL 90)', service: 'Plumbing', frr: 90, size_min: 0, size_max: 50, subclass: 'Pipes' },
  { id: 'PLUMB_PIPE_90_MD', label: 'Plumbing Pipe - Medium (FRL 90)', service: 'Plumbing', frr: 90, size_min: 51, size_max: 150, subclass: 'Pipes' },
  { id: 'PLUMB_PIPE_90_LG', label: 'Plumbing Pipe - Large (FRL 90)', service: 'Plumbing', frr: 90, size_min: 151, size_max: 300, subclass: 'Pipes' },

  { id: 'DATA_CABLE_120_SM', label: 'Data Cables - Small (FRL 120)', service: 'Data', frr: 120, size_min: 0, size_max: 50, subclass: 'Cables' },
  { id: 'DATA_CABLE_120_MD', label: 'Data Cables - Medium (FRL 120)', service: 'Data', frr: 120, size_min: 51, size_max: 150, subclass: 'Cables' },
  { id: 'DATA_CABLE_120_LG', label: 'Data Cables - Large (FRL 120)', service: 'Data', frr: 120, size_min: 151, size_max: 300, subclass: 'Cables' },

  { id: 'FIRE_SPRINK_120_SM', label: 'Fire Sprinkler Pipe - Small (FRL 120)', service: 'Fire', frr: 120, size_min: 0, size_max: 50, subclass: 'Pipes' },
  { id: 'FIRE_SPRINK_120_MD', label: 'Fire Sprinkler Pipe - Medium (FRL 120)', service: 'Fire', frr: 120, size_min: 51, size_max: 150, subclass: 'Pipes' },
  { id: 'FIRE_SPRINK_120_LG', label: 'Fire Sprinkler Pipe - Large (FRL 120)', service: 'Fire', frr: 120, size_min: 151, size_max: 300, subclass: 'Pipes' },

  { id: 'GAS_PIPE_120_SM', label: 'Gas Pipe - Small (FRL 120)', service: 'Gas', frr: 120, size_min: 0, size_max: 50, subclass: 'Pipes' },
  { id: 'GAS_PIPE_120_MD', label: 'Gas Pipe - Medium (FRL 120)', service: 'Gas', frr: 120, size_min: 51, size_max: 100, subclass: 'Pipes' },

  { id: 'CABLE_TRAY_120', label: 'Cable Tray (FRL 120)', service: 'Electrical', frr: 120, size_min: 100, size_max: 600, subclass: 'Tray' },
  { id: 'CABLE_TRAY_90', label: 'Cable Tray (FRL 90)', service: 'Electrical', frr: 90, size_min: 100, size_max: 600, subclass: 'Tray' },

  { id: 'PEN_SEAL_120_SM', label: 'Penetration Seal - Small (FRL 120)', frr: 120, size_min: 0, size_max: 75, subclass: 'Seal' },
  { id: 'PEN_SEAL_120_MD', label: 'Penetration Seal - Medium (FRL 120)', frr: 120, size_min: 76, size_max: 200, subclass: 'Seal' },
  { id: 'PEN_SEAL_120_LG', label: 'Penetration Seal - Large (FRL 120)', frr: 120, size_min: 201, size_max: 500, subclass: 'Seal' },

  { id: 'PEN_SEAL_90_SM', label: 'Penetration Seal - Small (FRL 90)', frr: 90, size_min: 0, size_max: 75, subclass: 'Seal' },
  { id: 'PEN_SEAL_90_MD', label: 'Penetration Seal - Medium (FRL 90)', frr: 90, size_min: 76, size_max: 200, subclass: 'Seal' },
  { id: 'PEN_SEAL_90_LG', label: 'Penetration Seal - Large (FRL 90)', frr: 90, size_min: 201, size_max: 500, subclass: 'Seal' },

  { id: 'LINEAR_JOINT_120', label: 'Linear Joint - Control Joint (FRL 120)', frr: 120, size_min: 10, size_max: 50, subclass: 'Seal' },
  { id: 'LINEAR_JOINT_90', label: 'Linear Joint - Control Joint (FRL 90)', frr: 90, size_min: 10, size_max: 50, subclass: 'Seal' },

  { id: 'FIRE_DAMPER_120', label: 'Fire Damper (FRL 120)', service: 'Mechanical', frr: 120, size_min: 100, size_max: 1000, subclass: 'Damper' },
  { id: 'FIRE_DAMPER_90', label: 'Fire Damper (FRL 90)', service: 'Mechanical', frr: 90, size_min: 100, size_max: 1000, subclass: 'Damper' },

  { id: 'COLLAR_120_SM', label: 'Fire Collar - Small (FRL 120)', frr: 120, size_min: 0, size_max: 100, subclass: 'Collar' },
  { id: 'COLLAR_120_MD', label: 'Fire Collar - Medium (FRL 120)', frr: 120, size_min: 101, size_max: 200, subclass: 'Collar' },
  { id: 'COLLAR_120_LG', label: 'Fire Collar - Large (FRL 120)', frr: 120, size_min: 201, size_max: 400, subclass: 'Collar' },

  { id: 'BATT_WRAP_120', label: 'Fire Batt/Wrap (FRL 120)', frr: 120, subclass: 'Batt' },
  { id: 'BATT_WRAP_90', label: 'Fire Batt/Wrap (FRL 90)', frr: 90, subclass: 'Batt' },

  { id: 'BOARD_120', label: 'Fire Rated Board (FRL 120)', frr: 120, subclass: 'Board' },
  { id: 'BOARD_90', label: 'Fire Rated Board (FRL 90)', frr: 90, subclass: 'Board' },
];

export async function loadSystemTemplates(): Promise<SystemTemplate[]> {
  return SYSTEM_TEMPLATES;
}

export function getAllSystemLabels(): Record<string, string> {
  return SYSTEM_TEMPLATES.reduce((acc, template) => {
    acc[template.id] = template.label;
    return acc;
  }, {} as Record<string, string>);
}
