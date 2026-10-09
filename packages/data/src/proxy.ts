// Session refresh for the Next.js proxy (Next 16's name for middleware). On every request it asks Supabase to
// check and, if needed, refresh the session cookies, and tells the caller whether anyone is signed in.
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from './database.types';
import { hasSupabaseEnv } from './client';

export type SessionResult = {
  /** The response to return (carries any refreshed cookies). Redirects must copy its cookies. */
  response: NextResponse;
  /** The signed-in user's id, or null. */
  userId: string | null;
  /** False in mock mode (no Supabase env): there is no server-side session to check. */
  live: boolean;
};

// Refreshes the session and reports who is signed in. getClaims() checks the token's signature locally, so it
// does not call the auth server on every page view.
export async function updateSession(request: NextRequest): Promise<SessionResult> {
  let response = NextResponse.next({ request });
  if (!hasSupabaseEnv()) return { response, userId: null, live: false };

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );
  const { data } = await supabase.auth.getClaims();
  return { response, userId: data?.claims?.sub ?? null, live: true };
}
