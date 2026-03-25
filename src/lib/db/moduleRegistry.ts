import { supabase } from '../supabase';
import type { ModuleRegistryRecord } from '../../types/shadow';

export async function dbGetAllModules(): Promise<ModuleRegistryRecord[]> {
  const { data, error } = await supabase
    .from('module_registry')
    .select('*')
    .order('module_name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ModuleRegistryRecord[];
}

export async function dbGetModule(moduleKey: string): Promise<ModuleRegistryRecord | null> {
  const { data, error } = await supabase
    .from('module_registry')
    .select('*')
    .eq('module_key', moduleKey)
    .maybeSingle();
  if (error) throw error;
  return data as ModuleRegistryRecord | null;
}

export async function dbGetModulesByType(moduleType: string): Promise<ModuleRegistryRecord[]> {
  const { data, error } = await supabase
    .from('module_registry')
    .select('*')
    .eq('module_type', moduleType)
    .order('module_name');
  if (error) throw error;
  return (data ?? []) as ModuleRegistryRecord[];
}
