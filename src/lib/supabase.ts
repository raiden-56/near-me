import type { SupabaseClient } from '@supabase/supabase-js';
import { env, hasBackend } from './env';

let clientPromise: Promise<SupabaseClient> | null = null;

/**
 * Lazily creates the Supabase client. The SDK is only downloaded when a backend is configured,
 * so local mode ships none of it. Only the public anon key is ever used in the browser: all
 * authorisation is enforced by Row Level Security (see /supabase/migrations).
 */
export function getSupabase(): Promise<SupabaseClient> | null {
  if (!hasBackend) return null;
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(env.supabase.url, env.supabase.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    }),
  );
  return clientPromise;
}
