import { supabase } from '../supabase';

export type IntelligenceEventType =
  | 'anomaly_detected'
  | 'review_completed'
  | 'regression_failure'
  | 'rule_suggestion_created'
  | 'optimization_run'
  | 'pattern_identified'
  | 'health_updated';

export type EventSeverity = 'info' | 'warning' | 'critical';

export interface IntelligenceEvent {
  id?: string;
  source_module: string;
  event_type: IntelligenceEventType;
  severity: EventSeverity;
  payload_json: Record<string, unknown>;
  related_module_keys: string[];
  processed?: boolean;
  created_at?: string;
}

type EventHandler = (event: IntelligenceEvent) => void;

const subscribers = new Map<IntelligenceEventType, EventHandler[]>();

export function subscribe(eventType: IntelligenceEventType, handler: EventHandler): () => void {
  const existing = subscribers.get(eventType) ?? [];
  existing.push(handler);
  subscribers.set(eventType, existing);
  return () => {
    const filtered = (subscribers.get(eventType) ?? []).filter((h) => h !== handler);
    subscribers.set(eventType, filtered);
  };
}

export function broadcast(event: IntelligenceEvent): void {
  const handlers = subscribers.get(event.event_type) ?? [];
  for (const handler of handlers) {
    try { handler(event); } catch {}
  }
}

export async function emitEvent(event: Omit<IntelligenceEvent, 'id' | 'created_at' | 'processed'>): Promise<void> {
  broadcast(event as IntelligenceEvent);
  await supabase.from('intelligence_events').insert({
    ...event,
    processed: false,
  });
}

export async function getRecentEvents(opts: {
  sourceModule?: string;
  eventType?: IntelligenceEventType;
  severity?: EventSeverity;
  limit?: number;
} = {}): Promise<IntelligenceEvent[]> {
  let q = supabase
    .from('intelligence_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 100);

  if (opts.sourceModule) q = q.eq('source_module', opts.sourceModule);
  if (opts.eventType)   q = q.eq('event_type', opts.eventType);
  if (opts.severity)    q = q.eq('severity', opts.severity);

  const { data } = await q;
  return (data ?? []) as IntelligenceEvent[];
}

export async function markEventProcessed(id: string): Promise<void> {
  await supabase.from('intelligence_events').update({ processed: true }).eq('id', id);
}

export async function getUnprocessedEvents(limit = 50): Promise<IntelligenceEvent[]> {
  const { data } = await supabase
    .from('intelligence_events')
    .select('*')
    .eq('processed', false)
    .order('created_at', { ascending: true })
    .limit(limit);
  return (data ?? []) as IntelligenceEvent[];
}
