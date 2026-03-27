import { supabase } from '../../supabase';

export interface ShadowModuleRecord {
  id: string;
  module_key: string;
  display_name: string;
  parser_family: string;
  dataset_type: string;
  source_table: string;
  source_adapter_key: string;
  diff_enabled: boolean;
  shadow_enabled: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ShadowModuleVersionRecord {
  id: string;
  module_key: string;
  version_name: string;
  parser_version: string;
  rules_version: string;
  status: 'draft' | 'active' | 'deprecated' | 'archived';
  notes: string | null;
  created_at: string;
}

export type SourceAdapterKey =
  | 'plumbing_quote_adapter'
  | 'passive_fire_quote_adapter'
  | 'generic_quote_adapter';

export async function getAllShadowModules(): Promise<ShadowModuleRecord[]> {
  const { data, error } = await supabase
    .from('shadow_modules')
    .select('*')
    .eq('active', true)
    .order('module_key');
  if (error) throw error;
  return (data ?? []) as ShadowModuleRecord[];
}

export async function getShadowModule(moduleKey: string): Promise<ShadowModuleRecord | null> {
  const { data, error } = await supabase
    .from('shadow_modules')
    .select('*')
    .eq('module_key', moduleKey)
    .maybeSingle();
  if (error) throw error;
  return data as ShadowModuleRecord | null;
}

export async function getShadowModuleVersions(moduleKey: string): Promise<ShadowModuleVersionRecord[]> {
  const { data, error } = await supabase
    .from('shadow_module_versions')
    .select('*')
    .eq('module_key', moduleKey)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ShadowModuleVersionRecord[];
}

export async function getActiveVersion(moduleKey: string): Promise<ShadowModuleVersionRecord | null> {
  const { data, error } = await supabase
    .from('shadow_module_versions')
    .select('*')
    .eq('module_key', moduleKey)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as ShadowModuleVersionRecord | null;
}

export function isDeepDiffEnabled(module: ShadowModuleRecord | null): boolean {
  return module?.diff_enabled ?? false;
}

export function isShadowEnabled(module: ShadowModuleRecord | null): boolean {
  return module?.shadow_enabled ?? false;
}

export function getAdapterKey(module: ShadowModuleRecord | null): SourceAdapterKey {
  return (module?.source_adapter_key ?? 'generic_quote_adapter') as SourceAdapterKey;
}

export function resolveTradeCategory(moduleKey: string): string {
  const tradeMap: Record<string, string> = {
    plumbing_parser: 'plumbing',
    passive_fire_parser: 'passive_fire',
    active_fire_parser: 'active_fire',
    electrical_parser: 'electrical',
    hvac_parser: 'hvac',
  };
  return tradeMap[moduleKey] ?? 'generic';
}
