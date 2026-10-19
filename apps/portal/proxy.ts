// Next.js proxy (called "middleware" before Next 16). It keeps the Supabase session fresh on every request and sends a
// signed-out visitor who opens an /apply page to /sign-in?next=... . In mock mode (no Supabase env) there is no
// server-side session, so nothing is guarded.
//
// It also sets the Content-Security-Policy-Report-Only trial (lib/csp.ts, owner notes CSP.md): a fresh nonce per
// request goes on the REQUEST headers, where Next.js reads it and stamps it on its own inline scripts, and the policy
// goes on the response, so the browser reports anything the policy would refuse.
import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@btx/data/proxy';
import { REPORT_PATH, buildCsp, makeNonce } from '@/lib/csp';

// Adds the report-only policy to a response.
function withCsp(response: NextResponse, policy: string): NextResponse {
  response.headers.set('Content-Security-Policy-Report-Only', policy);
  return response;
}

// Builds this request's policy, refreshes the session, then applies the /apply guard.
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  // a violation report needs no session and no policy of its own
  if (pathname === REPORT_PATH) return NextResponse.next();

  const nonce = makeNonce();
  const policy = buildCsp({
    nonce,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    dev: process.env.NODE_ENV === 'development',
    vercelPreview: process.env.VERCEL_ENV === 'preview',
    review: process.env.NEXT_PUBLIC_RAYKEN_REVIEW === '1',
  });
  // Next.js takes the nonce for its inline scripts from a CSP REQUEST header (and app/layout.tsx reads the same one for
  // the review loader). On Vercel only the `content-security-policy` name reaches the page render: under the report-only
  // name the nonce came out undefined in production (2026-10-19), though `next start` read it fine. A request header is
  // never sent to the browser, so this name enforces nothing there; the browser gets only the report-only RESPONSE header
  // set below. Setting it also replaces any client-sent one, so a client can't choose the nonce; a client-sent
  // report-only one is removed too.
  request.headers.set('content-security-policy', policy);
  request.headers.delete('content-security-policy-report-only');
  request.headers.set('x-btx-probe', '1'); // TEMPORARY preview probe

  const { response, userId, live } = await updateSession(request);
  if (live && !userId && (pathname === '/apply' || pathname.startsWith('/apply/') || pathname === '/status')) {
    const url = request.nextUrl.clone();
    url.pathname = '/sign-in';
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    const redirect = NextResponse.redirect(url);
    // keep any cookies the refresh set
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return withCsp(redirect, policy);
  }
  return withCsp(response, policy);
}

export const config = {
  // everything except static files and images
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|woff2)$).*)'],
};
