import { supabase } from '../supabase';
import type { SimilarityMatch } from '../../types/extraction.types';

export interface ReferenceItem {
  id: string;
  description: string;
  system_code?: string;
  trade?: string;
  unit?: string;
  typical_rate?: number;
  embedding?: number[];
}

export class EmbeddingsItemMatcher {
  private cache: Map<string, ReferenceItem[]> = new Map();
  private embeddingsCache: Map<string, number[]> = new Map();

  async findSimilarItems(
    description: string,
    organisationId: string,
    threshold = 0.7,
    limit = 5
  ): Promise<SimilarityMatch[]> {
    try {
      const embedding = await this.getEmbedding(description);

      const { data, error } = await supabase.rpc('match_library_items', {
        query_embedding: embedding,
        match_threshold: threshold,
        match_count: limit,
        org_id: organisationId,
      });

      if (error) throw error;

      return (data || []).map((item: any) => ({
        description: item.description,
        similarity_score: item.similarity,
        suggested_system_code: item.system_code,
        suggested_trade: item.trade,
        suggested_unit: item.unit,
        reference_item_id: item.id,
      }));
    } catch (error) {
      console.error('Similarity search failed:', error);
      return this.fallbackFuzzyMatch(description, organisationId, limit);
    }
  }

  async getEmbedding(text: string): Promise<number[]> {
    if (this.embeddingsCache.has(text)) {
      return this.embeddingsCache.get(text)!;
    }

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get_embedding`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ text }),
        }
      );

      if (!response.ok) {
        throw new Error('Embedding API failed');
      }

      const { embedding } = await response.json();
      this.embeddingsCache.set(text, embedding);

      if (this.embeddingsCache.size > 100) {
        const firstKey = this.embeddingsCache.keys().next().value;
        this.embeddingsCache.delete(firstKey);
      }

      return embedding;
    } catch (error) {
      console.error('Failed to get embedding:', error);
      return [];
    }
  }

  async batchMatchLineItems(
    lineItems: any[],
    organisationId: string
  ): Promise<Map<number, SimilarityMatch[]>> {
    const results = new Map<number, SimilarityMatch[]>();

    const embeddings = await Promise.all(
      lineItems.map(item => this.getEmbedding(item.description))
    );

    for (let i = 0; i < lineItems.length; i++) {
      if (embeddings[i].length === 0) continue;

      try {
        const { data, error } = await supabase.rpc('match_library_items', {
          query_embedding: embeddings[i],
          match_threshold: 0.7,
          match_count: 3,
          org_id: organisationId,
        });

        if (error) throw error;

        if (data && data.length > 0) {
          results.set(
            i,
            data.map((item: any) => ({
              description: item.description,
              similarity_score: item.similarity,
              suggested_system_code: item.system_code,
              suggested_trade: item.trade,
              suggested_unit: item.unit,
              reference_item_id: item.id,
            }))
          );
        }
      } catch (error) {
        console.error(`Batch match failed for item ${i}:`, error);
      }
    }

    return results;
  }

  private async fallbackFuzzyMatch(
    description: string,
    organisationId: string,
    limit: number
  ): Promise<SimilarityMatch[]> {
    const referenceItems = await this.getReferenceItems(organisationId);

    const normalized = this.normalizeText(description);
    const tokens = normalized.split(/\s+/);

    const scored = referenceItems.map(item => {
      const itemNormalized = this.normalizeText(item.description);
      const itemTokens = itemNormalized.split(/\s+/);

      let score = 0;

      const commonTokens = tokens.filter(t => itemTokens.includes(t));
      score += (commonTokens.length / tokens.length) * 0.5;
      score += (commonTokens.length / itemTokens.length) * 0.5;

      if (itemNormalized.includes(normalized) || normalized.includes(itemNormalized)) {
        score += 0.3;
      }

      const keyTerms = ['sc902', 'nullifire', 'tenmat', 'intumescent', 'fire', 'rating'];
      const matchedKeyTerms = keyTerms.filter(
        term => normalized.includes(term) && itemNormalized.includes(term)
      );
      score += matchedKeyTerms.length * 0.1;

      return { item, score };
    });

    scored.sort((a, b) => b.score - a.score);

    return scored
      .filter(s => s.score >= 0.3)
      .slice(0, limit)
      .map(s => ({
        description: s.item.description,
        similarity_score: s.score,
        suggested_system_code: s.item.system_code,
        suggested_trade: s.item.trade,
        suggested_unit: s.item.unit,
        reference_item_id: s.item.id,
      }));
  }

  private async getReferenceItems(organisationId: string): Promise<ReferenceItem[]> {
    if (this.cache.has(organisationId)) {
      return this.cache.get(organisationId)!;
    }

    const { data, error } = await supabase
      .from('library_items')
      .select('id, description, system_code, trade, unit, typical_rate')
      .eq('organisation_id', organisationId)
      .limit(1000);

    if (error) {
      console.error('Failed to load reference items:', error);
      return [];
    }

    this.cache.set(organisationId, data || []);
    return data || [];
  }

  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  clearCache(): void {
    this.cache.clear();
    this.embeddingsCache.clear();
  }
}

export const itemMatcher = new EmbeddingsItemMatcher();
