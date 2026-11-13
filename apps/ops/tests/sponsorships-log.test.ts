// The "Log a sponsorship" flow (lib/sponsorships-log.ts) against a stand-in database: an unresolved log is remembered
// through Cancel and Change (and fresh rows that show it), so the same line is never sent twice when the first one landed;
// once the saved row is shown, the next deliberate Log sends; refusals are said once; the confirm's gold button is armed
// only after 400 ms and a fresh key-up; the board's guard always resets `busy`.
import { describe, expect, it } from 'vitest';
import { ARM_MS, attemptKey, createLogger, guarded, isArmed, type LogDeps } from '@/lib/sponsorships-log';
import type { LogInput } from '@/lib/sponsorships-map';
import type { SponsorRow } from '@/lib/sponsorships-view';
import type { LogResult } from '@/lib/sponsorships-writes';

const P: LogInput = { title: 'NSBE', kind: 'conference', students: 3, cents: 60_000, when: 'Sat Dec 5', on: '2026-12-05' };

// A stored row for an id (as the database would hold it for P, with 3 students).
const row = (id: string, title = P.title): SponsorRow => ({ id, title, kind: 'conference', students: 3, cents: P.cents, when: 'Sat Dec 5', on: P.on, state: 'done' });

// A stand-in table of matching rows. `logs` scripts each rpc answer: 'ok' saves, 'lost' saves but the answer is lost,
// 'dropped' saves nothing and the answer is lost, or a refusal. `readFails` lists match calls (1-based) that fail.
// `onRead` / `onLog` run inside a read or the rpc (a refresh landing at that moment).
function db(logs: ('ok' | 'lost' | 'dropped' | 'no_category' | 'denied' | 'invalid')[], readFails: number[] = []) {
  const rows: string[] = ['old-1'];
  let n = 0;
  let reads = 0;
  const rpc: LogInput[] = [];
  const hooks: { onRead?: (n: number) => void; onLog?: () => void } = {};
  const deps: LogDeps = {
    wait: async () => {},
    checkWait: 0,
    match: async () => {
      reads += 1;
      hooks.onRead?.(reads);
      return readFails.includes(reads) ? null : rows.map((id) => row(id));
    },
    log: async (p: LogInput): Promise<LogResult> => {
      rpc.push(p);
      const a = logs.shift() ?? 'ok';
      if (a === 'ok' || a === 'lost') rows.push(`new-${++n}`);
      hooks.onLog?.();
      if (a === 'ok') return { ok: true, id: `new-${n}` };
      if (a === 'lost' || a === 'dropped') return { ok: false, reason: 'maybe' };
      return { ok: false, reason: a };
    },
  };
  return { deps, rpc, rows, hooks };
}

// Fresh server rows for P (what a refresh would bring).
const fresh = (ids: string[]) => ids.map((id) => row(id));
const earlier = (id: string) => ({ kind: 'logged', id, earlier: true, row: row(id) });

describe('logOnce', () => {
  it('logs once when the rpc answers', async () => {
    const t = db(['ok']);
    const lg = createLogger(t.deps);
    expect(await lg.logOnce(P)).toEqual({ kind: 'logged', id: 'new-1', earlier: false });
    expect(t.rpc).toHaveLength(1);
    expect(lg.isOpen(P)).toBe(false);
  });

  it('unknown, then Cancel, then the same line: the first landed, so the rpc is NOT called twice; then Log again sends exactly one', async () => {
    // Log 1: the answer is lost and the check read fails (match calls: 1 = before, 2 = check).
    const t = db(['lost', 'ok'], [2]);
    const lg = createLogger(t.deps);
    expect(await lg.logOnce(P)).toEqual({ kind: 'unknown' });
    expect(lg.isOpen(P)).toBe(true);
    expect(await lg.logOnce(P)).toEqual(earlier('new-1'));
    expect(t.rpc).toHaveLength(1);
    expect(lg.isOpen(P)).toBe(false);
    // "That one is already in the list. Press Log again to add another." -> Log again:
    expect(await lg.logOnce(P)).toEqual({ kind: 'logged', id: 'new-2', earlier: false });
    expect(t.rpc).toHaveLength(2);
  });

  it('the earlier row comes back with its stored values, not the edited input', async () => {
    const t = db(['lost'], [2]);
    const lg = createLogger(t.deps);
    await lg.logOnce(P);
    const out = await lg.logOnce({ ...P, students: 9, kind: 'travel', title: 'nsbe' });
    expect(out).toMatchObject({ kind: 'logged', earlier: true, row: { title: 'NSBE', students: 3, kind: 'conference' } });
  });

  it('retyping the title with other case or spacing cannot slip past the memory', async () => {
    const t = db(['lost'], [2]);
    const lg = createLogger(t.deps);
    await lg.logOnce(P);
    expect(attemptKey({ ...P, title: '  nsbe ' })).toBe(attemptKey(P));
    expect(await lg.logOnce({ ...P, title: '  nsbe ' })).toMatchObject({ kind: 'logged', id: 'new-1', earlier: true });
    expect(t.rpc).toHaveLength(1);
  });

  it('unknown, then the same line: the first did not land, so it is sent once more', async () => {
    const t = db(['dropped', 'ok'], [2]);
    const lg = createLogger(t.deps);
    expect(await lg.logOnce(P)).toEqual({ kind: 'unknown' });
    expect(await lg.logOnce(P)).toEqual({ kind: 'logged', id: 'new-1', earlier: false });
    expect(t.rpc).toHaveLength(2);
    expect(t.rows).toEqual(['old-1', 'new-1']);
  });

  it('"It didn\'t save", then a row lands late: Try again finds it and does not resend', async () => {
    const t = db(['dropped']);
    const lg = createLogger(t.deps);
    expect(await lg.logOnce(P)).toEqual({ kind: 'not_saved' });
    t.rows.push('late-1');
    expect(await lg.logOnce(P)).toEqual(earlier('late-1'));
    expect(t.rpc).toHaveLength(1);
  });

  it('a lost answer that saved is found by the check', async () => {
    const t = db(['lost']);
    const lg = createLogger(t.deps);
    expect(await lg.logOnce(P)).toEqual({ kind: 'logged', id: 'new-1', earlier: false });
    expect(t.rpc).toHaveLength(1);
  });

  it('a failed read before the log sends nothing', async () => {
    const t = db(['ok'], [1]);
    const lg = createLogger(t.deps);
    expect(await lg.logOnce(P)).toEqual({ kind: 'failed' });
    expect(t.rpc).toHaveLength(0);
  });

  it('definite refusals are said once, with no check and no open attempt', async () => {
    for (const r of ['no_category', 'denied', 'invalid'] as const) {
      const t = db([r]);
      const lg = createLogger(t.deps);
      let checked = false;
      expect(await lg.logOnce(P, () => (checked = true))).toEqual({ kind: 'refused', reason: r });
      expect(checked).toBe(false);
      expect(lg.isOpen(P)).toBe(false);
    }
  });

  it('a refusal after a settle reports the saved row, not the refusal', async () => {
    const t = db(['dropped', 'denied']);
    const lg = createLogger(t.deps);
    expect(await lg.logOnce(P)).toEqual({ kind: 'not_saved' });
    // Try again: during the rpc a refresh shows a row that came from the first attempt after all.
    t.hooks.onLog = () => lg.settleWith(fresh(['old-1', 'late-1']));
    expect(await lg.logOnce(P)).toEqual(earlier('late-1'));
  });
});

describe('settles that land mid-flight (fresh rows from elsewhere)', () => {
  it('during the check wait: the row is the answer, no resend', async () => {
    const t = db(['lost', 'ok']);
    const lg = createLogger({ ...t.deps, wait: async () => lg.settleWith(fresh(t.rows)) });
    expect(await lg.logOnce(P)).toEqual(earlier('new-1'));
    expect(t.rpc).toHaveLength(1);
    expect(lg.isOpen(P)).toBe(false);
  });

  it('during the after-read', async () => {
    const t = db(['lost']);
    const lg = createLogger(t.deps);
    t.hooks.onRead = (n) => n === 2 && lg.settleWith(fresh(t.rows));
    expect(await lg.logOnce(P)).toEqual(earlier('new-1'));
    expect(t.rpc).toHaveLength(1);
  });

  it('during the base read of a second try', async () => {
    const t = db(['lost'], [2]);
    const lg = createLogger(t.deps);
    expect(await lg.logOnce(P)).toEqual({ kind: 'unknown' });
    t.hooks.onRead = (n) => n === 3 && lg.settleWith(fresh(t.rows));
    expect(await lg.logOnce(P)).toEqual(earlier('new-1'));
    expect(t.rpc).toHaveLength(1);
  });

  it('during the rpc, which then answers "maybe": saved earlier, no resend', async () => {
    const t = db(['lost']);
    const lg = createLogger(t.deps);
    t.hooks.onLog = () => lg.settleWith(fresh(t.rows));
    expect(await lg.logOnce(P)).toEqual(earlier('new-1'));
    expect(t.rpc).toHaveLength(1);
  });

  it('during the rpc, which then answers ok: shown as logged, and a later identical log still sends', async () => {
    const t = db(['ok', 'ok']);
    const lg = createLogger(t.deps);
    t.hooks.onLog = () => lg.settleWith(fresh(t.rows));
    expect(await lg.logOnce(P)).toEqual({ kind: 'logged', id: 'new-1', earlier: false });
    t.hooks.onLog = undefined;
    expect(await lg.logOnce(P)).toEqual({ kind: 'logged', id: 'new-2', earlier: false });
  });

  it('Cancel, then the same line after a settle: no rpc; the next Log sends', async () => {
    const t = db(['lost', 'ok'], [2]);
    const lg = createLogger(t.deps);
    await lg.logOnce(P);
    lg.settleWith(fresh(['old-1', 'new-1']));
    expect(lg.isOpen(P)).toBe(true);
    expect(await lg.logOnce(P)).toEqual(earlier('new-1'));
    expect(t.rpc).toHaveLength(1);
    expect(await lg.logOnce(P)).toEqual({ kind: 'logged', id: 'new-2', earlier: false });
    expect(t.rpc).toHaveLength(2);
  });

  it('another line does not settle the attempt', async () => {
    const t = db(['lost'], [2]);
    const lg = createLogger(t.deps);
    await lg.logOnce(P);
    lg.settleWith([row('x', 'Other')]);
    expect(lg.isOpen(P)).toBe(true);
  });
});

describe('recheck', () => {
  it('Check again settles an unknown attempt', async () => {
    const t = db(['lost'], [2]);
    const lg = createLogger(t.deps);
    expect(await lg.logOnce(P)).toEqual({ kind: 'unknown' });
    expect(await lg.recheck(P)).toEqual({ kind: 'logged', id: 'new-1', earlier: false });
    expect(lg.isOpen(P)).toBe(false);
  });

  it('after a settle (first check offline): saved earlier, never "didn\'t save", nothing sent', async () => {
    const t = db(['lost'], [2]);
    const lg = createLogger(t.deps);
    expect(await lg.logOnce(P)).toEqual({ kind: 'unknown' });
    lg.settleWith(fresh(['old-1', 'new-1']));
    expect(await lg.recheck(P)).toEqual(earlier('new-1'));
    expect(t.rpc).toHaveLength(1);
  });

  it('a recheck whose read fails again stays "couldn\'t check", and the attempt is kept', async () => {
    const t = db(['lost'], [2, 3]);
    const lg = createLogger(t.deps);
    expect(await lg.logOnce(P)).toEqual({ kind: 'unknown' });
    expect(await lg.recheck(P)).toEqual({ kind: 'unknown' });
    expect(lg.isOpen(P)).toBe(true);
    expect(await lg.logOnce(P)).toEqual(earlier('new-1'));
    expect(t.rpc).toHaveLength(1);
  });

  it('with no memory of the line it never says "didn\'t save"', async () => {
    const lg = createLogger(db([]).deps);
    expect(await lg.recheck(P)).toEqual({ kind: 'unknown' });
  });
});

describe('the board guard (one log at a time; busy always resets)', () => {
  it('resets busy after a result, and refuses while busy', async () => {
    const busy = { current: false };
    expect(await guarded(busy, async () => ({ kind: 'not_saved' }))).toEqual({ kind: 'not_saved' });
    expect(busy.current).toBe(false);
    busy.current = true;
    let ran = false;
    expect(await guarded(busy, async () => ((ran = true), { kind: 'unknown' }))).toBeNull();
    expect(ran).toBe(false);
  });

  it('a rejected recheck is handled as "couldn\'t check" and busy resets', async () => {
    const busy = { current: false };
    expect(await guarded(busy, async () => Promise.reject(new Error('offline')))).toEqual({ kind: 'unknown' });
    expect(busy.current).toBe(false);
  });
});

describe('isArmed (double Enter cannot confirm money)', () => {
  it('needs both 400 ms and a fresh key-up', () => {
    expect(isArmed(1000, 1000 + ARM_MS - 1, true)).toBe(false);
    expect(isArmed(1000, 1000 + ARM_MS, false)).toBe(false);
    expect(isArmed(1000, 1000 + ARM_MS, true)).toBe(true);
  });
});
