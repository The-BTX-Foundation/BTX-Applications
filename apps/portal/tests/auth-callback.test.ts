import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// A stand-in for the session client: records which sign-in calls the route makes. Nothing talks to Supabase.
const auth = {
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
};
const sessionClient = vi.fn(async () => ({ auth }));
vi.mock('@/lib/supabase-server', () => ({ sessionClient: () => sessionClient() }));

const { GET } = await import('@/app/auth/callback/route');

const ORIGIN = 'https://apply.thebtxfoundation.org';

// Calls the route the way a click on an email link does, and returns where it sent the browser.
async function open(query: string): Promise<{ location: string; cookies: string[] }> {
  const response = await GET(new NextRequest(`${ORIGIN}/auth/callback${query}`));
  return { location: response.headers.get('location') ?? '', cookies: response.headers.getSetCookie() };
}

// A user whose first sign-in this is (confirmed and signed in at the same moment), for the "account created" count.
const firstTimer = {
  created_at: '2026-10-22T12:00:00Z',
  email_confirmed_at: '2026-10-22T12:05:00Z',
  last_sign_in_at: '2026-10-22T12:05:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  auth.exchangeCodeForSession.mockResolvedValue({ data: { user: null, session: {} }, error: null });
  auth.verifyOtp.mockResolvedValue({ data: { user: null, session: {} }, error: null });
});

describe('/auth/callback refuses token_hash links (login CSRF, security review 2026-10-22)', () => {
  it('sends a token_hash link to the link-failed screen without verifying it or touching the session', async () => {
    // if verifyOtp were reached, this first-time user would make the route set the "account created" cookie on the
    // response, so the empty-cookies check below fails on the old route too (session cookies go through the mock)
    auth.verifyOtp.mockResolvedValue({ data: { user: firstTimer, session: {} }, error: null });
    for (const type of ['magiclink', 'email', 'signup', 'recovery', 'invite']) {
      const { location, cookies } = await open(`?token_hash=pkce_abc123&type=${type}&next=%2Fapply%2Fstart`);
      expect(location).toBe(`${ORIGIN}/sign-in?error=link`);
      expect(cookies).toEqual([]);
    }
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    expect(sessionClient).not.toHaveBeenCalled();
  });

  it('refuses a link with no code at all', async () => {
    expect((await open('')).location).toBe(`${ORIGIN}/sign-in?error=link`);
    expect((await open('?type=magiclink')).location).toBe(`${ORIGIN}/sign-in?error=link`);
    expect((await open('?code=&token_hash=pkce_abc123&type=magiclink')).location).toBe(`${ORIGIN}/sign-in?error=link`);
    expect(sessionClient).not.toHaveBeenCalled();
  });

  it('uses only the code when a link carries both', async () => {
    const { location } = await open('?code=c0de&token_hash=pkce_abc123&type=magiclink');
    expect(location).toBe(`${ORIGIN}/apply/start`);
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('c0de');
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });
});

describe('/auth/callback PKCE code links (unchanged)', () => {
  it('signs in with the code and goes on to a safe next', async () => {
    const { location } = await open('?code=c0de&next=%2Fstatus');
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('c0de');
    expect(location).toBe(`${ORIGIN}/status`);
  });

  it('ignores an unsafe next and goes to /apply/start', async () => {
    expect((await open('?code=c0de&next=https%3A%2F%2Fevil.example')).location).toBe(`${ORIGIN}/apply/start`);
    expect((await open('?code=c0de&next=%2F%2Fevil.example')).location).toBe(`${ORIGIN}/apply/start`);
  });

  it('sends a code that fails (expired, used, other browser) to the link-failed screen', async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ data: { user: null, session: null }, error: { message: 'bad code' } });
    expect((await open('?code=c0de')).location).toBe(`${ORIGIN}/sign-in?error=link`);
  });

  it('sends a sign-in service failure to the link-failed screen', async () => {
    auth.exchangeCodeForSession.mockRejectedValue(new Error('network'));
    expect((await open('?code=c0de')).location).toBe(`${ORIGIN}/sign-in?error=link`);
  });

  it('still sets the one-time "account created" cookie on a first sign-in', async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ data: { user: firstTimer, session: {} }, error: null });
    const { cookies } = await open('?code=c0de');
    expect(cookies.some((c) => c.startsWith('__Host-btx-signup=1'))).toBe(true);
  });
});
