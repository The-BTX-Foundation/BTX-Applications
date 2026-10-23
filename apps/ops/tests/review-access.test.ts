import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasSupabaseEnv } from '@btx/data';
import { DEMO_BANNER_TEXT, DEMO_URL, REVIEW_EMAIL, reviewRedirect } from '@/lib/demo';
import { sendStaffCode, startSignIn } from '@/lib/ops-auth';

describe('App Review sign-in', () => {
  it('sends exactly the review address to the sample-data copy, whatever its case or spacing', () => {
    expect(reviewRedirect('appreview@thebtxfoundation.org')).toBe(DEMO_URL);
    expect(reviewRedirect('  AppReview@TheBTXFoundation.org ')).toBe(DEMO_URL);
    expect(REVIEW_EMAIL).toBe('appreview@thebtxfoundation.org');
  });

  it('sends nothing else anywhere: lookalikes, other addresses, empty input', () => {
    for (const typed of [
      '',
      'kdavis@thebtxfoundation.org',
      'appreview@thebtxfoundation.org.evil.example',
      'xappreview@thebtxfoundation.org',
      'appreview+1@thebtxfoundation.org',
      'appreview@thebtxfoundation.org,evil@example.com',
      'appreview@thebtxfoundation.org\nevil@example.com',
      'appreview@thebtxfoundation.com',
      ' appreview @thebtxfoundation.org',
    ]) {
      expect(reviewRedirect(typed)).toBeNull();
    }
  });

  it('the destination is one fixed https address on our own domain', () => {
    const u = new URL(DEMO_URL);
    expect(u.protocol).toBe('https:');
    expect(u.host).toBe('demo-ops.thebtxfoundation.org');
    expect(u.search + u.hash).toBe('');
  });
});

describe('startSignIn: the order of the first sign-in step', () => {
  const okSend = () => vi.fn<typeof sendStaffCode>(async () => ({ ok: true }));

  it('the review address goes to the demo before anything is checked or sent: no code, no account', async () => {
    const send = okSend();
    expect(await startSignIn(' AppReview@TheBTXFoundation.org ', '/cb', send)).toEqual({ kind: 'demo', url: DEMO_URL });
    expect(send).not.toHaveBeenCalled();
  });

  it('any other address is checked, lower-cased and sent a code as before', async () => {
    const send = okSend();
    expect(await startSignIn('  Board@Example.ORG ', '/cb', send)).toEqual({ kind: 'sent', email: 'board@example.org' });
    expect(send).toHaveBeenCalledWith('board@example.org', '/cb');
    expect(await startSignIn('not an email', '/cb', send)).toEqual({ kind: 'invalid' });
    expect(await startSignIn('appreview@thebtxfoundation.org.evil.example', '/cb', send)).toEqual({ kind: 'sent', email: 'appreview@thebtxfoundation.org.evil.example' });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('passes the sender\'s refusal on', async () => {
    expect(await startSignIn('a@b.co', '/cb', async () => ({ ok: false, reason: 'rate-limited' }))).toEqual({ kind: 'error', reason: 'rate-limited' });
  });
});

describe('the banner', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });
  const banner = async (flag: string) => {
    vi.stubEnv('NEXT_PUBLIC_BTX_FORCE_MOCK', flag);
    vi.resetModules();
    return (await import('@/components/demo-banner')).DemoBanner();
  };

  it('shows the strip on the sample-data copy only', async () => {
    const on = (await banner('1')) as { props: { children: string; className: string } };
    expect(on.props.children).toBe(DEMO_BANNER_TEXT);
    expect(on.props.className).toBe('o-demo');
    expect(await banner('')).toBeNull();
  });
});

describe('the sample-data copy (BTX_FORCE_MOCK=1)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function configEnv(env: Record<string, string>): Promise<Record<string, string>> {
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    vi.resetModules();
    const mod = await import('../next.config');
    return (mod.default.env ?? {}) as Record<string, string>;
  }

  it('bakes in no database address or key, forces the offline sign-in and marks itself as the demo', async () => {
    const env = await configEnv({ VERCEL: '1', BTX_FORCE_MOCK: '1', NEXT_PUBLIC_SUPABASE_URL: 'https://real.example', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_real' });
    expect(env).toEqual({ NEXT_PUBLIC_BTX_FORCE_MOCK: '1', NEXT_PUBLIC_AUTH_MODE: 'mock', NEXT_PUBLIC_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '' });
  });

  it('the real Ops Hub on Vercel is unchanged: it still gets the BTX database address and key', async () => {
    const env = await configEnv({ VERCEL: '1', BTX_FORCE_MOCK: '' });
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toMatch(/^https:\/\/[a-z0-9]+\.supabase\.co$/);
    expect(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toMatch(/^sb_publishable_/);
    expect(env.NEXT_PUBLIC_BTX_FORCE_MOCK).toBeUndefined();
    expect(env.NEXT_PUBLIC_AUTH_MODE).toBeUndefined();
  });

  it('1, true and yes (any case, stray spaces) force it; anything else does not; a local run stays as it was', async () => {
    for (const v of ['1', 'true', 'TRUE', ' 1 ', 'yes']) expect(await configEnv({ VERCEL: '1', BTX_FORCE_MOCK: v })).toHaveProperty('NEXT_PUBLIC_BTX_FORCE_MOCK', '1');
    for (const v of ['0', 'false', 'maybe', '']) expect(await configEnv({ VERCEL: '1', BTX_FORCE_MOCK: v })).not.toHaveProperty('NEXT_PUBLIC_BTX_FORCE_MOCK');
    expect(await configEnv({ VERCEL: '', BTX_FORCE_MOCK: '' })).toEqual({});
  });

  it('every route is marked noindex in its headers, and the data layer refuses to build a client', async () => {
    vi.resetModules();
    const mod = await import('../next.config');
    const rules = await mod.default.headers!();
    expect(rules[0].headers).toContainEqual({ key: 'X-Robots-Tag', value: 'noindex, nofollow' });
    vi.stubEnv('NEXT_PUBLIC_BTX_FORCE_MOCK', '1');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real.example');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key-should-never-be-used');
    const { createServiceClient } = await import('@btx/data/server');
    expect(createServiceClient()).toBeNull();
  });

  it('even a key added to the demo project by mistake cannot switch the data layer on', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real.example');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_real');
    expect(hasSupabaseEnv()).toBe(true);
    vi.stubEnv('NEXT_PUBLIC_BTX_FORCE_MOCK', '1');
    expect(hasSupabaseEnv()).toBe(false);
  });
});
