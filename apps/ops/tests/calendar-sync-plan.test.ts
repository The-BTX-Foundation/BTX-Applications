import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

// The Apps Script file runs in Google, not Node. Its pure helpers are tested by evaluating the file in a bare context:
// nothing Google-specific runs at load time, so no stubs beyond an empty global are needed.
type Ev = { id: string; hash: string; title: string; description: string; location: string; allDay: boolean; start: string; end: string };
type Live = { key: number; id: string; hash: string; summary: string; description: string; location: string; allDay: boolean; start: string; end: string };
type Plan = { create: Ev[]; update: { key: number; event: Ev }[]; delete: number[]; deferred: number; unchanged: number };
type Row = Live & { startMs: number; endMs: number };
type Api = { remove: (key: number) => void; update: (key: number, e: Ev) => void; insert: (e: Ev) => void };
type Result = { created: number; updated: number; deleted: number; deferred: number; stoppedEarly: boolean };

const source = readFileSync(path.resolve(__dirname, '../google/calendar-sync/Code.gs'), 'utf8');
const ctx = vm.createContext({ console });
vm.runInContext(source, ctx, { filename: 'Code.gs' });
const planSync = ctx.planSync as (existing: Live[], desired: Ev[], opts?: { allowMassDelete?: boolean }) => Plan;
const sameEvent = ctx.sameEvent_ as (live: Live, desired: Ev) => boolean;
const pickExisting = ctx.pickExisting_ as (rows: Row[], desiredIds: Record<string, boolean>, a: number, b: number) => Row[];
const applyPlan = ctx.applyPlan_ as (plan: Plan, api: Api, startedAt: number, now: () => number) => Result;
const toResource = ctx.toResource_ as (e: Ev) => Record<string, unknown>;
// JSON round trip: objects made inside the vm context have another realm's prototype, which toEqual treats as different.
const plain = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

// A feed event (all-day by default) and the live calendar copy that shows exactly the same thing.
const ev = (id: string, over: Partial<Ev> = {}): Ev => ({ id, hash: 'h1', title: `T ${id}`, description: 'D', location: '', allDay: true, start: '2026-11-02', end: '2026-11-03', ...over });
const live = (key: number, e: Ev, over: Partial<Live> = {}): Live => ({ key, id: e.id, hash: e.hash, summary: e.title, description: e.description, location: e.location, allDay: e.allDay, start: e.start, end: e.end, ...over });
const timed = ev('t', { allDay: false, start: '2026-11-10T15:00:00.000Z', end: '2026-11-10T15:30:00.000Z' });

describe('sameEvent_', () => {
  it('matches an untouched copy, and a timed copy that writes the same instant another way', () => {
    expect(sameEvent(live(0, ev('a')), ev('a'))).toBe(true);
    expect(sameEvent(live(0, timed, { start: '2026-11-10T10:00:00-05:00', end: '2026-11-10T10:30:00-05:00' }), timed)).toBe(true);
    // Windows line endings and trailing spaces from Google are not an edit.
    expect(sameEvent(live(0, ev('a', { description: 'L1\nL2' }), { description: 'L1\r\nL2  ' }), ev('a', { description: 'L1\nL2' }))).toBe(true);
    // A missing location in Google equals an empty one in the feed.
    expect(sameEvent(live(0, ev('a'), { location: undefined as unknown as string }), ev('a'))).toBe(true);
  });

  it('spots each kind of edit made in Google', () => {
    const a = ev('a');
    expect(sameEvent(live(0, a, { summary: 'Renamed' }), a)).toBe(false);
    expect(sameEvent(live(0, a, { description: 'Changed' }), a)).toBe(false);
    expect(sameEvent(live(0, a, { location: 'Room 9' }), a)).toBe(false);
    expect(sameEvent(live(0, a, { start: '2026-11-03', end: '2026-11-04' }), a)).toBe(false);
    expect(sameEvent(live(0, a, { end: '2026-11-04' }), a)).toBe(false);
    expect(sameEvent(live(0, a, { allDay: false, start: '2026-11-02T05:00:00Z', end: '2026-11-03T05:00:00Z' }), a)).toBe(false);
    expect(sameEvent(live(0, timed, { start: '2026-11-10T15:15:00.000Z' }), timed)).toBe(false);
    expect(sameEvent(live(0, timed, { end: '2026-11-10T11:00:00-05:00' }), timed)).toBe(false);
  });

  it('ignores the stored hash: a stale hash on a correct copy is not a change', () => {
    expect(sameEvent(live(0, ev('a'), { hash: 'stale' }), ev('a'))).toBe(true);
  });
});

describe('planSync', () => {
  it('creates new ids, updates drifted copies, deletes ids no longer in the feed, leaves the rest', () => {
    const a = ev('a');
    const b = ev('b', { title: 'New title' });
    const plan = plain(planSync([live(0, a), live(1, b, { summary: 'Old title' }), live(2, ev('gone'))], [a, b, ev('c')]));
    expect(plan).toEqual({ create: [ev('c')], update: [{ key: 1, event: b }], delete: [2], deferred: 0, unchanged: 1 });
  });

  it('puts back an event moved in Google', () => {
    const plan = plain(planSync([live(0, timed, { start: '2026-11-11T15:00:00Z', end: '2026-11-11T15:30:00Z' })], [timed]));
    expect(plan.update).toEqual([{ key: 0, event: timed }]);
  });

  it('keeps one copy of a duplicated id (a matching one) and deletes the others', () => {
    const a = ev('a');
    const b = ev('b', { title: 'B now' });
    const plan = plain(planSync([live(0, a, { summary: 'x' }), live(1, a), live(2, a), live(3, b, { summary: 'x' }), live(4, b, { summary: 'y' })], [a, b]));
    expect(plan.delete).toEqual([0, 2, 4]);
    expect(plan.update).toEqual([{ key: 3, event: b }]);
    expect(plan.create).toEqual([]);
    expect(plan.unchanged).toBe(1);
  });

  it('refuses to wipe the calendar when the feed is empty, even with mass deletes allowed', () => {
    const six = Array.from({ length: 6 }, (_, i) => live(i, ev(`e${i}`)));
    expect(() => planSync(six, [])).toThrow('Refusing to delete every synced event');
    expect(() => planSync(six, [], { allowMassDelete: true })).toThrow('Refusing to delete every synced event');
    expect(plain(planSync(six.slice(0, 5), [])).delete).toEqual([0, 1, 2, 3, 4]);
  });

  it('refuses more than 10 deletes that are also more than half the events, unless allowed', () => {
    const keep = Array.from({ length: 9 }, (_, i) => ev(`k${i}`));
    const gone = Array.from({ length: 11 }, (_, i) => ev(`g${i}`));
    const existing = [...keep, ...gone].map((e, i) => live(i, e));
    // 11 of 20 is more than half.
    expect(() => planSync(existing, keep)).toThrow(/Refusing to delete 11 of 20 synced events/);
    expect(plain(planSync(existing, keep, { allowMassDelete: true })).delete).toHaveLength(11);
    // 11 of 22 is exactly half: allowed. 10 of 15 is more than half but not more than 10: allowed.
    const more = [...existing, live(20, ev('k9')), live(21, ev('k10'))];
    expect(plain(planSync(more, [...keep, ev('k9'), ev('k10')])).delete).toHaveLength(11);
    const ten = [...keep.slice(0, 5), ...gone.slice(0, 10)];
    expect(plain(planSync(ten.map((e, i) => live(i, e)), keep.slice(0, 5))).delete).toHaveLength(10);
  });

  it('caps deletes at 40 and defers the rest', () => {
    const existing = Array.from({ length: 50 }, (_, i) => live(i, ev(`old${i}`)));
    const plan = plain(planSync(existing, [ev('keep')], { allowMassDelete: true }));
    expect(plan.delete).toHaveLength(40);
    expect(plan.delete[0]).toBe(0);
    expect(plan.create).toEqual([ev('keep')]);
    expect(plan.deferred).toBe(10);
  });

  it('caps all writes at 100 per run: deletes, then updates, then creates', () => {
    const stale = Array.from({ length: 50 }, (_, i) => ev(`u${i}`));
    const existing = [...Array.from({ length: 45 }, (_, i) => live(i, ev(`old${i}`))), ...stale.map((e, i) => live(100 + i, e, { summary: 'drifted' }))];
    const desired = [...stale, ...Array.from({ length: 30 }, (_, i) => ev(`n${i}`))];
    const plan = plain(planSync(existing, desired, { allowMassDelete: true }));
    expect(plan.delete).toHaveLength(40);
    expect(plan.update).toHaveLength(50);
    expect(plan.create).toHaveLength(10);
    expect(plan.create[0].id).toBe('n0');
    // 5 deletes + 20 creates wait for the next run.
    expect(plan.deferred).toBe(25);
  });

  it('a repeated id in the feed is created once', () => {
    expect(plain(planSync([], [ev('a'), ev('a', { hash: 'h2' })])).create).toEqual([ev('a')]);
  });
});

describe('applyPlan_', () => {
  const plan = (): Plan => ({ delete: [7, 8], update: [{ key: 3, event: ev('u') }], create: [ev('c1'), ev('c2')], deferred: 4, unchanged: 0 });
  const fakeApi = (failOn?: string) => {
    const calls: string[] = [];
    const api: Api = {
      remove: (k) => { calls.push(`remove ${k}`); if (failOn === `remove ${k}`) throw new Error('boom'); },
      update: (k, e) => { calls.push(`update ${k} ${e.id}`); if (failOn === `update ${k}`) throw new Error('boom'); },
      insert: (e) => { calls.push(`insert ${e.id}`); if (failOn === `insert ${e.id}`) throw new Error('boom'); },
    };
    return { api, calls };
  };

  it('deletes, then updates, then creates, one call each', () => {
    const { api, calls } = fakeApi();
    expect(plain(applyPlan(plan(), api, 0, () => 0))).toEqual({ created: 2, updated: 1, deleted: 2, deferred: 4, stoppedEarly: false });
    expect(calls).toEqual(['remove 7', 'remove 8', 'update 3 u', 'insert c1', 'insert c2']);
  });

  it('stops at the first failed write and defers the rest', () => {
    const { api, calls } = fakeApi('update 3');
    expect(plain(applyPlan(plan(), api, 0, () => 0))).toEqual({ created: 0, updated: 0, deleted: 2, deferred: 4 + 3, stoppedEarly: true });
    expect(calls).toEqual(['remove 7', 'remove 8', 'update 3 u']);
  });

  it('starts no new write after 270 seconds', () => {
    const { api, calls } = fakeApi();
    // The clock reads 0, 100 s, 271 s: two writes happen, the third is not started.
    const now = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(100_000).mockReturnValue(271_000);
    expect(plain(applyPlan(plan(), api, 0, now))).toEqual({ created: 0, updated: 0, deleted: 2, deferred: 4 + 3, stoppedEarly: true });
    expect(calls).toEqual(['remove 7', 'remove 8']);
  });
});

describe('toResource_', () => {
  it('writes the private marker in the same resource as the event', () => {
    expect(plain(toResource(ev('post:p1', { hash: 'abc' })))).toEqual({
      summary: 'T post:p1', description: 'D', location: '', start: { date: '2026-11-02' }, end: { date: '2026-11-03' },
      extendedProperties: { private: { btxSync: '1', btxSyncId: 'post:p1', btxSyncHash: 'abc' } },
    });
    expect(plain(toResource(timed))).toMatchObject({
      start: { dateTime: '2026-11-10T15:00:00.000Z', timeZone: 'America/New_York' },
      end: { dateTime: '2026-11-10T15:30:00.000Z', timeZone: 'America/New_York' },
    });
  });
});

describe('pickExisting_', () => {
  const row = (key: number, id: string, startMs: number, endMs: number): Row => ({ ...live(key, ev(id)), startMs, endMs });

  it('keeps synced events the feed still lists (wherever they are) and any inside the window', () => {
    const rows = [row(0, 'listed-far', 0, 10), row(1, 'unlisted-inside', 1500, 1600), row(2, 'unlisted-before', 500, 1000), row(3, 'unlisted-after', 2000, 2100), row(4, 'unlisted-overlap', 900, 1100)];
    const kept = plain(pickExisting(rows, { 'listed-far': true }, 1000, 2000));
    expect(kept.map((r) => r.id)).toEqual(['listed-far', 'unlisted-inside', 'unlisted-overlap']);
  });
});

describe('Code.gs', () => {
  it('never logs the identity token and uses only the Calendar API for events', () => {
    expect(source).not.toMatch(/console\.log\([^)]*getIdentityToken/);
    expect(source).not.toMatch(/Logger\.log/);
    expect(source).not.toMatch(/CalendarApp|setTag|getTag/);
  });
  it('uses the agreed constants', () => {
    expect(vm.runInContext('FEED_URL', ctx)).toBe('https://btx-ops-azure.vercel.app/api/calendar-sync');
    expect(vm.runInContext('[CALENDAR_ID, TAG, TAG_ID, TAG_HASH, MAX_DELETES, MAX_WRITES, TIME_BUDGET_MS].join()', ctx)).toBe('info@thebtxfoundation.org,btxSync,btxSyncId,btxSyncHash,40,100,270000');
  });
  it('turns on the Advanced Calendar service without adding scopes', () => {
    const manifest = JSON.parse(readFileSync(path.resolve(__dirname, '../google/calendar-sync/appsscript.json'), 'utf8'));
    expect(manifest.dependencies.enabledAdvancedServices).toEqual([{ userSymbol: 'Calendar', serviceId: 'calendar', version: 'v3' }]);
    expect(manifest.oauthScopes).toEqual([
      'openid',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/script.external_request',
      'https://www.googleapis.com/auth/script.scriptapp',
    ]);
  });
});
