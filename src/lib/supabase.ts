import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

console.log('🔧 [supabase.ts] Initializing Supabase client...');

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

console.log('🔧 [supabase.ts] URL:', supabaseUrl);
console.log('🔧 [supabase.ts] Key present:', !!supabaseAnonKey);

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ [supabase.ts] Missing Supabase environment variables');
  console.error('VITE_SUPABASE_URL:', supabaseUrl);
  console.error('VITE_SUPABASE_ANON_KEY:', supabaseAnonKey ? 'present' : 'missing');
  console.error('Available env vars:', Object.keys(import.meta.env));

  throw new Error('Missing Supabase environment variables. Check your .env file.');
}

console.log('✅ [supabase.ts] Creating Supabase client...');

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

console.log('✅ [supabase.ts] Supabase client created successfully');
