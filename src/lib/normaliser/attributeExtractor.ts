export interface ExtractedAttributes {
  size?: string;
  frr?: string;
  service?: string;
  subclass?: string;
  material?: string;
  confidence: number;
}

export function extractAttributes(text: string): ExtractedAttributes {
  if (!text || typeof text !== 'string') {
    return { confidence: 0 };
  }

  const lowerText = text.toLowerCase();
  let extractedCount = 0;
  const result: ExtractedAttributes = { confidence: 0 };

  result.size = extractSize(text);
  if (result.size) extractedCount++;

  result.frr = extractFRR(text);
  if (result.frr) extractedCount++;

  result.service = extractService(lowerText);
  if (result.service) extractedCount++;

  result.subclass = extractSubclass(lowerText);
  if (result.subclass) extractedCount++;

  result.material = extractMaterial(lowerText);
  if (result.material) extractedCount++;

  result.confidence = extractedCount / 5;

  return result;
}

function extractSize(text: string): string | undefined {
  const sizePatterns = [
    /(\d+(?:\.\d+)?)\s*(?:mm|millimeter|millimetre)/gi,
    /(\d+(?:\.\d+)?)\s*(?:inch|in|")/gi,
    /(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*(?:mm|millimeter|millimetre|inch|in|")?/gi,
    /(\d+(?:\.\d+)?)\s*(?:mm|inch|in|")?\s*(?:dia|diameter|ø|Ø)/gi,
    /DN\s*(\d+)/gi,
    /NB\s*(\d+)/gi,
  ];

  for (const pattern of sizePatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[0].trim();
    }
  }

  return undefined;
}

function extractFRR(text: string): string | undefined {
  const frrPatterns = [
    /FRL\s*[-/]?\s*(\d+)(?:\s*[-/]\s*(\d+)(?:\s*[-/]\s*(\d+))?)?/gi,
    /(\d+)\s*[-/]\s*(\d+)\s*[-/]\s*(\d+)/g,
    /(\d+)\s*min(?:ute)?s?\s*fire\s*rat(?:ing|ed)/gi,
    /fire\s*rat(?:ing|ed)?\s*(?:of|:)?\s*(\d+)/gi,
    /-\/(\d+)\/(\d+)/g,
  ];

  for (const pattern of frrPatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[0].trim();
    }
  }

  return undefined;
}

function extractService(lowerText: string): string | undefined {
  // CRITICAL: Service classification rules based on actual trade practices
  // This determines which trade is responsible for the installation

  // 1. Electrical - Cable infrastructure, electrical penetrations, and flush boxes
  //    Mastic on cables = Electrical
  //    Flush boxes / Fire boxes for electrical outlets = Electrical
  if (lowerText.includes('cable bundle') ||
      lowerText.includes('cable tray') ||
      lowerText.includes('bus duct') ||
      lowerText.includes('electrical conduit') ||
      lowerText.includes('fire box') ||
      lowerText.includes('flush box') ||
      lowerText.includes('acoustic putty pad') ||
      lowerText.includes('powerpad') ||
      lowerText.includes('power pad') ||
      (lowerText.includes('mastic') && (lowerText.includes('cable') || lowerText.includes('tray')))) {
    return 'Electrical';
  }

  // 2. Fire - Pipe penetrations (steel, sprinkler, metal pipes)
  //    Mastic on steel/metal pipes = Fire
  if (lowerText.includes('steel pipe') ||
      lowerText.includes('metal pipe') ||
      lowerText.includes('sprinkler pipe') ||
      lowerText.includes('alarm cable') ||
      (lowerText.includes('mastic') && (lowerText.includes('steel') || lowerText.includes('metal')))) {
    return 'Fire';
  }

  // 3. Plumbing - Fire stopping products on plastic pipes, collars
  //    Mastic on PVC/plastic pipes = Plumbing
  //    Rokwrap and Fire collars are always Plumbing
  if (lowerText.includes('fire collar') ||
      lowerText.includes('rokwrap') ||
      lowerText.includes('pvc pipe') ||
      lowerText.includes('pex pipe') ||
      lowerText.includes('hdpe pipe') ||
      lowerText.includes('copper pipe') ||
      (lowerText.includes('mastic') && (lowerText.includes('pvc') || lowerText.includes('copper') ||
       lowerText.includes('pex') || lowerText.includes('hdpe') || lowerText.includes('collar')))) {
    return 'Plumbing';
  }

  // 4. Mechanical - Ductwork and HVAC
  //    Mastic on ducts = Mechanical
  if (lowerText.includes('mechanical duct') ||
      (lowerText.includes('duct') && !lowerText.includes('bus')) ||
      lowerText.includes('hvac') ||
      lowerText.includes('ventilation') ||
      lowerText.includes('air conditioning') ||
      (lowerText.includes('mastic') && lowerText.includes('duct') && !lowerText.includes('bus'))) {
    return 'Mechanical';
  }

  // Legacy fallback keywords (less specific)
  const serviceKeywords = {
    'Electrical': ['electrical', 'electric', 'power', 'wiring'],
    'Fire': ['fire protection', 'fire stopping', 'fire rated'],
    'Plumbing': ['plumbing', 'water', 'drainage', 'sewer'],
    'Data': ['data', 'telecom', 'communication', 'network', 'fibre', 'fiber'],
    'Gas': ['gas', 'natural gas', 'lpg'],
  };

  for (const [service, keywords] of Object.entries(serviceKeywords)) {
    if (keywords.some(keyword => lowerText.includes(keyword))) {
      return service;
    }
  }

  return undefined;
}

function extractSubclass(lowerText: string): string | undefined {
  const subclassKeywords = {
    'Flush Box': ['flush box', 'fire box', 'acoustic putty pad', 'powerpad', 'power pad'],
    'Cables': ['cable', 'cabling', 'wire', 'wiring'],
    'Conduit': ['conduit', 'trunking'],
    'Ducts': ['duct', 'ducting'],
    'Pipes': ['pipe', 'piping'],
    'Tray': ['tray', 'cable tray', 'ladder'],
    'Penetration': ['penetration', 'opening', 'hole', 'aperture'],
    'Seal': ['seal', 'sealing', 'sealant', 'firestop'],
    'Batt': ['batt', 'blanket', 'wrap'],
    'Board': ['board', 'panel'],
    'Collar': ['collar', 'wrap'],
    'Block': ['block', 'brick'],
    'Damper': ['damper', 'fire damper'],
  };

  for (const [subclass, keywords] of Object.entries(subclassKeywords)) {
    if (keywords.some(keyword => lowerText.includes(keyword))) {
      return subclass;
    }
  }

  return undefined;
}

function extractMaterial(lowerText: string): string | undefined {
  // Check for specific flush box materials first (more specific)
  if (lowerText.includes('flush box') || lowerText.includes('fire box') ||
      lowerText.includes('acoustic putty pad') || lowerText.includes('powerpad')) {
    return 'intumescent pad';
  }

  const materialKeywords = {
    'Steel': ['steel', 'galvanised', 'galvanized'],
    'PVC': ['pvc', 'polyvinyl'],
    'Copper': ['copper', 'cu'],
    'Aluminium': ['aluminium', 'aluminum'],
    'Concrete': ['concrete'],
    'Plasterboard': ['plasterboard', 'gypsum', 'drywall'],
    'Ceramic': ['ceramic', 'fibre', 'fiber'],
    'Intumescent': ['intumescent'],
    'Mineral Wool': ['mineral wool', 'rockwool', 'rock wool'],
  };

  for (const [material, keywords] of Object.entries(materialKeywords)) {
    if (keywords.some(keyword => lowerText.includes(keyword))) {
      return material;
    }
  }

  return undefined;
}
