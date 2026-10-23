import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasSupabaseEnv } from '@btx/data';
import { DEMO_URL, REVIEW_EMAIL, reviewRedirect } from '@/lib/demo';

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

  it('only the exact value 1 forces it, and a local run stays as it was', async () => {
    expect(await configEnv({ VERCEL: '1', BTX_FORCE_MOCK: 'true' })).not.toHaveProperty('NEXT_PUBLIC_BTX_FORCE_MOCK');
    expect(await configEnv({ VERCEL: '', BTX_FORCE_MOCK: '' })).toEqual({});
  });

  it('even a key added to the demo project by mistake cannot switch the data layer on', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real.example');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_real');
    expect(hasSupabaseEnv()).toBe(true);
    vi.stubEnv('NEXT_PUBLIC_BTX_FORCE_MOCK', '1');
    expect(hasSupabaseEnv()).toBe(false);
  });
});
