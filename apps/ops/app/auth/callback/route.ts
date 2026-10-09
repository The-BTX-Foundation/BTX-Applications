// The sign-in link in the email lands here. It handles both link styles Supabase uses:
//   ?code=...                 (PKCE: exchangeCodeForSession)
//   ?token_hash=...&type=...  (verifyOtp with the token hash)
// then the session cookies are set, the account's role is checked (admin, board or reviewer only), and the person goes
// on to `next` (a same-site path; default is Today). A link that fails (expired or already used) goes back to the
// sign-in screen with ?error=link; an account with no staff role is signed out through /auth/denied.
import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { sessionClient } from '@/lib/supabase-server';
import { safeNext } from '@/lib/safe-next';
import { isStaffRole } from '@/lib/role';

// Handles the emailed link.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNext(searchParams.get('next')) ?? '/';
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;

  try {
    const client = await sessionClient();
    let ok = false;
    if (code) {
      ok = !(await client.auth.exchangeCodeForSession(code)).error;
    } else if (tokenHash && type) {
      ok = !(await client.auth.verifyOtp({ token_hash: tokenHash, type })).error;
    }
    if (ok) {
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
