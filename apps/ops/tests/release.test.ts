import { describe, expect, it, vi } from 'vitest';
import { releaseDecisionsWith, type ReleaseDeps } from '@/lib/release';

// A stand-in database: one cycle, whether it has a main award, and its release time.
function fake(opts: { role?: string | null; released?: string | null; main?: boolean; missing?: boolean; raceWinner?: string } = {}) {
  const state = { released: opts.released ?? null };
  const deps: ReleaseDeps = {
    role: vi.fn(async () => (opts.role === undefined ? 'admin' : opts.role)),
    releasedAt: vi.fn(async () => (opts.missing ? undefined : state.released)),
    hasMainAward: vi.fn(async () => opts.main ?? true),
    stamp: vi.fn(async (_id: string, at: string) => {
      if (opts.raceWinner) {
        state.released = opts.raceWinner;
        return null;
      }
      if (state.released) return null;
      state.released = at;
      return at;
    }),
  };
  return { deps, state };
}

const NOW = new Date('2026-10-23T14:00:00Z');

describe('releaseDecisionsWith', () => {
  it('stamps the release time when an admin releases a cycle with a main award', async () => {
    const { deps, state } = fake();
    const r = await releaseDecisionsWith(deps, 'c1', NOW);
    expect(r).toEqual({ ok: true, releasedAt: NOW.toISOString(), already: false });
    expect(state.released).toBe(NOW.toISOString());
    expect(deps.stamp).toHaveBeenCalledTimes(1);
  });

  it('refuses anyone who is not an admin, without reading or writing', async () => {
    for (const role of ['board', 'reviewer', 'applicant', null]) {
      const { deps } = fake({ role });
      const r = await releaseDecisionsWith(deps, 'c1', NOW);
      expect(r.ok).toBe(false);
      expect(deps.stamp).not.toHaveBeenCalled();
    }
  });

  it('refuses until the main award is recorded', async () => {
    const { deps, state } = fake({ main: false });
    const r = await releaseDecisionsWith(deps, 'c1', NOW);
    expect(r).toEqual({ ok: false, message: 'Record the main award before releasing decisions.' });
    expect(state.released).toBeNull();
    expect(deps.stamp).not.toHaveBeenCalled();
  });

  it('is idempotent: a second release keeps the first time and writes nothing', async () => {
    const first = '2026-10-20T12:00:00.000Z';
    const { deps, state } = fake({ released: first });
    const r = await releaseDecisionsWith(deps, 'c1', NOW);
    expect(r).toEqual({ ok: true, releasedAt: first, already: true });
    expect(state.released).toBe(first);
    expect(deps.stamp).not.toHaveBeenCalled();
  });

  it('releasing twice in a row stamps once', async () => {
    const { deps } = fake();
    const a = await releaseDecisionsWith(deps, 'c1', NOW);
    const b = await releaseDecisionsWith(deps, 'c1', new Date('2026-10-24T14:00:00Z'));
    expect(a.ok && b.ok).toBe(true);
    expect(b).toEqual({ ok: true, releasedAt: NOW.toISOString(), already: true });
    expect(deps.stamp).toHaveBeenCalledTimes(1);
  });

  it('answers with the other time when someone released between the read and the write', async () => {
    const { deps } = fake({ raceWinner: '2026-10-23T13:59:59.000Z' });
    const r = await releaseDecisionsWith(deps, 'c1', NOW);
    expect(r).toEqual({ ok: true, releasedAt: '2026-10-23T13:59:59.000Z', already: true });
  });

  it('says so when the cycle does not exist or no id is given', async () => {
    expect((await releaseDecisionsWith(fake({ missing: true }).deps, 'c1', NOW)).ok).toBe(false);
    expect(await releaseDecisionsWith(fake().deps, '', NOW)).toEqual({ ok: false, message: 'No cycle to release.' });
  });
});
