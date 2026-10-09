// The Supabase browser client for the BTX apps.
// It reads NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (the project's publishable key). Those two
// values are safe to ship to a browser: what a signed-in person can read or change is decided by the database's
// row-level security rules, not by hiding the key. Never put a service-role key in a NEXT_PUBLIC_ variable.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

// True when both Supabase env vars are set.
export function hasSupabaseEnv(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

// Returns the shared browser client, creating it on first use. Throws if the env vars are missing, so callers
// check hasSupabaseEnv() (or use the auth adapter, which falls back to a mock) first.
export function getBrowserClient(): SupabaseClient {
  if (cached) return cached;
  // Next.js inlines NEXT_PUBLIC_ values at build time, so these reads must stay as literal property accesses.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set to use Supabase.');
  }
  cached = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return cached;
}
