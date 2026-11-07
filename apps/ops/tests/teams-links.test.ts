import { describe, expect, it, vi } from 'vitest';
import type { Db } from '@/lib/pairing-db';
import { GRAPH_MEETINGS, meetingSubject, ORG_ONLY_SETTINGS } from '@/lib/teams/graph';
import { makeTeamsLinks, planTeamsLinks, teamsConfirmLine, teamsLinksLine } from '@/lib/teams/links';
import type { TokenResult } from '@/lib/teams/token';

const NOW = new Date('2026-11-06T12:00:00Z');
const FUTURE = '2026-11-12T23:00:00Z';
const SOON = '2026-11-07T02:00:00Z'; // 14 hours ahead: inside the 24-hour hand-check window
const PAST = '2026-11-01T23:00:00Z';
const end = (s: string) => new Date(Date.parse(s) + 30 * 60_000).toISOString();

type Slot = { id: string; app?: string; startsAt: string; code: string; name: string; pair: boolean; url: string | null };

// A small stand-in for the Supabase client: just the calls makeTeamsLinks makes (role, cycle, bookings, pairings,
// applications, and the video_url update), backed by an in-memory list. `updateFails` makes the save fail for a slot.
function fakeDb(role: string, slots: Slot[], opts: { updateFails?: string[] } = {}) {
  const updates: { slotId: string; url: string }[] = [];
  const pairs = new Map(slots.filter((s) => s.pair).map((s) => [s.id, { url: s.url }]));
  const appOf = (s: Slot) => s.app ?? `app-${s.id}`;
  const from = (table: string) => {
    let op: 'select' | 'update' = 'select';
    let payload: Record<string, unknown> = {};
    const eqs: Record<string, unknown> = {};
    const result = () => {
      if (table === 'cycles') return { data: { id: 'c1', interview_start: '2026-10-15', interview_end: '2026-12-01' }, error: null };
      if (table === 'bookings') return { data: slots.map((s) => ({ slot_id: s.id, application_id: appOf(s), interview_slots: { starts_at: s.startsAt, ends_at: end(s.startsAt), cycle_id: 'c1' } })), error: null };
      if (table === 'applications') return { data: slots.map((s) => ({ id: appOf(s), applicant_code: s.code, full_name: s.name })), error: null };
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
// externalIds Graph answers with an error; `patch` decides what the PATCH answers with ('ok' echoes the settings).
function fakeGraph(opts: { fail?: string[]; patch?: 'ok' | 'everyone' | 'error' } = {}) {
  const meetings = new Map<string, { id: string; url: string }>();
  const calls: { method: string; url: string; body: Record<string, unknown> }[] = [];
  const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    calls.push({ method: String(init?.method), url: String(url), body });
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer at-1');
    if (init?.method === 'PATCH') {
      const mode = opts.patch ?? 'ok';
      if (mode === 'error') return new Response('{"error":{}}', { status: 403 });
      const settings = mode === 'everyone' ? { allowedPresenters: 'everyone', lobbyBypassSettings: { scope: 'everyone', isDialInBypassEnabled: true } } : body;
      return new Response(JSON.stringify({ id: String(url).split('/').pop(), ...settings }), { status: 200 });
    }
    const id = String(body.externalId);
    if (opts.fail?.includes(id)) return new Response('{"error":{}}', { status: 500 });
    if (!meetings.has(id)) meetings.set(id, { id: `meeting-${meetings.size + 1}`, url: `https://teams.microsoft.com/l/meetup-join/19%3ameeting_${meetings.size + 1}%40thread.v2/0` });
    const m = meetings.get(id)!;
    // Graph's default meeting: lobby for people outside the organization.
    return new Response(JSON.stringify({ id: m.id, joinWebUrl: m.url, allowedPresenters: 'everyone', lobbyBypassSettings: { scope: 'organization', isDialInBypassEnabled: false } }), { status: 201 });
  });
  return { f: f as unknown as typeof fetch, calls, meetings };
}

// A token getter that always works.
const okToken = async (): Promise<TokenResult> => ({ ok: true, accessToken: 'at-1' });

const SLOTS: Slot[] = [
  { id: 's1', startsAt: FUTURE, code: 'BTX-0101', name: 'Ada Okafor', pair: true, url: null },
  { id: 's2', startsAt: FUTURE, code: 'BTX-0102', name: 'Ben Ito', pair: true, url: 'https://meet.google.com/abc-defg-hij' },
  { id: 's3', startsAt: FUTURE, code: 'BTX-0103', name: 'Cy Diaz', pair: true, url: 'https://teams.microsoft.com/l/meetup-join/already' },
  { id: 's4', startsAt: FUTURE, code: 'BTX-0104', name: 'Di Lee', pair: false, url: null },
  { id: 's5', startsAt: PAST, code: 'BTX-0105', name: 'Ed Moe', pair: true, url: null },
  { id: 's6', startsAt: SOON, code: 'BTX-0106', name: 'Fay Ng', pair: true, url: 'https://zoom.us/j/1' },
  { id: 's7', startsAt: SOON, code: 'BTX-0107', name: 'Gus Ola', pair: true, url: null },
];

describe('planTeamsLinks (the confirm step)', () => {
  it('counts what a run would make, replace, leave, and hand-check', async () => {
    const p = await planTeamsLinks(fakeDb('admin', SLOTS).client, NOW);
    expect(p).toMatchObject({ ok: true, cycleId: 'c1', replacing: 1, had: 1, handCheck: 1 });
    if (!p.ok) throw new Error('plan');
    // s1 and s7 have no link (s7 is soon, but an empty link is still filled); s2 replaces a Meet link; s6 (Zoom, soon) is
    // left for a hand check; s3 already has Teams; s4 is unpaired; s5 is past.
    expect(p.toMake.map((x) => x.slotId)).toEqual(['s7', 's1', 's2']); // in time order
    expect(p.teamsSlotIds.sort()).toEqual(['s1', 's2', 's3', 's7']);
  });
  it('is admin only', async () => {
    expect(await planTeamsLinks(fakeDb('board', SLOTS).client, NOW)).toEqual({ ok: false, message: 'Only board members with admin rights can make Teams links.' });
  });
  it('says the counts in plain words', () => {
    expect(teamsConfirmLine({ toMake: 3, replacing: 1, handCheck: 1 })).toBe(
      "Makes 3 Teams links and emails 3 students and their interviewers. 1 interview already has another link; it will be replaced. 1 interview starts within 24 hours with another link. It needs a hand check and won't change.",
    );
    expect(teamsConfirmLine({ toMake: 1, replacing: 0, handCheck: 0 })).toBe('Makes 1 Teams link and emails 1 student and their interviewers.');
    expect(teamsConfirmLine({ toMake: 0, replacing: 0, handCheck: 0 })).toMatch(/already has a Teams link/);
  });
});

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

  it('makes links, counts, and lists every Teams-linked interview ahead for the emails', async () => {
    const { client, updates } = fakeDb('admin', SLOTS);
    const g = fakeGraph();
    const r = await makeTeamsLinks(client, { token: okToken, fetch: g.f, now: NOW });
    expect(r).toMatchObject({ ok: true, cycleId: 'c1', made: 3, had: 1, failed: 0, handCheck: 1, replaced: ['s2'] });
    if (!r.ok) throw new Error('run');
    expect(updates.map((u) => u.slotId)).toEqual(['s7', 's1', 's2']);
    expect(r.emailSlotIds.sort()).toEqual(['s1', 's2', 's3', 's7']);
  });

  it('sends createOrGet only its documented fields, keyed to the booking', async () => {
    const g = fakeGraph();
    await makeTeamsLinks(fakeDb('admin', SLOTS.slice(0, 1)).client, { token: okToken, fetch: g.f, now: NOW });
    const post = g.calls.find((c) => c.method === 'POST');
    expect(post?.url).toBe(`${GRAPH_MEETINGS}/createOrGet`);
    expect(post?.body).toEqual({ externalId: 's1:app-s1', startDateTime: FUTURE, endDateTime: end(FUTURE), subject: 'BTX scholarship interview BTX-0101' });
    // No student name in anything sent to Microsoft.
    expect(JSON.stringify(g.calls)).not.toMatch(/Ada|Okafor/);
  });

  it('always PATCHes the organization-only lobby rule, never everyone', async () => {
    const g = fakeGraph();
    await makeTeamsLinks(fakeDb('admin', SLOTS.slice(0, 1)).client, { token: okToken, fetch: g.f, now: NOW });
    const patch = g.calls.find((c) => c.method === 'PATCH');
    expect(patch?.url).toBe(`${GRAPH_MEETINGS}/meeting-1`);
    expect(patch?.body).toEqual({ lobbyBypassSettings: { scope: 'organization', isDialInBypassEnabled: false }, allowedPresenters: 'organization' });
    expect(ORG_ONLY_SETTINGS).toEqual(patch?.body);
    expect(JSON.stringify(g.calls)).not.toContain('everyone"');
  });

  it('counts a meeting as failed when the PATCH fails or does not show the organization rule', async () => {
    for (const patch of ['error', 'everyone'] as const) {
      const { client, updates } = fakeDb('admin', SLOTS.slice(0, 1));
      expect(await makeTeamsLinks(client, { token: okToken, fetch: fakeGraph({ patch }).f, now: NOW })).toMatchObject({ ok: true, made: 0, failed: 1 });
      expect(updates).toEqual([]);
    }
  });

  it('gives a slot re-booked by another student its own meeting', async () => {
    const g = fakeGraph();
    const first = fakeDb('admin', [{ ...SLOTS[0], app: 'app-A' }]);
    await makeTeamsLinks(first.client, { token: okToken, fetch: g.f, now: NOW });
    const second = fakeDb('admin', [{ ...SLOTS[0], app: 'app-B' }]);
    await makeTeamsLinks(second.client, { token: okToken, fetch: g.f, now: NOW });
    expect([...g.meetings.keys()]).toEqual(['s1:app-A', 's1:app-B']);
    expect(first.updates[0].url).not.toBe(second.updates[0].url);
  });

  it('is idempotent: a second run makes nothing and never calls Teams', async () => {
    const { client } = fakeDb('admin', SLOTS);
    const g = fakeGraph();
    await makeTeamsLinks(client, { token: okToken, fetch: g.f, now: NOW });
    const before = g.calls.length;
    const token = vi.fn(okToken);
    const r = await makeTeamsLinks(client, { token, fetch: g.f, now: NOW });
    expect(r).toMatchObject({ ok: true, made: 0, had: 4, failed: 0, handCheck: 1, links: [] });
    // The emails still go to every Teams-linked interview; the email log stops repeats.
    expect(r.ok && r.emailSlotIds.sort()).toEqual(['s1', 's2', 's3', 's7']);
    expect(g.calls.length).toBe(before);
    expect(token).not.toHaveBeenCalled();
  });

  it('a retry after a failed save reuses the same meeting', async () => {
    const { client, pairs } = fakeDb('admin', SLOTS.slice(0, 3), { updateFails: ['s2'] });
    const g = fakeGraph();
    const r = await makeTeamsLinks(client, { token: okToken, fetch: g.f, now: NOW });
    expect(r).toMatchObject({ ok: true, made: 1, had: 1, failed: 1 });
    // The failed one is not emailed.
    expect(r.ok && r.emailSlotIds.sort()).toEqual(['s1', 's3']);
    expect(g.meetings.size).toBe(2);
    const again = fakeDb('admin', SLOTS.slice(0, 3).map((s) => ({ ...s, url: pairs.get(s.id)?.url ?? s.url })));
    expect(await makeTeamsLinks(again.client, { token: okToken, fetch: g.f, now: NOW })).toMatchObject({ ok: true, made: 1, had: 2, failed: 0 });
    expect(g.meetings.size).toBe(2);
    expect(again.updates[0]).toEqual({ slotId: 's2', url: g.meetings.get('s2:app-s2')?.url });
  });

  it('counts Graph failures and keeps going', async () => {
    const { client, updates } = fakeDb('admin', SLOTS);
    const r = await makeTeamsLinks(client, { token: okToken, fetch: fakeGraph({ fail: ['s1:app-s1'] }).f, now: NOW });
    expect(r).toMatchObject({ ok: true, made: 2, failed: 1 });
    expect(updates.map((u) => u.slotId)).toEqual(['s7', 's2']);
  });

  it('refuses a join link that is not a Teams link', async () => {
    const { client, updates } = fakeDb('admin', SLOTS.slice(0, 1));
    const f = (async () => new Response(JSON.stringify({ id: 'm', joinWebUrl: 'https://teams.microsoft.com.evil.com/x' }), { status: 201 })) as unknown as typeof fetch;
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
    expect(teamsLinksLine({ made: 2, had: 1, failed: 0, handCheck: 0 })).toBe('Made 2 Teams links.');
    expect(teamsLinksLine({ made: 1, had: 0, failed: 1, handCheck: 0 })).toBe("Made 1 Teams link. 1 link didn't work. Press Make Teams links again to try it.");
    expect(teamsLinksLine({ made: 0, had: 3, failed: 0, handCheck: 0 })).toBe('No new Teams links were needed.');
    expect(teamsLinksLine({ made: 0, had: 0, failed: 0, handCheck: 2 })).toBe('2 interviews need a hand check: they start within 24 hours with another link.');
    expect(teamsLinksLine({ made: 0, had: 0, failed: 0, handCheck: 0 })).toBe('No paired interviews are waiting for a link.');
  });
});
