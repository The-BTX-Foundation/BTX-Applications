// The Certifications loader (lib/cert-view-loader.ts): live mode ignores every ?demo flag and reads the real tables as
// the signed-in person; mock mode maps the flags to the demo's states.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ live: true, calls: [] as unknown[] }));
vi.mock('@btx/data', () => ({ hasSupabaseEnv: () => env.live }));
vi.mock('@/lib/cert-db', () => ({ certSessionReader: { rows: async () => [], all: async () => [] } }));
vi.mock('@/lib/cert-live', () => ({
  loadLiveCertView: async (_read: unknown, who: unknown) => (env.calls.push(who), { failed: false, live: true }),
}));

import { loadCertView } from '@/lib/cert-view-loader';

const who = { id: 'u1', role: 'board' };
beforeEach(() => {
  env.calls = [];
});

describe('loadCertView', () => {
  it('live mode ignores every ?demo flag', async () => {
    env.live = true;
    for (const demo of [undefined, 'stress', 'empty', 'error', 'chaterror', 'failsave', 'failed', 'loading']) {
      expect(await loadCertView({ demo, who })).toEqual({ failed: false, live: true });
    }
    expect(env.calls).toHaveLength(8);
    expect(env.calls.every((w) => w === who)).toBe(true);
  });
  it('mock mode maps the flags', async () => {
    env.live = false;
    expect(await loadCertView({ demo: 'failed', who })).toEqual({ failed: true });
    const err = await loadCertView({ demo: 'error', who });
    expect(!err.failed && err.loadFailed).toBe(true);
    const chat = await loadCertView({ demo: 'chaterror', who });
    expect(!chat.failed && chat.chat.failed && !chat.loadFailed).toBe(true);
    const empty = await loadCertView({ demo: 'empty', who });
    expect(!empty.failed && empty.steps.length).toBe(0);
    expect(env.calls).toHaveLength(0);
  });
});
