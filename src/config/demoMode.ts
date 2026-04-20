/**
 * Wednesday Stable Build — production hardening flag.
 *
 * When DEMO_STABLE_BUILD is true:
 *   - Only quote parser + review + comparison routes are active
 *   - SCC, Baseline Tracker, Commercial Control, Shadow, Insights, Admin Center,
 *     System Check, Copilot Audit, BOQ Builder, Contract Manager, Equalisation,
 *     Scope Matrix and the floating AI Copilot are all disabled.
 *   - Shadow Admin, Admin Console and non-essential lazy routes are short-circuited
 *     to the dashboard so stale/504 requests can't reach broken endpoints.
 *   - Auth loop is guarded with a single session fetch + cached timeout.
 *
 * To re-enable the full feature set after the demo, flip this to false.
 */
export const DEMO_STABLE_BUILD = true;

import type { SidebarTab } from '../components/Sidebar';

/**
 * Tabs that remain clickable during the stable build.
 * Anything else is either hidden or redirected to `dashboard`.
 */
export const ESSENTIAL_TABS: ReadonlySet<SidebarTab> = new Set<SidebarTab>([
  'dashboard',
  'quotes',
  'quoteselect',
  'review',
  'quoteintel',
]);

export function isEssentialTab(tab: SidebarTab): boolean {
  if (!DEMO_STABLE_BUILD) return true;
  return ESSENTIAL_TABS.has(tab);
}

/**
 * Modules disabled for the stable build (for reporting/telemetry).
 */
export const DISABLED_MODULES: ReadonlyArray<string> = [
  'Scope Matrix',
  'Equalisation',
  'BOQ Builder',
  'Contract Manager',
  'Commercial Control Dashboard',
  'SCC Dashboard (all sub-routes)',
  'SCC Quote Workflow',
  'SCC Payment Claims',
  'SCC Retention Materials',
  'SCC Verify Stock',
  'SCC Plant Hire',
  'Baseline Tracker Module',
  'Enhanced Reports Hub',
  'Project Report Page',
  'Insights Dashboard',
  'System Check',
  'Copilot Audit',
  'Organisation Admin Center',
  'Settings (project + org)',
  'AI Copilot floating button',
  'AI Copilot drawer',
  'Shadow Admin (entire /shadow/* tree)',
  'Admin Console (/admin/*)',
  'Parser Test route',
  'Video marketing route',
];
