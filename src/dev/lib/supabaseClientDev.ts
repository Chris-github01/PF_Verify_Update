import { createClient, SupabaseClient } from '@supabase/supabase-js';

const KNOWN_PRODUCTION_REFS: string[] = [];

function assertDevConfig(): { url: string; anonKey: string } {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      '[VERIFYTRADE NEXT] DEV SUPABASE CONFIG MISSING – STOP EXECUTION. ' +
      'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.'
    );
  }

  for (const ref of KNOWN_PRODUCTION_REFS) {
    if (url.includes(ref)) {
      throw new Error(
        `[VERIFYTRADE NEXT] PRODUCTION CONNECTION BLOCKED. ` +
        `URL contains known production ref "${ref}". ` +
        `Use a dedicated development Supabase project.`
      );
    }
  }

  if (url.includes('prod') || url.includes('production')) {
    throw new Error(
      '[VERIFYTRADE NEXT] PRODUCTION CONNECTION BLOCKED. ' +
      'URL appears to reference a production environment. ' +
      'Use a dedicated development Supabase project.'
    );
  }

  return { url, anonKey };
}

let _client: SupabaseClient | null = null;

export function getDevSupabaseClient(): SupabaseClient {
  if (_client) return _client;

  const { url, anonKey } = assertDevConfig();

  console.log('[VERIFYTRADE NEXT] Initialising isolated DEV Supabase client');

  _client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });

  return _client;
}

export const isDevelopmentEnvironment = true;
