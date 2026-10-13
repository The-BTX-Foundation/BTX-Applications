// Supabase clients for server code (server components, route handlers, the proxy).
import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import type { BtxClient } from './client';

export type CookieAdapter = {
  getAll: () => { name: string; value: string }[];
  /** May throw in a server component (cookies are read-only there); the proxy keeps the session fresh instead. */
  setAll: (cookies: { name: string; value: string; options: Record<string, unknown> }[]) => void;
};

// Reads the two public env vars, or throws a clear message.
function env(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars are not set.');
  return { url, key };
}

// A server client that acts as the signed-in person (their cookies carry the session), so row-level security
// applies to every query exactly as it does in the browser.
export function createSessionClient(cookies: CookieAdapter): BtxClient {
  const { url, key } = env();
  return createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => cookies.getAll(),
      setAll: (list) => {
        try {
          cookies.setAll(list);
        } catch {
          // called from a server component: the proxy refreshes the session, so ignoring this is safe
        }
      },
    },
  }) as unknown as BtxClient;
}

// A client with no session (the signed-out visitor, the "anon" role). Used for public reads such as the cycle.
export function createAnonClient(): BtxClient {
  const { url, key } = env();
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// A client that uses the service role key and so skips row-level security. SERVER ONLY: the key comes from the server's
// environment (never NEXT_PUBLIC_, never committed). Returns null when the key is not set, so callers can degrade.
// Loosely typed on purpose: the tables it touches are not all in the generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ServiceClient = SupabaseClient<any, 'public', any>;

export function createServiceClient(): ServiceClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
