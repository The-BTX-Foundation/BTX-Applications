// An email sign-in link lands here with ?code=... (PKCE). exchangeCodeForSession needs the code verifier that
// signInWithOtp left in THIS browser, so a link signs in only the browser that asked for it. Then the session cookies
// are set, the account's role is checked (admin or board only), and the person goes on to `next` (a same-site path;
// default is Today). A link that fails (expired, already used, opened in another browser) goes back to the sign-in
// screen with ?error=link; an account with no staff role is signed out through /auth/denied.
//
// ?token_hash=... links are refused on purpose, as in the Portal's callback. verifyOtp with a token hash works in ANY
// browser and replaced the session the browser already had before the role check ran, so a link built from another
// account's sign-in email could sign a board member's browser into that account (login CSRF; security review
// 2026-10-22). The sign-in emails (Supabase "Magic link or OTP" and "Confirm sign up" templates, shared with the
// Portal) carry only the 6-digit code; any link added there must be {{ .ConfirmationURL }} (it ends here as ?code=),
// never a token_hash link. Don't turn verifyOtp back on here.
import { NextResponse, type NextRequest } from 'next/server';
import { sessionClient } from '@/lib/supabase-server';
import { safeNext } from '@/lib/safe-next';
import { isStaffRole } from '@/lib/role';

// Handles the emailed link.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNext(searchParams.get('next')) ?? '/';
  const code = searchParams.get('code');

  // Only the PKCE code signs anyone in. A token_hash link (or no code at all) goes to the failure redirect and never
  // touches the session this browser already has.
  if (!code) return NextResponse.redirect(new URL('/sign-in?error=link', origin));

  try {
    const client = await sessionClient();
    if (!(await client.auth.exchangeCodeForSession(code)).error) {
      // getUser() asks the auth server, so app_metadata.role is current (a role granted a minute ago counts).
      const { data } = await client.auth.getUser();
      if (!isStaffRole(data.user?.app_metadata?.role)) return NextResponse.redirect(new URL('/auth/denied', origin));
      return NextResponse.redirect(new URL(next, origin));
    }
  } catch {
    // fall through to the failure redirect
  }
  return NextResponse.redirect(new URL('/sign-in?error=link', origin));
}
