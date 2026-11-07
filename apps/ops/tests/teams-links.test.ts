import { describe, expect, it, vi } from 'vitest';
import type { Db } from '@/lib/pairing-db';
import { GRAPH_MEETINGS, meetingSubject } from '@/lib/teams/graph';
import { makeTeamsLinks, teamsLinksLine } from '@/lib/teams/links';
import type { TokenResult } from '@/lib/teams/token';

const NOW = new Date('2026-11-06T12:00:00Z');
const FUTURE = '2026-11-12T23:00:00Z';
const PAST = '2026-11-01T23:00:00Z';
const end = (s: string) => new Date(Date.parse(s) + 30 * 60_000).toISOString();

type Slot = { id: string; startsAt: string; code: string; name: string; pair: boolean; url: string | null };

// A small stand-in for the Supabase client: just the calls makeTeamsLinks makes (role, cycle, bookings, pairings,
// applications, and the video_url update), backed by an in-memory list. `updateFails` makes the save fail for a slot.
function fakeDb(role: string, slots: Slot[], opts: { updateFails?: string[] } = {}) {
  const updates: { slotId: string; url: string }[] = [];
  const pairs = new Map(slots.filter((s) => s.pair).map((s) => [s.id, { url: s.url }]));
  const from = (table: string) => {
    let op: 'select' | 'update' = 'select';
    let payload: Record<string, unknown> = {};
    const eqs: Record<string, unknown> = {};
    const result = () => {
      if (table === 'cycles') return { data: { id: 'c1', interview_start: '2026-10-15', interview_end: '2026-12-01' }, error: null };
      if (table === 'bookings') return { data: slots.map((s) => ({ slot_id: s.id, application_id: `app-${s.id}`, interview_slots: { starts_at: s.startsAt, ends_at: end(s.startsAt), cycle_id: 'c1' } })), error: null };
      if (table === 'applications') return { data: slots.map((s) => ({ id: `app-${s.id}`, applicant_code: s.code, full_name: s.name })), error: null };
      if (table === 'interview_pairings' && op === 'select') return { data: [...pairs].map(([id, p]) => ({ slot_id: id, interviewer_a: 'u1', interviewer_b: 'u2', video_url: p.url })), error: null };
      if (table === 'interview_pairings' && op === 'update') {
        const id = String(eqs.slot_id);
        if (opts.updateFails?.includes(id)) return { data: null, error: { message: 'nope' } };
        if (!pairs.has(id)) return { data: [], error: null };
        pairs.set(id, { url: String(payload.video_url) });
        updates.push({ slotId: id, url: String(payload.video_url) });
        return { data: [{ slot_id: id }], error: null };
      }
      throw new Error(`unexpected ${table}`);
    };
    const b = {
      select: () => b,
      update: (v: Record<string, unknown>) => ((op = 'update'), (payload = v), b),
      eq: (k: string, v: unknown) => ((eqs[k] = v), b),
      in: () => b,
      order: () => b,
      limit: () => b,
      maybeSingle: async () => result(),
      then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve().then(result).then(ok, bad),
    };
    return b;
  };
  const client = { auth: { getUser: async () => ({ data: { user: { id: 'me', app_metadata: { role } } } }) }, from } as unknown as Db;
  return { client, updates, pairs };
}

// A fake Graph: every createOrGet for the same externalId returns the same meeting (as Microsoft does). `fail` lists
// slot ids Graph answers with an error; `closed` returns meetings without the open settings so a PATCH follows.
function fakeGraph(opts: { fail?: string[]; closed?: boolean } = {}) {
  const meetings = new Map<string, string>();
  const calls: { method: string; url: string; body: Record<string, unknown> }[] = [];
  const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    calls.push({ method: String(init?.method), url: String(url), body });
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer at-1');
    if (init?.method === 'PATCH') return new Response(JSON.stringify({ id: 'm', ...body }), { status: 200 });
    const id = String(body.externalId);
    if (opts.fail?.includes(id)) return new Response('{"error":{}}', { status: 500 });
    if (!meetings.has(id)) meetings.set(id, `https://teams.microsoft.com/l/meetup-join/19%3ameeting_${id}%40thread.v2/0`);
    const settings = opts.closed ? { allowedPresenters: 'organizer', lobbyBypassSettings: { scope: 'organization', isDialInBypassEnabled: false } } : { allowedPresenters: 'everyone', lobbyBypassSettings: { scope: 'everyone', isDialInBypassEnabled: true } };
    return new Response(JSON.stringify({ id: `meeting-${id}`, joinWebUrl: meetings.get(id), ...settings }), { status: 201 });
  });
  return { f: f as unknown as typeof fetch, calls, meetings };
}

// A token getter that always works. A fresh spy each time, so call counts never mix between tests.
const okToken = async (): Promise<TokenResult> => ({ ok: true, accessToken: 'at-1' });

const SLOTS: Slot[] = [
  { id: 's1', startsAt: FUTURE, code: 'BTX-0101', name: 'Ada Okafor', pair: true, url: null },
  { id: 's2', startsAt: FUTURE, code: 'BTX-0102', name: 'Ben Ito', pair: true, url: 'https://meet.google.com/abc-defg-hij' },
  { id: 's3', startsAt: FUTURE, code: 'BTX-0103', name: 'Cy Diaz', pair: true, url: 'https://teams.microsoft.com/l/meetup-join/already' },
  { id: 's4', startsAt: FUTURE, code: 'BTX-0104', name: 'Di Lee', pair: false, url: null },
  { id: 's5', startsAt: PAST, code: 'BTX-0105', name: 'Ed Moe', pair: true, url: null },
];

describe('makeTeamsLinks', () => {
  it('is admin only, and asks Teams nothing for anyone else', async () => {
    const { client, updates } = fakeDb('board', SLOTS);
    const g = fakeGraph();
    const token = vi.fn(okToken);
    expect(await makeTeamsLinks(client, { token, fetch: g.f, now: NOW })).toEqual({ ok: false, message: 'Only board members with admin rights can make Teams links.' });
    expect(token).not.toHaveBeenCalled();
    expect(g.calls).toEqual([]);
    expect(updates).toEqual([]);
  });

  it('makes links for paired interviews ahead with no link or a non-Teams link, and counts', async () => {
    const { client, updates } = fakeDb('admin', SLOTS);
    const g = fakeGraph();
    const r = await makeTeamsLinks(client, { token: okToken, fetch: g.f, now: NOW });
    expect(r).toMatchObject({ ok: true, cycleId: 'c1', made: 2, had: 1, failed: 0 });
    // s1 (no link) and s2 (a Meet link) get Teams links; s3 already had one; s4 has no pair; s5 is past.
    expect(updates.map((u) => u.slotId)).toEqual(['s1', 's2']);
    expect(updates.every((u) => u.url.startsWith('https://teams.microsoft.com/'))).toBe(true);
    const posts = g.calls.filter((c) => c.method === 'POST');
    expect(posts.map((c) => c.url)).toEqual([`${GRAPH_MEETINGS}/createOrGet`, `${GRAPH_MEETINGS}/createOrGet`]);
    expect(posts[0].body).toEqual({
      externalId: 's1',
      startDateTime: FUTURE,
      endDateTime: end(FUTURE),
      subject: 'BTX scholarship interview BTX-0101',
      lobbyBypassSettings: { scope: 'everyone', isDialInBypassEnabled: true },
      allowedPresenters: 'everyone',
    });
    // No student name in anything sent to Microsoft.
    expect(JSON.stringify(g.calls)).not.toMatch(/Ada|Okafor|Ben Ito/);
  });

  it('is idempotent: a second run makes nothing and never calls Teams', async () => {
    const { client } = fakeDb('admin', SLOTS);
    const g = fakeGraph();
    await makeTeamsLinks(client, { token: okToken, fetch: g.f, now: NOW });
    const before = g.calls.length;
    const token = vi.fn(okToken);
    expect(await makeTeamsLinks(client, { token, fetch: g.f, now: NOW })).toMatchObject({ ok: true, made: 0, had: 3, failed: 0, links: [] });
    expect(g.calls.length).toBe(before);
    expect(token).not.toHaveBeenCalled();
  });

  it('a retry after a failure reuses the same meeting (createOrGet by slot id)', async () => {
    const { client, pairs } = fakeDb('admin', SLOTS, { updateFails: ['s2'] });
    const g = fakeGraph();
    expect(await makeTeamsLinks(client, { token: okToken, fetch: g.f, now: NOW })).toMatchObject({ ok: true, made: 1, had: 1, failed: 1 });
    expect(g.meetings.size).toBe(2);
    // The save works the second time; Graph hands back the meeting it already made for s2.
    const again = fakeDb('admin', SLOTS.map((s) => ({ ...s, url: pairs.get(s.id)?.url ?? s.url })));
    expect(await makeTeamsLinks(again.client, { token: okToken, fetch: g.f, now: NOW })).toMatchObject({ ok: true, made: 1, had: 2, failed: 0 });
    expect(g.meetings.size).toBe(2);
    expect(again.updates[0]).toEqual({ slotId: 's2', url: g.meetings.get('s2') });
  });

  it('counts Graph failures and keeps going', async () => {
    const { client, updates } = fakeDb('admin', SLOTS);
    const r = await makeTeamsLinks(client, { token: okToken, fetch: fakeGraph({ fail: ['s1'] }).f, now: NOW });
    expect(r).toMatchObject({ ok: true, made: 1, had: 1, failed: 1 });
    expect(updates.map((u) => u.slotId)).toEqual(['s2']);
  });

  it('sets the open meeting settings with a PATCH when createOrGet does not show them', async () => {
    const { client } = fakeDb('admin', SLOTS.slice(0, 1));
    const g = fakeGraph({ closed: true });
    expect(await makeTeamsLinks(client, { token: okToken, fetch: g.f, now: NOW })).toMatchObject({ ok: true, made: 1 });
    const patch = g.calls.find((c) => c.method === 'PATCH');
    expect(patch?.url).toBe(`${GRAPH_MEETINGS}/meeting-s1`);
    expect(patch?.body).toEqual({ lobbyBypassSettings: { scope: 'everyone', isDialInBypassEnabled: true }, allowedPresenters: 'everyone' });
  });

  it('refuses a join link that is not a Teams link', async () => {
    const { client, updates } = fakeDb('admin', SLOTS.slice(0, 1));
    const f = (async () => new Response(JSON.stringify({ id: 'm', joinWebUrl: 'https://teams.microsoft.com.evil.com/x', allowedPresenters: 'everyone', lobbyBypassSettings: { scope: 'everyone', isDialInBypassEnabled: true } }), { status: 201 })) as unknown as typeof fetch;
    expect(await makeTeamsLinks(client, { token: okToken, fetch: f, now: NOW })).toMatchObject({ ok: true, made: 0, failed: 1 });
    expect(updates).toEqual([]);
  });

  it('says "Teams isn\'t connected yet" when there is no sign-in, and changes nothing', async () => {
    const { client, updates } = fakeDb('admin', SLOTS);
    const g = fakeGraph();
    const r = await makeTeamsLinks(client, { token: async () => ({ ok: false, reason: 'not-connected' }), fetch: g.f, now: NOW });
    expect(r).toEqual({ ok: false, message: "Teams isn't connected yet." });
    expect(g.calls).toEqual([]);
    expect(updates).toEqual([]);
  });
});

describe('meetingSubject and teamsLinksLine', () => {
  it('uses only the short code', () => {
    expect(meetingSubject('BTX-0101')).toBe('BTX scholarship interview BTX-0101');
    expect(meetingSubject('—')).toBe('BTX scholarship interview');
    expect(meetingSubject(null)).toBe('BTX scholarship interview');
  });
  it('says what happened in plain words', () => {
    expect(teamsLinksLine({ made: 2, had: 1, failed: 0 })).toBe('Made 2 Teams links. 1 interview already had one.');
    expect(teamsLinksLine({ made: 1, had: 0, failed: 1 })).toBe("Made 1 Teams link. 1 link didn't work. Press Make Teams links again to try it.");
    expect(teamsLinksLine({ made: 0, had: 3, failed: 0 })).toBe('Every paired interview already has a Teams link.');
    expect(teamsLinksLine({ made: 0, had: 0, failed: 0 })).toBe('No paired interviews are waiting for a link.');
  });
});
