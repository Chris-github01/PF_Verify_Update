interface ItemForDetection {
  id: string;
  description: string;
}

interface ServiceDetection {
  serviceType: string;
  confidence: number;
}

export async function detectServiceTypesInBatch(
  items: ItemForDetection[]
): Promise<Map<string, ServiceDetection>> {
  const detections = new Map<string, ServiceDetection>();

  for (const item of items) {
    const serviceType = detectServiceTypeFromDescription(item.description);
    detections.set(item.id, {
      serviceType,
      confidence: 0.8,
    });
  }

  return detections;
}

function detectServiceTypeFromDescription(description: string): string {
  const upperDesc = description.toUpperCase();

  const patterns = [
    { regex: /(FLUSH\s*BOX|FIRE\s*BOX|ACOUSTIC\s*PUTTY\s*PAD|POWERPAD|POWER\s*PAD)/i, type: 'Electrical Services - Intumescent Flush Box' },
    { regex: /FIRE\s*(STOP|SEAL|COLLAR|WRAP|BOARD|BATT)/i, type: 'Fire Protection Services - Fire Stopping' },
    { regex: /CABLE TRAY/i, type: 'Electrical Services - Cable Tray' },
    { regex: /CABLE BUNDLE/i, type: 'Electrical Services - Cable Bundle' },
    { regex: /CONDUIT/i, type: 'Electrical Services - Conduit' },
    { regex: /PVC PIPE/i, type: 'Hydraulics Services - PVC Pipe' },
    { regex: /COPPER PIPE/i, type: 'Hydraulics Services - Copper Pipe' },
    { regex: /STEEL PIPE/i, type: 'Hydraulics Services - Steel Pipe' },
    { regex: /(HVAC|DUCT|AIR\s*CON)/i, type: 'Mechanical Services - HVAC/Ductwork' },
    { regex: /BEAM/i, type: 'Structural Penetrations - Beam' },
    { regex: /PURLIN/i, type: 'Structural Penetrations - Purlin' },
    { regex: /WALL/i, type: 'Structural Penetrations - Wall' },
    { regex: /FLOOR|SLAB/i, type: 'Structural Penetrations - Floor/Slab' },
  ];

  for (const { regex, type } of patterns) {
    if (regex.test(upperDesc)) {
      return type;
    }
  }

  return 'Passive Fire (General)';
}
