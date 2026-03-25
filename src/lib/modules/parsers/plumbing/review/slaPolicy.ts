import type { ReviewPriority } from './reviewTypes';

export interface SlaPolicyConfig {
  critical: number;
  high: number;
  medium: number;
  low: number;
  businessHoursOnly: boolean;
  businessStart: number;
  businessEnd: number;
  timezone: string;
}

export const DEFAULT_SLA_POLICY: SlaPolicyConfig = {
  critical: 4,
  high:     8,
  medium:   48,
  low:      120,
  businessHoursOnly: false,
  businessStart:     9,
  businessEnd:       18,
  timezone:          'UTC',
};

export function getSlaHours(priority: ReviewPriority, policy: SlaPolicyConfig = DEFAULT_SLA_POLICY): number {
  return policy[priority];
}

export function getSlaLabel(priority: ReviewPriority, policy: SlaPolicyConfig = DEFAULT_SLA_POLICY): string {
  const hours = getSlaHours(priority, policy);
  if (hours <= 4) return `${hours}h`;
  if (hours <= 8) return 'Same day';
  if (hours <= 48) return `${hours / 24} business day${hours / 24 > 1 ? 's' : ''}`;
  return `${Math.round(hours / 24)} days`;
}
