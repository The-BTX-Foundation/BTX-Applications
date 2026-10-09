// The Supabase browser client for the BTX apps (cookie sessions through @supabase/ssr, so the server and the
// proxy see the same session).
// It reads NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Both are public by design: what a
// signed-in person can read or change is decided by the database's row-level security rules, not by hiding the key.
// There is no service-role key anywhere in these apps, and none may be put in a NEXT_PUBLIC_ variable.
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type BtxClient = SupabaseClient<Database>;

let cached: BtxClient | null = null;

// True when both Supabase env vars are set. Next.js inlines NEXT_PUBLIC_ values at build time, so these must stay
// literal property reads.
export function hasSupabaseEnv(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

// The shared browser client, created on first use. Throws if the env vars are missing, so callers check
// hasSupabaseEnv() (or use the adapter functions, which fall back to a mock) first.
export function getBrowserClient(): BtxClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set to use Supabase.');
  }
  cached = createBrowserClient<Database>(url, key);
  return cached;
}
