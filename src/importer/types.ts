export type Unit = "ea" | "lm" | "m2" | "m" | "unknown";

export interface LineItem {
  index: number;                    // 1..n (from the PDF row)
  description: string;              // full text (service, type, size, substrate/FR)
  reference?: string;               // e.g., V33.4, FAS190143
  section?: string;                 // service category: Electrical, Hydraulics, Mechanical, etc.
  qty: number;
  unit: Unit;
  rate?: number;                    // per unit, if present
  total?: number;                   // line total, if present
  normalized: {
    unit: Unit;
    systemNames: string[];          // normalized system tags (HP-X, SL Collar, etc.)
  };
}

export interface ParsedTotals {
  penetrationsSubtotal?: number;    // subtotal for line items
  addOns?: { PG_Margin?: number; PS3_QA?: number; SiteSetup?: number; Contingency?: number; EWPs?: number };
  grandTotal?: number;
}

export interface ParsedQuote {
  supplierKey: string;              // e.g., "OptimalFire_Marewa"
  items: LineItem[];
  totals: ParsedTotals;
  warnings: string[];               // validation notes
}
