import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

// The Apps Script file runs in Google, not Node. Its pure helpers are tested by evaluating the file in a bare context:
// nothing Google-specific runs at load time, so no stubs beyond an empty global are needed.
type Ev = { id: string; hash: string; title: string; description: string; location: string; allDay: boolean; start: string; end: string };
type Live = { key: number; id: string; hash: string; summary: string; description: string; location: string; allDay: boolean; recurring?: boolean; start: string; end: string };
type Plan = { create: Ev[]; update: { key: number; event: Ev }[]; replace: { key: number; event: Ev }[]; delete: number[]; deferred: number; unchanged: number };
type Row = Live & { startMs: number; endMs: number };
type Api = { remove: (key: number) => void; update: (key: number, e: Ev) => void; insert: (e: Ev) => void };
type Result = { created: number; updated: number; deleted: number; replaced: number; skipped: number; failed: number; deferred: number; stoppedEarly: boolean };

const source = readFileSync(path.resolve(__dirname, '../google/calendar-sync/Code.gs'), 'utf8');
// Log lines are captured so tests can check that nothing but counts and fixed text is logged.
const logs: string[] = [];
const ctx = vm.createContext({ console: { log: (m: string) => logs.push(String(m)) } });
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
    expect(plan).toEqual({ create: [ev('c')], update: [{ key: 1, event: b }], replace: [], delete: [2], deferred: 0, unchanged: 1 });
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
  const plan = (): Plan => ({ delete: [7, 8], replace: [], update: [{ key: 3, event: ev('u') }], create: [ev('c1'), ev('c2')], deferred: 4, unchanged: 0 });
  // An API error shaped like the Advanced service's (details.code, details.errors[].reason).
  const apiError = (code?: number, reason?: string) => Object.assign(new Error('secret event text'), code ? { details: { code, errors: reason ? [{ reason }] : [] } } : {});
  const fakeApi = (fail: Record<string, Error> = {}) => {
    const calls: string[] = [];
    const maybe = (name: string) => { calls.push(name); if (fail[name]) throw fail[name]; };
    const api: Api = {
      remove: (k) => maybe(`remove ${k}`),
      update: (k, e) => maybe(`update ${k} ${e.id}`),
      insert: (e) => maybe(`insert ${e.id}`),
    };
    return { api, calls };
  };

  it('deletes, then updates, then creates, one call each', () => {
    const { api, calls } = fakeApi();
    expect(plain(applyPlan(plan(), api, 0, () => 0))).toEqual({ created: 2, updated: 1, deleted: 2, replaced: 0, skipped: 0, failed: 0, deferred: 4, stoppedEarly: false });
    expect(calls).toEqual(['remove 7', 'remove 8', 'update 3 u', 'insert c1', 'insert c2']);
  });

  it('stops on an unknown or server failure and defers the rest, logging only the kind and status', () => {
    for (const err of [new Error('secret event text'), apiError(500), apiError(503)]) {
      const { api, calls } = fakeApi({ 'update 3 u': err });
      expect(plain(applyPlan(plan(), api, 0, () => 0))).toEqual({ created: 0, updated: 0, deleted: 2, replaced: 0, skipped: 0, failed: 1, deferred: 4 + 3, stoppedEarly: true });
      expect(calls).toEqual(['remove 7', 'remove 8', 'update 3 u']);
    }
    expect(logs.at(-1)).toBe('Write failed: update (HTTP 503)');
    expect(logs.join('\n')).not.toContain('secret');
  });

  it('stops on a rate limit (429, or 403 with a rate-limit reason)', () => {
    for (const err of [apiError(429), apiError(403, 'rateLimitExceeded'), apiError(403, 'userRateLimitExceeded')]) {
      const { api, calls } = fakeApi({ 'remove 8': err });
      expect(plain(applyPlan(plan(), api, 0, () => 0))).toMatchObject({ deleted: 1, failed: 1, skipped: 0, deferred: 4 + 4, stoppedEarly: true });
      expect(calls).toEqual(['remove 7', 'remove 8']);
    }
  });

  it('skips a permanent 4xx failure and carries on', () => {
    for (const err of [apiError(400), apiError(404), apiError(403, 'forbidden'), apiError(410)]) {
      const { api, calls } = fakeApi({ 'update 3 u': err });
      expect(plain(applyPlan(plan(), api, 0, () => 0))).toEqual({ created: 2, updated: 0, deleted: 2, replaced: 0, skipped: 1, failed: 1, deferred: 4, stoppedEarly: false });
      expect(calls).toEqual(['remove 7', 'remove 8', 'update 3 u', 'insert c1', 'insert c2']);
    }
    expect(logs.at(-1)).toBe('Write failed: update (HTTP 410)');
  });

  it('stops after 3 failed writes', () => {
    const { api, calls } = fakeApi({ 'remove 7': apiError(404), 'remove 8': apiError(404), 'update 3 u': apiError(400) });
    expect(plain(applyPlan(plan(), api, 0, () => 0))).toEqual({ created: 0, updated: 0, deleted: 0, replaced: 0, skipped: 3, failed: 3, deferred: 4 + 2, stoppedEarly: true });
    expect(calls).toEqual(['remove 7', 'remove 8', 'update 3 u']);
  });

  it('replaces a series as delete then insert, counted once as replaced', () => {
    const { api, calls } = fakeApi();
    const p: Plan = { delete: [], replace: [{ key: 5, event: ev('r') }], update: [], create: [], deferred: 0, unchanged: 0 };
    expect(plain(applyPlan(p, api, 0, () => 0))).toMatchObject({ replaced: 1, deleted: 0, created: 0 });
    expect(calls).toEqual(['remove 5', 'insert r']);
  });

  it('starts no new write after 270 seconds', () => {
    const { api, calls } = fakeApi();
    // The clock reads 0, 100 s, 271 s: two writes happen, the third is not started.
    const now = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(100_000).mockReturnValue(271_000);
    expect(plain(applyPlan(plan(), api, 0, now))).toEqual({ created: 0, updated: 0, deleted: 2, replaced: 0, skipped: 0, failed: 0, deferred: 4 + 3, stoppedEarly: true });
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

describe('whole seconds', () => {
  it('a timed copy that differs only in milliseconds is the same event', () => {
    const t = ev('w', { allDay: false, start: '2026-11-10T10:00:00Z', end: '2026-11-10T10:30:00Z' });
    expect(sameEvent(live(0, t, { start: '2026-11-10T10:00:00.500Z', end: '2026-11-10T10:30:00.999Z' }), t)).toBe(true);
    expect(sameEvent(live(0, t, { start: '2026-11-10T10:00:01Z' }), t)).toBe(false);
  });
});

describe('repeating series', () => {
  it('a synced event turned into a series never matches and is replaced, not updated', () => {
    const a = ev('a');
    expect(sameEvent(live(0, a, { recurring: true }), a)).toBe(false);
    const plan = plain(planSync([live(0, a, { recurring: true })], [a]));
    expect(plan.replace).toEqual([{ key: 0, event: a }]);
    expect(plan.update).toEqual([]);
    expect(plan.delete).toEqual([]);
  });

  it('with a single copy and a series of the same id, the single copy is kept and the series deleted', () => {
    const a = ev('a', { title: 'new' });
    const plan = plain(planSync([live(0, a, { recurring: true }), live(1, a, { summary: 'old' })], [a]));
    expect(plan.update).toEqual([{ key: 1, event: a }]);
    expect(plan.delete).toEqual([0]);
    expect(plan.replace).toEqual([]);
  });

  it('replacements do not trip the proportional delete guard, and count as two writes', () => {
    const many = Array.from({ length: 20 }, (_, i) => ev(`s${i}`));
    const plan = plain(planSync(many.map((e, i) => live(i, e, { recurring: true })), many));
    expect(plan.replace).toHaveLength(20);
    expect(plan.delete).toEqual([]);
    const lots = Array.from({ length: 60 }, (_, i) => ev(`s${i}`));
    const capped = plain(planSync(lots.map((e, i) => live(i, e, { recurring: true })), lots));
    expect(capped.replace).toHaveLength(50);
    expect(capped.deferred).toBe(20);
  });
});

// A fake Google: the script's globals (Calendar, LockService, UrlFetchApp, ScriptApp, Utilities) over an in-memory
// calendar, so runSync_, syncNowAllowDeletes and deleteSyncedEvents run end to end.
type Item = { id: string; summary?: string; description?: string; location?: string; start: { date?: string; dateTime?: string }; end: { date?: string; dateTime?: string }; recurrence?: string[]; recurringEventId?: string; extendedProperties?: { private?: Record<string, string> } };
function world(opts: { feed: Ev[]; items?: Item[]; lockBusy?: boolean; failInsert?: Error; listIgnoresFilter?: boolean; clockStep?: number }) {
  const out: string[] = [];
  const store: Item[] = [...(opts.items ?? [])];
  let n = 0;
  let clock = 0;
  const calls: string[] = [];
  const g = vm.createContext({
    console: { log: (m: string) => out.push(String(m)) },
    LockService: { getScriptLock: () => ({ tryLock: () => !opts.lockBusy, releaseLock: () => calls.push('release') }) },
    ScriptApp: { getIdentityToken: () => 'header.payload.sig' },
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify({ version: 1, windowStart: '2026-09-22', windowEnd: '2027-11-26', events: opts.feed }) }) },
    Utilities: { parseDate: (d: string) => new Date(`${d}T05:00:00Z`) },
    Calendar: {
      Events: {
        list: (_cal: string, p: { privateExtendedProperty: string; singleEvents: boolean }) => {
          calls.push(`list singleEvents=${p.singleEvents}`);
          const items = opts.listIgnoresFilter ? store : store.filter((i) => i.extendedProperties?.private?.btxSync === '1');
          return { items: items.map((i) => JSON.parse(JSON.stringify(i))) };
        },
        remove: (_cal: string, id: string) => {
          calls.push(`remove ${id}`);
          store.splice(store.findIndex((i) => i.id === id), 1);
        },
        insert: (res: Item) => {
          calls.push(`insert ${res.extendedProperties?.private?.btxSyncId}`);
          if (opts.failInsert) throw opts.failInsert;
          store.push({ ...res, id: `g${++n}` });
        },
        update: (res: Item, _cal: string, id: string) => {
          calls.push(`update ${id}`);
          store[store.findIndex((i) => i.id === id)] = { ...res, id };
        },
      },
    },
  });
  vm.runInContext(source, g, { filename: 'Code.gs' });
  // The script's clock: each read moves it forward by clockStep milliseconds.
  vm.runInContext('Date.now = function () { return __tick(); };', Object.assign(g, { __tick: () => (clock += opts.clockStep ?? 0) }));
  return { g, out, store, calls, run: (fn: string) => vm.runInContext(`${fn}()`, g) };
}
const marked = (id: string, syncId: string, over: Partial<Item> = {}): Item => ({ id, summary: `T ${syncId}`, description: 'D', location: '', start: { date: '2026-11-02' }, end: { date: '2026-11-03' }, extendedProperties: { private: { btxSync: '1', btxSyncId: syncId, btxSyncHash: 'h1' } }, ...over });

describe('runSync_ end to end (fake Google)', () => {
  it('creates marked events in one insert, lists with singleEvents false, and logs counts only', () => {
    const w = world({ feed: [ev('a'), ev('b')] });
    w.run('syncNow');
    expect(w.store.map((i) => i.extendedProperties?.private)).toEqual([
      { btxSync: '1', btxSyncId: 'a', btxSyncHash: 'h1' },
      { btxSync: '1', btxSyncId: 'b', btxSyncHash: 'h1' },
    ]);
    expect(w.calls[0]).toBe('list singleEvents=false');
    expect(w.out.at(-1)).toMatch(/^created 2, updated 0, replaced 0, deleted 0, /);
    expect(w.out.join('\n')).not.toContain('T a');
  });

  it('replaces a series, and ignores changed occurrences (recurringEventId)', () => {
    const w = world({
      feed: [ev('a')],
      items: [marked('s1', 'a', { recurrence: ['RRULE:FREQ=WEEKLY'] }), marked('s1_20261109', 'a', { recurringEventId: 's1', summary: 'moved one' })],
    });
    w.run('syncNow');
    expect(w.calls.filter((c) => !c.startsWith('list') && c !== 'release')).toEqual(['remove s1', 'insert a']);
    expect(w.out.at(-1)).toMatch(/replaced 1, deleted 0/);
  });

  it('throws after logging when a write failed, with fixed text and counts', () => {
    const err = Object.assign(new Error('secret'), { details: { code: 503 } });
    const w = world({ feed: [ev('a'), ev('b')], failInsert: err });
    expect(() => w.run('syncNow')).toThrow(/^A calendar write failed; 2 left for next run$/);
    expect(w.out).toContain('Write failed: create (HTTP 503)');
    expect(w.out.some((l) => l.startsWith('created 0, ') && l.includes('failed 1'))).toBe(true);
    expect(w.calls).toContain('release');
  });

  it('a skipped 4xx write still makes the run fail at the end', () => {
    const err = Object.assign(new Error('secret'), { details: { code: 400 } });
    const w = world({ feed: [ev('a')], failInsert: err });
    expect(() => w.run('syncNow')).toThrow('A calendar write failed; 0 left for next run');
  });

  it('syncNowAllowDeletes keeps passing until nothing is left to delete', () => {
    const items = Array.from({ length: 90 }, (_, i) => marked(`g-old${i}`, `old${i}`));
    const w = world({ feed: [ev('keep')], items: [...items, marked('g-keep', 'keep')] });
    // The normal sync refuses: 90 of 91 is a mass delete.
    expect(() => w.run('syncNow')).toThrow(/Refusing to delete 90 of 91/);
    w.run('syncNowAllowDeletes');
    expect(w.store.map((i) => i.id)).toEqual(['g-keep']);
    expect(w.calls.filter((c) => c.startsWith('list')).length).toBe(1 + 4);
    expect(w.out.at(-1)).toMatch(/deleted 90/);
  });

  it('syncNowAllowDeletes says to run again when time runs out', () => {
    const items = Array.from({ length: 90 }, (_, i) => marked(`g-old${i}`, `old${i}`));
    // Each clock read moves 5 s: the 270 s budget ends partway through the second pass.
    const w = world({ feed: [ev('keep')], items: [...items, marked('g-keep', 'keep')], clockStep: 5000 });
    w.run('syncNowAllowDeletes');
    expect(w.store.length).toBeGreaterThan(1);
    expect(w.out).toContain('Deletes are still left: run syncNowAllowDeletes again.');
  });

  it('does nothing when another run holds the lock', () => {
    const w = world({ feed: [ev('a')], lockBusy: true });
    w.run('syncNow');
    expect(w.store).toEqual([]);
    expect(w.out).toEqual(['Another sync is running; skipped this one.']);
  });
});

describe('deleteSyncedEvents (fake Google)', () => {
  it('deletes only marked events, even when the list wrongly returns an unmarked one', () => {
    const handMade: Item = { id: 'hand', summary: 'Lunch', start: { date: '2026-11-02' }, end: { date: '2026-11-03' } };
    const w = world({ feed: [], items: [marked('g1', 'a'), handMade, marked('g2', 'b')], listIgnoresFilter: true });
    w.run('deleteSyncedEvents');
    expect(w.store.map((i) => i.id)).toEqual(['hand']);
    expect(w.out.at(-1)).toBe('Deleted 2 synced event(s). Hand-made events were not touched. Skipped 1 listed event(s) without the sync marker.');
    expect(w.calls).toContain('release');
  });

  it('takes the sync lock and stops when it is busy', () => {
    const w = world({ feed: [], items: [marked('g1', 'a')], lockBusy: true });
    w.run('deleteSyncedEvents');
    expect(w.store).toHaveLength(1);
    expect(w.out).toEqual(['A sync is running; nothing was deleted. Try again in a minute.']);
  });
});
