/**
 * classifyPassiveFireIntent — reclassifies extracted items under passive-fire
 * sub-scopes even when the underlying service (plumbing/electrical/HVAC) is
 * another trade. A penetration sealed around a copper water pipe is still
 * PASSIVE FIRE work; the plumbing reference is retained in sub_scope.
 */

import type { ParsedLineItemV2 } from "../runParserV2.ts";

export type PassiveFireIntent =
  | "penetration_sealing"
  | "fire_damper"
  | "fire_rated_wall"
  | "fire_rated_floor"
  | "joint_sealing"
  | "service_penetration_plumbing"
  | "service_penetration_electrical"
  | "service_penetration_hvac"
  | "intumescent_coating"
  | "fire_collar"
  | "fire_pillow"
  | "acoustic_sealant"
  | "other";

const PATTERNS: Array<[RegExp, PassiveFireIntent]> = [
  [/\bfire\s*collar\b/i, "fire_collar"],
  [/\bfire\s*pillow\b|intumescent\s*pillow/i, "fire_pillow"],
  [/intumescent\s*(coating|paint)/i, "intumescent_coating"],
  [/acoustic\s*seal/i, "acoustic_sealant"],
  [/fire\s*damper/i, "fire_damper"],
  [/(wall|floor)\s*penetration/i, "penetration_sealing"],
  [/\bpenetration|penetrations?\b/i, "penetration_sealing"],
  [/construction\s*joint|movement\s*joint/i, "joint_sealing"],
  [/\b(copper|pvc|dwv|hwp|cwp|plumbing|drainage|sanitary)\b/i, "service_penetration_plumbing"],
  [/\b(cable|conduit|tray|ladder|electrical)\b/i, "service_penetration_electrical"],
  [/\b(duct|hvac|mechanical|supply\s*air|return\s*air)\b/i, "service_penetration_hvac"],
  [/fire[-\s]?rated\s*(wall|partition)/i, "fire_rated_wall"],
  [/fire[-\s]?rated\s*(floor|slab)/i, "fire_rated_floor"],
];

export function classifyPassiveFireIntent(ctx: {
  items: ParsedLineItemV2[];
  openAIKey: string;
}): { items: ParsedLineItemV2[] } {
  const reclassified = ctx.items.map((item) => {
    const intent = detectIntent(`${item.description} ${item.sub_scope ?? ""}`);
    return {
      ...item,
      trade: "passive_fire",
      sub_scope: item.sub_scope ?? intent,
    };
  });
  return { items: reclassified };
}

function detectIntent(text: string): PassiveFireIntent {
  for (const [re, intent] of PATTERNS) {
    if (re.test(text)) return intent;
  }
  return "other";
}
