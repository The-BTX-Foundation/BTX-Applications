// The sign-in link in the email lands here. It handles both link styles Supabase uses:
//   ?code=...                 (PKCE: exchangeCodeForSession)
//   ?token_hash=...&type=...  (verifyOtp with the token hash)
// then the session cookies are set and she goes on to `next` (only /apply or /status paths; default /apply/start).
// A link that fails (expired or already used) goes back to the sign-in screen with ?error=link.
import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType, User } from '@supabase/supabase-js';
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
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;

  try {
    const client = await sessionClient();
    if (code) {
      const { data, error } = await client.auth.exchangeCodeForSession(code);
      if (!error) return signedIn(next, origin, data.user);
    } else if (tokenHash && type) {
      const { data, error } = await client.auth.verifyOtp({ token_hash: tokenHash, type });
      if (!error) return signedIn(next, origin, data.user);
    }
  } catch {
    // fall through to the failure redirect
  }
  return NextResponse.redirect(new URL('/sign-in?error=link', origin));
}
