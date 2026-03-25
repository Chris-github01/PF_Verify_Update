import type { RiskSignalTag } from "./types";

interface RiskSignalRule {
  tag: RiskSignalTag;
  patterns: RegExp[];
}

const RISK_SIGNAL_RULES: RiskSignalRule[] = [
  {
    tag: "by_others",
    patterns: [/\bby\s+others\b/i, /\ballow(ed)?\s+by\s+others\b/i],
  },
  {
    tag: "no_allowance",
    patterns: [/\bno\s+allowance\b/i, /\bno\s+provision\b/i],
  },
  {
    tag: "subject_to",
    patterns: [/\bsubject\s+to\b/i, /\bconditional\s+upon\b/i],
  },
  {
    tag: "tbc",
    patterns: [/\btbc\b/i, /\bto\s+be\s+confirmed\b/i, /\bpending\b/i],
  },
  {
    tag: "provisional",
    patterns: [/\bprovisional\b/i, /\bpc\s+sum\b/i, /\bprime\s+cost\b/i, /\bbudget\s+allowance\b/i],
  },
  {
    tag: "optional",
    patterns: [/\boptional\b/i, /\boption\b/i, /\balternate\b/i, /\balternative\b/i],
  },
  {
    tag: "excluded",
    patterns: [/\bexcluded?\b/i, /\bomitted\b/i, /\bnot\s+included\b/i, /\bout\s+of\s+scope\b/i],
  },
  {
    tag: "client_supply",
    patterns: [/\bclient\s+supply\b/i, /\bclient\s+to\s+supply\b/i, /\bclient\s+supplied\b/i],
  },
  {
    tag: "supply_by_others",
    patterns: [/\bsupply\s+by\s+others\b/i, /\bsupplied\s+by\s+others\b/i],
  },
  {
    tag: "install_by_others",
    patterns: [/\binstall\s+by\s+others\b/i, /\binstalled?\s+by\s+others\b/i, /\binstallation\s+by\s+others\b/i],
  },
];

export function extractRiskSignals(description: string): RiskSignalTag[] {
  if (!description) return [];
  const signals: RiskSignalTag[] = [];
  for (const rule of RISK_SIGNAL_RULES) {
    if (rule.patterns.some(p => p.test(description))) {
      signals.push(rule.tag);
    }
  }
  return signals;
}
