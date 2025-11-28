import { supabase } from '../supabase';

export async function getModelRatesForProject(projectId: string): Promise<Record<string, number>> {
  return {};
}

export async function getModelRateForSystem(projectId: string, systemId: string): Promise<number | null> {
  return null;
}

export function getModelRateProvider(projectId: string) {
  return {
    loadSettings: async () => {
      console.log('ModelRateProvider: loadSettings called for project', projectId);
    },
    getModelRate: (criteria: any) => {
      const { data: modelRate } = { data: { rate: null, componentCount: null } };
      return modelRate;
    },
    getRate: async (systemId: string) => getModelRateForSystem(projectId, systemId),
    getRates: async () => getModelRatesForProject(projectId),
  };
}
