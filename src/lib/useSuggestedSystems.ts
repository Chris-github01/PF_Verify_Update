import { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { normaliseDescriptionForSystem, buildSuggestedSystemName, needsQuantity } from './quoteUtils';

export interface SuggestedSystem {
  key: string;
  defaultName: string;
  exampleDescription: string;
  suppliers: string[];
  count: number;
  rateMin: number;
  rateMax: number;
  itemIds: string[];
}

interface QuoteItemWithSupplier {
  id: string;
  description: string;
  unit_price: number;
  system_id: string | null;
  quantity: number | null;
  supplier_name: string;
}

export function useSuggestedSystems(projectId: string) {
  const [suggestions, setSuggestions] = useState<SuggestedSystem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSuggestions = async () => {
    if (!projectId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: quotes } = await supabase
        .from('quotes')
        .select('id, supplier_name')
        .eq('project_id', projectId);

      if (!quotes || quotes.length === 0) {
        setSuggestions([]);
        setLoading(false);
        return;
      }

      const quoteIds = quotes.map(q => q.id);

      const { data: items, error: itemsError } = await supabase
        .from('quote_items')
        .select('id, description, unit_price, system_id, quantity, quote_id')
        .in('quote_id', quoteIds);

      if (itemsError) throw itemsError;
      if (!items || items.length === 0) {
        setSuggestions([]);
        setLoading(false);
        return;
      }

      const itemsWithSupplier: QuoteItemWithSupplier[] = items.map(item => {
        const quote = quotes.find(q => q.id === item.quote_id);
        return {
          ...item,
          supplier_name: quote?.supplier_name || 'Unknown',
        };
      });

      const unmappedItems = itemsWithSupplier.filter(item => {
        if (needsQuantity(item)) return false;

        return !item.system_id || item.system_id === '' || item.system_id === 'unknown';
      });

      const groups = new Map<string, QuoteItemWithSupplier[]>();

      unmappedItems.forEach(item => {
        const groupKey = normaliseDescriptionForSystem(item.description);
        if (!groupKey) return;

        if (!groups.has(groupKey)) {
          groups.set(groupKey, []);
        }
        groups.get(groupKey)!.push(item);
      });

      const suggestedSystems: SuggestedSystem[] = [];

      groups.forEach((groupItems, groupKey) => {
        if (groupItems.length < 2) return;

        const suppliers = [...new Set(groupItems.map(i => i.supplier_name))];
        const rates = groupItems.map(i => i.unit_price).filter(r => r > 0);
        const rateMin = rates.length > 0 ? Math.min(...rates) : 0;
        const rateMax = rates.length > 0 ? Math.max(...rates) : 0;

        const exampleDescription = groupItems[0].description;
        const defaultName = buildSuggestedSystemName(exampleDescription);

        suggestedSystems.push({
          key: groupKey,
          defaultName,
          exampleDescription,
          suppliers,
          count: groupItems.length,
          rateMin,
          rateMax,
          itemIds: groupItems.map(i => i.id),
        });
      });

      suggestedSystems.sort((a, b) => b.count - a.count);

      setSuggestions(suggestedSystems);
    } catch (err) {
      console.error('Error loading suggested systems:', err);
      setError(err instanceof Error ? err.message : 'Failed to load suggestions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSuggestions();
  }, [projectId]);

  return { suggestions, loading, error, reload: loadSuggestions };
}
