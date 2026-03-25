import type { ReviewPriority } from './reviewTypes';
import { DEFAULT_SLA_POLICY, getSlaHours } from './slaPolicy';
import type { SlaPolicyConfig } from './slaPolicy';

export function calculateSlaDueAt(
  priority: ReviewPriority,
  fromDate: Date = new Date(),
  policy: SlaPolicyConfig = DEFAULT_SLA_POLICY
): Date {
  const hours = getSlaHours(priority, policy);
  const dueAt = new Date(fromDate.getTime() + hours * 60 * 60 * 1000);
  return dueAt;
}

export function isOverdue(slaDueAt: string | null | undefined): boolean {
  if (!slaDueAt) return false;
  return new Date(slaDueAt) < new Date();
}

export function getTimeRemainingMs(slaDueAt: string | null | undefined): number | null {
  if (!slaDueAt) return null;
  return new Date(slaDueAt).getTime() - Date.now();
}

export function formatTimeRemaining(slaDueAt: string | null | undefined): string {
  const ms = getTimeRemainingMs(slaDueAt);
  if (ms === null) return '—';
  if (ms < 0) {
    const abs = Math.abs(ms);
    const h = Math.floor(abs / 3600000);
    const m = Math.floor((abs % 3600000) / 60000);
    return `Overdue by ${h > 0 ? `${h}h ` : ''}${m}m`;
  }
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h >= 48) return `${Math.round(h / 24)}d remaining`;
  if (h >= 1) return `${h}h ${m}m remaining`;
  return `${m}m remaining`;
}
