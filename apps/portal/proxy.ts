// Next.js proxy (called "middleware" before Next 16). It keeps the Supabase session fresh on every request and sends a
// signed-out visitor who opens an /apply page to /sign-in?next=... . In mock mode (no Supabase env) there is no
// server-side session, so nothing is guarded.
import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@btx/data/proxy';

// Refreshes the session, then applies the /apply guard.
export async function proxy(request: NextRequest) {
  const { response, userId, live } = await updateSession(request);
  const { pathname, search } = request.nextUrl;
  if (live && !userId && (pathname === '/apply' || pathname.startsWith('/apply/') || pathname === '/status')) {
    const url = request.nextUrl.clone();
    url.pathname = '/sign-in';
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    const redirect = NextResponse.redirect(url);
    // keep any cookies the refresh set
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }
  return response;
}

export const config = {
  // everything except static files and images
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|woff2)$).*)'],
};
