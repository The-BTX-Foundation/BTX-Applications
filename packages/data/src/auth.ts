// Sign-in with an emailed 6-digit code (Supabase email OTP), behind a feature flag.
//
// Mode: NEXT_PUBLIC_AUTH_MODE = "supabase" | "mock". When it is not set, the mode is "supabase" if both Supabase
// env vars exist and "mock" otherwise, so the pages run locally without any credentials. The mock never talks to
// the network: any address is "sent" a code, 123456 signs in, 000000 shows the expired-code state and any other
// code shows the wrong-code state.
import { getBrowserClient, hasSupabaseEnv } from './client';

export type AuthMode = 'supabase' | 'mock';

export type SendResult = { ok: true } | { ok: false; reason: 'rate-limited' | 'failed' };
export type VerifyResult = { ok: true; email: string } | { ok: false; reason: 'wrong' | 'expired' | 'failed' };

// Which backend sign-in uses right now.
export function getAuthMode(): AuthMode {
  const flag = process.env.NEXT_PUBLIC_AUTH_MODE;
  if (flag === 'mock') return 'mock';
  if (flag === 'supabase') return hasSupabaseEnv() ? 'supabase' : 'mock';
  return hasSupabaseEnv() ? 'supabase' : 'mock';
}

const MOCK_KEY = 'btx-mock-email';

// Remembers the mock session's email for this browser tab (the mock has no real session).
function rememberMockEmail(email: string) {
  try {
    sessionStorage.setItem(MOCK_KEY, email);
  } catch {
    // storage blocked: the mock session is simply not remembered
  }
}

// The email of whoever is signed in, or null. Mock mode reads the tab's remembered email; Supabase mode asks the
// stored session.
export async function getSignedInEmail(): Promise<string | null> {
  if (getAuthMode() === 'mock') {
    try {
      return sessionStorage.getItem(MOCK_KEY);
    } catch {
      return null;
    }
  }
  const { data } = await getBrowserClient().auth.getUser();
  return data.user?.email ?? null;
}

// A short pause so the mock feels like a network call.
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Asks for a new 6-digit code by email. shouldCreateUser is true: signing in creates the account on a first visit.
export async function requestSignInCode(email: string): Promise<SendResult> {
  if (getAuthMode() === 'mock') {
    await pause(250);
    return { ok: true };
  }
  const { error } = await getBrowserClient().auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (!error) return { ok: true };
  return { ok: false, reason: error.code === 'over_email_send_rate_limit' ? 'rate-limited' : 'failed' };
}

// Checks the code the student typed. On success Supabase stores the session in the browser.
export async function verifySignInCode(email: string, token: string): Promise<VerifyResult> {
  if (getAuthMode() === 'mock') {
    await pause(250);
    if (token === '123456') {
      rememberMockEmail(email);
      return { ok: true, email };
    }
    if (token === '000000') return { ok: false, reason: 'expired' };
    return { ok: false, reason: 'wrong' };
  }
  const { data, error } = await getBrowserClient().auth.verifyOtp({ email, token, type: 'email' });
  if (!error && data.user) return { ok: true, email: data.user.email ?? email };
  // Supabase reports an old code as otp_expired; a code that never matched comes back as a plain auth error.
  if (error?.code === 'otp_expired') return { ok: false, reason: 'expired' };
  if (error && error.status !== undefined && error.status >= 400 && error.status < 500) return { ok: false, reason: 'wrong' };
  return { ok: false, reason: 'failed' };
}
