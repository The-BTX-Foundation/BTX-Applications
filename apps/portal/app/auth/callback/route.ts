// The sign-in link in the email lands here with ?code=... (PKCE). exchangeCodeForSession needs the code verifier that
// signInWithOtp left in THIS browser, so a link signs in only the browser that asked for it. Then the session cookies
// are set and she goes on to `next` (only /apply or /status paths; default /apply/start).
// A link that fails (expired, already used, opened in another browser) goes back to the sign-in screen with ?error=link.
//
// ?token_hash=... links are refused on purpose. verifyOtp with a token hash works in ANY browser and replaces the
// session the browser already has, so anyone could take the token from their own sign-in email, send the link to a
// student, and the student's browser would be signed in to their account (login CSRF; security review 2026-10-22).
// The sign-in emails (Supabase "Magic link or OTP" and "Confirm sign up" templates) lead with the 6-digit code, which
// she types on the screen that asked for it. Any link in those templates must be {{ .ConfirmationURL }} (it ends here
// as ?code=) or nothing, never a token_hash link. To bring token_hash links back, add a step that shows which account
// the link signs in and completes only on a same-origin POST; don't turn verifyOtp back on here.
import { NextResponse, type NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { isFirstSignIn } from '@btx/data';
import { sessionClient } from '@/lib/supabase-server';
import { safeNext } from '@/lib/safe-next';
import { signupCookieName } from '@/lib/analytics';

// The redirect after a link that checked out. When the link created the account, a ten-minute cookie holding only "1"
// tells the browser side to count one "account created" (lib/analytics-client.ts reads it once and deletes it). It
// carries no personal data; the browser must read it, so it is not httpOnly. On https its name has the __Host- prefix.
function signedIn(next: string, origin: string, user: User | null): NextResponse {
  const response = NextResponse.redirect(new URL(next, origin));
  if (isFirstSignIn(user)) {
    const https = origin.startsWith('https:');
    response.cookies.set(signupCookieName(https), '1', { maxAge: 600, path: '/', sameSite: 'lax', secure: https });
  }
  return response;
}

// Signs her in from the email link and sends her on (see the top of this file).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNext(searchParams.get('next')) ?? '/apply/start';
  const code = searchParams.get('code');

  // Only the PKCE code signs anyone in. A token_hash link (or no code at all) goes to the failure redirect and never
  // touches the session this browser already has.
  if (!code) return NextResponse.redirect(new URL('/sign-in?error=link', origin));

  try {
    const client = await sessionClient();
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (!error) return signedIn(next, origin, data.user);
  } catch {
    // fall through to the failure redirect
  }
  return NextResponse.redirect(new URL('/sign-in?error=link', origin));
}
