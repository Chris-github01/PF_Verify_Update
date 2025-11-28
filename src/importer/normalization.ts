import { Unit } from "./types";

export const UNIT_MAP: Record<string, Unit> = {
  "no.": "ea", "nr": "ea", "ea": "ea",
  "lm": "lm", "m": "m", "m2": "m2"
};

export const SYSTEM_MAP: Record<string, string> = {
  "ryanfire sl collar": "SL Collar",
  "ryanfire hp-x / mastic cone": "HP-X / Mastic",
  "ryanbatt": "Batt/Mastic",
  "mastic": "Mastic",
  "servowrap": "Servowrap",
};
