import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

// The Apps Script file runs in Google, not Node. Its pure helpers are tested by evaluating the file in a bare context:
// nothing Google-specific runs at load time, so no stubs beyond an empty global are needed.
type Ev = { id: string; hash: string; title?: string };
type Existing = { key: number; id: string; hash: string };
type Plan = { create: Ev[]; update: { key: number; event: Ev }[]; delete: number[]; deferred: number; unchanged: number };
type Row = Existing & { startMs: number; endMs: number };

const source = readFileSync(path.resolve(__dirname, '../google/calendar-sync/Code.gs'), 'utf8');
const ctx = vm.createContext({ console });
vm.runInContext(source, ctx, { filename: 'Code.gs' });
const planSync = ctx.planSync as (existing: Existing[], desired: Ev[]) => Plan;
const pickExisting = ctx.pickExisting_ as (rows: Row[], desiredIds: Record<string, boolean>, a: number, b: number) => Existing[];
const nextDay = ctx.nextDay_ as (d: string) => string;
// JSON round trip: arrays made inside the vm context have another realm's prototype, which toEqual treats as different.
const plain = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

const ev = (id: string, hash = 'h1'): Ev => ({ id, hash });

describe('planSync', () => {
  it('creates new ids, updates changed hashes, deletes ids no longer in the feed, leaves the rest', () => {
    const plan = plain(planSync(
      [{ key: 0, id: 'a', hash: 'h1' }, { key: 1, id: 'b', hash: 'old' }, { key: 2, id: 'gone', hash: 'h1' }],
      [ev('a'), ev('b', 'new'), ev('c')],
    ));
    expect(plan).toEqual({ create: [ev('c')], update: [{ key: 1, event: ev('b', 'new') }], delete: [2], deferred: 0, unchanged: 1 });
  });

  it('keeps one copy of a duplicated id (the up-to-date one) and deletes the others', () => {
    const plan = plain(planSync(
      [{ key: 0, id: 'a', hash: 'stale' }, { key: 1, id: 'a', hash: 'h1' }, { key: 2, id: 'a', hash: 'h1' }, { key: 3, id: 'b', hash: 'x' }, { key: 4, id: 'b', hash: 'y' }],
      [ev('a'), ev('b', 'z')],
    ));
    expect(plan.delete).toEqual([0, 2, 4]);
    expect(plan.update).toEqual([{ key: 3, event: ev('b', 'z') }]);
    expect(plan.create).toEqual([]);
    expect(plan.unchanged).toBe(1);
  });

  it('refuses to wipe the calendar when the feed is empty', () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ key: i, id: `e${i}`, hash: 'h' }));
    expect(() => planSync(six, [])).toThrow('Refusing to delete every synced event');
    // Five or fewer may go (e.g. the last few items really were removed).
    expect(plain(planSync(six.slice(0, 5), [])).delete).toEqual([0, 1, 2, 3, 4]);
  });

  it('caps deletes at 40 and defers the rest', () => {
    const existing = Array.from({ length: 50 }, (_, i) => ({ key: i, id: `old${i}`, hash: 'h' }));
    const plan = plain(planSync(existing, [ev('keep')]));
    expect(plan.delete).toHaveLength(40);
    expect(plan.delete[0]).toBe(0);
    expect(plan.create).toEqual([ev('keep')]);
    expect(plan.deferred).toBe(10);
  });

  it('caps all writes at 150 per run: deletes, then updates, then creates', () => {
    const existing = [
      ...Array.from({ length: 45 }, (_, i) => ({ key: i, id: `old${i}`, hash: 'h' })),
      ...Array.from({ length: 100 }, (_, i) => ({ key: 100 + i, id: `u${i}`, hash: 'stale' })),
    ];
    const desired = [...Array.from({ length: 100 }, (_, i) => ev(`u${i}`)), ...Array.from({ length: 30 }, (_, i) => ev(`n${i}`))];
    const plan = plain(planSync(existing, desired));
    expect(plan.delete).toHaveLength(40);
    expect(plan.update).toHaveLength(100);
    expect(plan.create).toHaveLength(10);
    expect(plan.create[0].id).toBe('n0');
    // 5 deletes + 20 creates wait for the next run.
    expect(plan.deferred).toBe(25);
  });

  it('a repeated id in the feed is created once', () => {
    expect(plain(planSync([], [ev('a'), ev('a', 'h2')])).create).toEqual([ev('a')]);
  });
});

describe('pickExisting_', () => {
  const win = [1000, 2000] as const;
  const row = (key: number, id: string, startMs: number, endMs: number): Row => ({ key, id, hash: 'h', startMs, endMs });

  it('keeps tagged events the feed still lists (wherever they are) and any inside the window', () => {
    const rows = [row(0, 'listed-far', 0, 10), row(1, 'unlisted-inside', 1500, 1600), row(2, 'unlisted-before', 500, 1000), row(3, 'unlisted-after', 2000, 2100), row(4, 'unlisted-overlap', 900, 1100)];
    const kept = plain(pickExisting(rows, { 'listed-far': true }, win[0], win[1]));
    expect(kept.map((r) => r.id)).toEqual(['listed-far', 'unlisted-inside', 'unlisted-overlap']);
    expect(kept[0]).toEqual({ key: 0, id: 'listed-far', hash: 'h' });
  });
});

describe('nextDay_', () => {
  it('adds one calendar day', () => {
    expect(nextDay('2026-11-01')).toBe('2026-11-02');
    expect(nextDay('2026-12-31')).toBe('2027-01-01');
  });
});

describe('Code.gs', () => {
  it('never logs the identity token', () => {
    // The token is only ever passed to decodeTokenPayload_ and the Authorization header.
    expect(source).not.toMatch(/console\.log\([^)]*getIdentityToken/);
    expect(source).not.toMatch(/Logger\.log/);
  });
  it('uses the agreed constants', () => {
    expect(vm.runInContext('FEED_URL', ctx)).toBe('https://btx-ops-azure.vercel.app/api/calendar-sync');
    expect(vm.runInContext('[CALENDAR_ID, TAG_ID, TAG_HASH, MAX_DELETES, MAX_WRITES].join()', ctx)).toBe('info@thebtxfoundation.org,btxSyncId,btxSyncHash,40,150');
  });
});
