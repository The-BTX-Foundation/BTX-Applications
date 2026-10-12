// The sign-in link in the email lands here. It handles both link styles Supabase uses:
//   ?code=...                 (PKCE: exchangeCodeForSession)
//   ?token_hash=...&type=...  (verifyOtp with the token hash)
// then the session cookies are set and she goes on to `next` (only /apply or /status paths; default /apply/start).
// A link that fails (expired or already used) goes back to the sign-in screen with ?error=link.
import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { sessionClient } from '@/lib/supabase-server';
import { safeNext } from '@/lib/safe-next';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNext(searchParams.get('next')) ?? '/apply/start';
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;

  try {
    const client = await sessionClient();
    if (code) {
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(next, origin));
    } else if (tokenHash && type) {
      const { error } = await client.auth.verifyOtp({ token_hash: tokenHash, type });
      if (!error) return NextResponse.redirect(new URL(next, origin));
    }
  } catch {
    // fall through to the failure redirect
  }
  return NextResponse.redirect(new URL('/sign-in?error=link', origin));
}
