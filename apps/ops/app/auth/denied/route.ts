// Signs out an account that has no Ops Hub role and sends it to the sign-in screen with the "no access" message.
import { NextResponse, type NextRequest } from 'next/server';
import { sessionClient } from '@/lib/supabase-server';

// Ends the session (this clears the cookies on the response), then redirects.
export async function GET(request: NextRequest) {
  try {
    const client = await sessionClient();
    await client.auth.signOut();
  } catch {
    // no session to end
  }
  return NextResponse.redirect(new URL('/sign-in?error=access', request.nextUrl.origin));
}
