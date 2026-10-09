// Next.js proxy (called "middleware" before Next 16). It keeps the Supabase session fresh on every request and guards
// every Ops Hub route: a signed-out visitor goes to /sign-in, and a signed-in account whose app_metadata.role is not
// admin, board or reviewer is signed out (through /auth/denied). Only /sign-in and /auth/* are open. In mock mode
// (no Supabase env) there is no server-side session, so nothing is guarded and the pages show the sample data.
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@btx/data';
import { hasSupabaseEnv } from '@btx/data';
import { isStaffRole } from '@/lib/role';

// Copies the refreshed session cookies from one response onto another (a redirect must carry them).
function carryCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((c) => to.cookies.set(c));
  return to;
}

// Refreshes the session, then applies the staff guard.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!hasSupabaseEnv()) return response;

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
  // getClaims() checks the token's signature locally; app_metadata.role is what public.app_role() reads in the database.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims as { sub?: string; app_metadata?: { role?: unknown } } | undefined;
  const signedIn = Boolean(claims?.sub);
  const staff = isStaffRole(claims?.app_metadata?.role);

  const { pathname, search } = request.nextUrl;
  const open = pathname === '/sign-in' || pathname.startsWith('/auth/');

  if (!signedIn && !open) {
    const url = request.nextUrl.clone();
    url.pathname = '/sign-in';
    url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`;
    return carryCookies(response, NextResponse.redirect(url));
  }
  if (signedIn && !staff && !pathname.startsWith('/auth/')) {
    // A signed-in account with no staff role: sign it out and explain on the sign-in screen.
    const url = request.nextUrl.clone();
    url.pathname = '/auth/denied';
    url.search = '';
    return carryCookies(response, NextResponse.redirect(url));
  }
  if (signedIn && staff && pathname === '/sign-in') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return carryCookies(response, NextResponse.redirect(url));
  }
  return response;
}

export const config = {
  // Skip Next's own files and static assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2)$).*)'],
};
