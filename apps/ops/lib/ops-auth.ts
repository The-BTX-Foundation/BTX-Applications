// Staff sign-in calls (browser side). Same flow as the Portal (an emailed code and a link, verified with Supabase's
// email one-time-password), with two differences:
//   1. The email may be on any domain, and an address that is not already an account does NOT create one
//      (shouldCreateUser: false), so a typo cannot make a stray account. The screen answers the same either way, so it
//      does not reveal who has an account.
//   2. After the code checks out, the account's role is read (app_metadata.role, the field public.app_role() reads in the
//      database). Anyone who is not admin, board or reviewer is signed out again.
// Mock mode (no Supabase env): any address is sent a code, 123456 signs in, 000000 is the expired-code case, and an
// address starting "outsider" signs in as an account with no role so the no-access screen can be seen.
import { getAuthMode, getBrowserClient, signOut, verifySignInCode } from '@btx/data';
import { isStaffRole } from './role';

export type SendResult = { ok: true } | { ok: false; reason: 'rate-limited' | 'failed' };
export type CheckResult = { ok: true } | { ok: false; reason: 'wrong' | 'expired' | 'failed' | 'no-access' };

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Asks for a code and a sign-in link by email.
export async function sendStaffCode(email: string, redirectTo: string): Promise<SendResult> {
  if (getAuthMode() === 'mock') {
    await pause(250);
    return { ok: true };
  }
  const { error } = await getBrowserClient().auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: redirectTo },
  });
  if (!error) return { ok: true };
  if (error.code === 'otp_disabled' || error.code === 'user_not_found') return { ok: true }; // no account: say nothing
  const limited = error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit' || error.status === 429;
  return { ok: false, reason: limited ? 'rate-limited' : 'failed' };
}

// Checks the code, then checks the role. A person without a staff role is signed out before this returns.
export async function checkStaffCode(email: string, code: string): Promise<CheckResult> {
  const r = await verifySignInCode(email, code);
  if (!r.ok) return { ok: false, reason: r.reason === 'invalid-or-expired' ? 'expired' : r.reason };
  if (getAuthMode() === 'mock') {
    if (email.startsWith('outsider')) {
      await signOut();
      return { ok: false, reason: 'no-access' };
    }
    return { ok: true };
  }
  // getUser() asks the auth server, so the role is current rather than read from a cached token.
  const { data } = await getBrowserClient().auth.getUser();
  if (!isStaffRole(data.user?.app_metadata?.role)) {
    await signOut();
    return { ok: false, reason: 'no-access' };
  }
  return { ok: true };
}
