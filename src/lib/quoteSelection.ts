import { supabase } from './supabase';

export interface SelectableQuote {
  id: string;
  is_selected: boolean;
  [key: string]: any;
}

export async function getSelectedQuotes(projectId: string): Promise<SelectableQuote[]> {
  const { data, error } = await supabase
    .from('quotes')
    .select('*')
    .eq('project_id', projectId)
    .eq('is_selected', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching selected quotes:', error);
    return [];
  }

  return data || [];
}

export async function getSelectedQuoteIds(projectId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('quotes')
    .select('id')
    .eq('project_id', projectId)
    .eq('is_selected', true);

  if (error) {
    console.error('Error fetching selected quote IDs:', error);
    return [];
  }

  return data?.map(q => q.id) || [];
}

export async function getSelectedQuoteCount(projectId: string): Promise<number> {
  const { count, error } = await supabase
    .from('quotes')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .eq('is_selected', true);

  if (error) {
    console.error('Error counting selected quotes:', error);
    return 0;
  }

  return count || 0;
}

export async function hasSelectedQuotes(projectId: string): Promise<boolean> {
  const count = await getSelectedQuoteCount(projectId);
  return count > 0;
}
