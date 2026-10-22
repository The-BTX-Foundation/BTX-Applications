import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// A stand-in for the session client: records which sign-in calls the route makes. Nothing talks to Supabase.
const auth = {
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
  getUser: vi.fn(),
};
const sessionClient = vi.fn(async () => ({ auth }));
vi.mock('@/lib/supabase-server', () => ({ sessionClient: () => sessionClient() }));

const { GET } = await import('@/app/auth/callback/route');

const ORIGIN = 'https://ops.thebtxfoundation.org';

// Calls the route the way a click on an email link does, and returns where it sent the browser.
async function open(query: string): Promise<string> {
  const response = await GET(new NextRequest(`${ORIGIN}/auth/callback${query}`));
  return response.headers.get('location') ?? '';
}

// The signed-in account the stand-in auth server reports, with the given app_metadata.role.
function signedInAs(role: string | undefined) {
  auth.getUser.mockResolvedValue({ data: { user: { app_metadata: role ? { role } : {} } }, error: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.exchangeCodeForSession.mockResolvedValue({ data: { user: null, session: {} }, error: null });
  // if verifyOtp were reached it would "succeed" for a board member, so the old route would send the browser on to Today
  auth.verifyOtp.mockResolvedValue({ data: { user: null, session: {} }, error: null });
  signedInAs('board');
});

describe('Ops /auth/callback refuses token_hash links (login CSRF, security review 2026-10-22)', () => {
  it('sends a token_hash link to the link-failed screen without verifying it or touching the session', async () => {
    for (const type of ['magiclink', 'email', 'signup', 'recovery', 'invite']) {
      expect(await open(`?token_hash=pkce_abc123&type=${type}&next=%2Fscholarships`)).toBe(`${ORIGIN}/sign-in?error=link`);
    }
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    expect(sessionClient).not.toHaveBeenCalled();
  });

  it('refuses a link with no code at all, or an empty one', async () => {
    expect(await open('')).toBe(`${ORIGIN}/sign-in?error=link`);
    expect(await open('?type=magiclink')).toBe(`${ORIGIN}/sign-in?error=link`);
    expect(await open('?code=&token_hash=pkce_abc123&type=magiclink')).toBe(`${ORIGIN}/sign-in?error=link`);
    expect(sessionClient).not.toHaveBeenCalled();
  });

  it('uses only the code when a link carries both', async () => {
    expect(await open('?code=c0de&token_hash=pkce_abc123&type=magiclink')).toBe(`${ORIGIN}/`);
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('c0de');
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });
});

describe('Ops /auth/callback PKCE code links (unchanged)', () => {
  it('signs a board member or an admin in and goes on to a safe next (default Today)', async () => {
    expect(await open('?code=c0de')).toBe(`${ORIGIN}/`);
    expect(await open('?code=c0de&next=%2Fscholarships%2Finterviews')).toBe(`${ORIGIN}/scholarships/interviews`);
    signedInAs('admin');
    expect(await open('?code=c0de&next=%2Ffinance')).toBe(`${ORIGIN}/finance`);
  });

  it('sends an account with no staff role to /auth/denied', async () => {
    for (const role of ['applicant', undefined]) {
      signedInAs(role);
      expect(await open('?code=c0de&next=%2Ffinance')).toBe(`${ORIGIN}/auth/denied`);
    }
  });

  it('ignores an unsafe next and goes to Today', async () => {
    for (const bad of ['https%3A%2F%2Fevil.example', '%2F%2Fevil.example', '%2F%09%2Fevil.example', '%2Fsign-in', '%2Fauth%2Fdenied']) {
      expect(await open(`?code=c0de&next=${bad}`)).toBe(`${ORIGIN}/`);
    }
  });

  it('sends the browser to /auth/denied when the auth server returns no user, and fails closed when it errors', async () => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'no user' } });
    expect(await open('?code=c0de&next=%2Ffinance')).toBe(`${ORIGIN}/auth/denied`);
    auth.getUser.mockRejectedValue(new Error('network'));
    expect(await open('?code=c0de&next=%2Ffinance')).toBe(`${ORIGIN}/sign-in?error=link`);
  });

  it('sends a code that fails (expired, used, other browser) or a service failure to the link-failed screen', async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ data: { user: null, session: null }, error: { message: 'bad code' } });
    expect(await open('?code=c0de')).toBe(`${ORIGIN}/sign-in?error=link`);
    expect(auth.getUser).not.toHaveBeenCalled();
    auth.exchangeCodeForSession.mockRejectedValue(new Error('network'));
    expect(await open('?code=c0de')).toBe(`${ORIGIN}/sign-in?error=link`);
  });
});
