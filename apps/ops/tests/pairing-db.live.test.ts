// Live test of lib/pairing-db.ts against the LOCAL Supabase stack (never production). Skipped unless LIVE_DB=1:
//   LIVE_DB=1 npx vitest run tests/pairing-db.live.test.ts
// It creates its own "a2-*@btx.test" accounts, applications, slots and bookings in the current published cycle and
// removes them again at the end. It reads the local keys from apps/ops/.env.local and refuses to run on any other URL.
// Needs the local seed (supabase/seed/local-board-test.sql) for a published cycle with interview dates.
// Since the interview flow (20261013090300), availability is stored as free ranges and a booking pairs two people by
// itself; "Re-run pairing" pairs what could not be paired at booking time.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { addInterviewSlots, currentCycle, planPairing, readAvailability, readInterviews, removeInterviewSlot, runPairing, saveMyAvailability, setVideoLinks, swapInterviewer, type Db } from '@/lib/pairing-db';
import { easternToUtc } from '@/lib/pairing-slots';

const live = process.env.LIVE_DB === '1';
const env = (() => {
  if (!live) return {} as Record<string, string>;
  const txt = readFileSync(path.resolve(__dirname, '../.env.local'), 'utf8');
  return Object.fromEntries(txt.split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
})();
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const PW = 'a2-local-test-password';

describe.skipIf(!live)('pairing-db against the local database', () => {
  let svc: SupabaseClient;
  let cycleId = '';
  let window: { start: string; end: string };
  const ids: Record<string, string> = {};
  const clients: Record<string, Db> = {};
  const slotIds: string[] = [];
  const appIds: string[] = [];
  const day = (n: number) => new Date(Date.parse(`${window.start}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const et = (n: number, hhmm: string) => easternToUtc(day(n), hhmm) as string;

  async function user(key: string, role: string, name: string | null) {
    const email = `a2-${key}@btx.test`;
    const made = await svc.auth.admin.createUser({ email, password: PW, email_confirm: true, app_metadata: { role } });
    let id = made.data.user?.id;
    if (!id) {
      const list = await svc.auth.admin.listUsers({ perPage: 200 });
      id = list.data.users.find((u) => u.email === email)?.id;
    }
    if (!id) throw made.error;
    await svc.auth.admin.updateUserById(id, { app_metadata: { role }, password: PW });
    if (name) await svc.from('staff_profiles').upsert({ user_id: id, display_name: name, initials: name.split(' ').map((w) => w[0]).join('') });
    ids[key] = id;
    const c = createClient(URL_, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
    const s = await c.auth.signInWithPassword({ email, password: PW });
    if (s.error) throw s.error;
    clients[key] = c as Db;
  }

  async function book(key: string, code: string, startsAt: string): Promise<string> {
    const a = await svc.from('applications').upsert({ cycle_id: cycleId, user_id: ids[key], terpmail: `a2-${key}@btx.test`, full_name: 'Ada Okafor', agreed_true: true, status: 'submitted', applicant_code: code, submitted_at: new Date().toISOString() }, { onConflict: 'user_id,cycle_id' }).select('id').single();
    if (a.error) throw a.error;
    appIds.push(a.data.id);
    const s = await svc.from('interview_slots').insert({ cycle_id: cycleId, starts_at: startsAt, ends_at: new Date(Date.parse(startsAt) + 30 * 60_000).toISOString() }).select('id').single();
    if (s.error) throw s.error;
    slotIds.push(s.data.id);
    const b = await svc.from('bookings').insert({ application_id: a.data.id, slot_id: s.data.id });
    if (b.error) throw b.error;
    return s.data.id;
  }

  beforeAll(async () => {
    expect(URL_).toBe('http://127.0.0.1:55321');
    svc = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const cy = await currentCycle(svc as Db);
    if (!cy?.interviewStart || !cy.interviewEnd) throw new Error('the local cycle needs interview dates');
    cycleId = cy.id;
    window = { start: cy.interviewStart, end: cy.interviewEnd };
    await user('admin', 'admin', 'A2 Admin');
    await user('b1', 'board', 'A2 Ada Board');
    await user('b2', 'board', 'A2 Bea Board');
    await user('b3', 'board', 'A2 Cy Board');
    await user('rev', 'volunteer', 'A2 Not Staff');
    await user('app1', 'applicant', null);
    await user('app2', 'applicant', null);
    await user('app3', 'applicant', null);
  }, 60_000);

  afterAll(async () => {
    if (!live) return;
    await svc.from('board_free_ranges').delete().in('user_id', Object.values(ids));
    await svc.from('board_interview_prefs').delete().in('user_id', Object.values(ids));
    await svc.from('interview_slots').delete().in('id', slotIds); // pairings go with the slot
    // bookings use ON DELETE RESTRICT on the slot, so they are removed first
  });

  it('a board member saves only their own availability, inside the interview dates (stored as ranges)', async () => {
    const r = await saveMyAvailability(clients.b1, [{ day: day(1), block: 'morning' }, { day: day(1), block: 'evening' }]);
    expect(r).toMatchObject({ ok: true, saved: 2 });
    // replace: drops the evening, adds the afternoon
    expect(await saveMyAvailability(clients.b1, [{ day: day(1), block: 'morning' }, { day: day(1), block: 'afternoon' }])).toMatchObject({ ok: true });
    for (const k of ['b2', 'b3']) expect(await saveMyAvailability(clients[k], [{ day: day(1), block: 'morning' }])).toMatchObject({ ok: true });
    const cy = (await currentCycle(clients.b1))!;
    const mine = await readAvailability(clients.b1, cy);
    expect(mine.mine.map((m) => `${m.day}|${m.block}`).sort()).toEqual([`${day(1)}|afternoon`, `${day(1)}|morning`]);
    const all = await readAvailability(clients.admin, cy);
    expect(new Set(all.everyone.map((a) => a.userId))).toEqual(new Set([ids.b1, ids.b2, ids.b3]));
    expect(all.days).toContain(day(1));
    // Morning + afternoon on one day is one range, 9:00 to 17:00.
    const rows = await svc.from('board_free_ranges').select('day, start_min, end_min').eq('user_id', ids.b1).eq('cycle_id', cycleId);
    expect(rows.data).toEqual([{ day: day(1), start_min: 540, end_min: 1020 }]);
  });

  it('rejects availability outside the window, a bad block, and non-board accounts', async () => {
    expect(await saveMyAvailability(clients.b1, [{ day: '2030-01-01', block: 'morning' }])).toMatchObject({ ok: false });
    expect(await saveMyAvailability(clients.b1, [{ day: day(1), block: 'night' }])).toMatchObject({ ok: false });
    expect(await saveMyAvailability(clients.app1, [{ day: day(1), block: 'morning' }])).toMatchObject({ ok: false });
    expect(await saveMyAvailability(clients.rev, [{ day: day(1), block: 'morning' }])).toMatchObject({ ok: false });
  });

  let slotA = '';
  let slotB = '';
  let slotC = '';
  const before = () => new Date(Date.parse(`${window.start}T00:00:00Z`) - 86_400_000);
  it('pairs two different free people when a student books, spreading the load', async () => {
    slotA = await book('app1', 'APP-2026-A2001', et(1, '09:00'));
    slotB = await book('app2', 'APP-2026-A2002', et(1, '09:30'));
    const cy = (await currentCycle(clients.admin))!;
    const { pairs } = await readInterviews(clients.admin, cy.id);
    const a = pairs.get(slotA)!;
    const b = pairs.get(slotB)!;
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a.a).not.toBe(a.b);
    expect(new Set([a.a, a.b, b.a, b.b]).size).toBeGreaterThanOrEqual(3); // fewest interviews: load is spread
  });

  it('re-runs pairing as admin only, for interviews nobody could take at booking time, and never moves a set pair', async () => {
    // Nobody is free on day 2 yet, so this booking stays unpaired.
    slotC = await book('app3', 'APP-2026-A2003', et(2, '09:00'));
    const cy = (await currentCycle(clients.admin))!;
    expect((await readInterviews(clients.admin, cy.id)).pairs.has(slotC)).toBe(false);
    for (const k of ['b2', 'b3']) expect(await saveMyAvailability(clients[k], [{ day: day(1), block: 'morning' }, { day: day(2), block: 'morning' }])).toMatchObject({ ok: true });
    expect(await runPairing(clients.b1)).toMatchObject({ ok: false });
    expect(await planPairing(clients.b1)).toMatchObject({ ok: false });
    const plan = await planPairing(clients.admin, before());
    expect(plan).toMatchObject({ ok: true });
    const r = await runPairing(clients.admin, before());
    expect(r).toMatchObject({ ok: true, paired: 1, uncovered: 0 });
    const { pairs } = await readInterviews(clients.admin, cy.id);
    expect(new Set([pairs.get(slotC)!.a, pairs.get(slotC)!.b])).toEqual(new Set([ids.b2, ids.b3]));
    const keepA = pairs.get(slotA)!;
    const again = await runPairing(clients.admin, before());
    expect(again).toMatchObject({ ok: true, paired: 0 });
    expect((await readInterviews(clients.admin, cy.id)).pairs.get(slotA)).toMatchObject({ a: keepA.a, b: keepA.b });
  });

  it('lets an admin swap one interviewer, and refuses bad swaps and non-admins', async () => {
    const cy = (await currentCycle(clients.admin))!;
    const cur = (await readInterviews(clients.admin, cy.id)).pairs.get(slotA)!;
    const outsider = [ids.b1, ids.b2, ids.b3].find((u) => u !== cur.a && u !== cur.b)!;
    expect(await swapInterviewer(clients.b1, slotA, cur.a, outsider)).toMatchObject({ ok: false });
    expect(await swapInterviewer(clients.admin, slotA, cur.a, cur.b)).toMatchObject({ ok: false });
    expect(await swapInterviewer(clients.admin, slotA, ids.app1, outsider)).toMatchObject({ ok: false });
    expect(await swapInterviewer(clients.admin, slotA, cur.a, ids.app1)).toMatchObject({ ok: false });
    // The admin gave no availability, so they cannot take it.
    expect(await swapInterviewer(clients.admin, slotA, cur.a, ids.admin)).toMatchObject({ ok: false });
    expect(await swapInterviewer(clients.admin, slotA, cur.a, outsider)).toEqual({ ok: true });
    const after = (await readInterviews(clients.admin, cy.id)).pairs.get(slotA)!;
    expect(new Set([after.a, after.b])).toEqual(new Set([cur.b, outsider]));
  });

  it('sets one video link per paired interview and the student sees it through my_interview', async () => {
    expect(await setVideoLinks(clients.b1, [{ slotId: slotA, url: 'https://meet.example.org/a2' }])).toMatchObject({ ok: false });
    expect(await setVideoLinks(clients.admin, [{ slotId: slotA, url: 'http://insecure.example.org' }])).toMatchObject({ ok: false });
    expect(await setVideoLinks(clients.admin, [{ slotId: slotA, url: 'https://meet.example.org/a2-one' }, { slotId: slotB, url: 'https://meet.example.org/a2-two' }])).toMatchObject({ ok: true, saved: 2 });
    const mine = await clients.app1.rpc('my_interview', { p_cycle_id: cycleId });
    expect(mine.error).toBeNull();
    expect(mine.data.videoUrl).toBe('https://meet.example.org/a2-one');
    expect(mine.data.interviewers).toHaveLength(2);
    const other = await clients.app2.rpc('my_interview', { p_cycle_id: cycleId });
    expect(other.data.videoUrl).toBe('https://meet.example.org/a2-two');
    // a slot with no pair cannot take a link
    const s = await svc.from('interview_slots').insert({ cycle_id: cycleId, starts_at: `${day(2)}T11:40:00.000Z`, ends_at: `${day(2)}T12:10:00.000Z` }).select('id').single();
    slotIds.push(s.data!.id);
    expect(await setVideoLinks(clients.admin, [{ slotId: s.data!.id, url: 'https://meet.example.org/none' }])).toMatchObject({ ok: false });
  });

  it('adds interview times for admins inside the window and removes unbooked ones only', async () => {
    const entries = [{ date: day(0), startTime: '06:50' }];
    expect(await addInterviewSlots(clients.b1, entries, new Date('2026-01-01'))).toMatchObject({ ok: false });
    expect(await addInterviewSlots(clients.admin, [{ date: '2030-01-01', startTime: '10:00' }], new Date('2026-01-01'))).toMatchObject({ ok: false });
    const added = await addInterviewSlots(clients.admin, entries, new Date('2026-01-01'));
    expect(added).toMatchObject({ ok: true, added: 1 });
    expect(await addInterviewSlots(clients.admin, entries, new Date('2026-01-01'))).toMatchObject({ ok: false }); // already there
    const mine = await svc.from('interview_slots').select('id, starts_at, ends_at').eq('cycle_id', cycleId).eq('starts_at', `${day(0)}T10:50:00+00:00`);
    expect(mine.data).toHaveLength(1);
    const id = mine.data![0].id;
    expect(Date.parse(mine.data![0].ends_at) - Date.parse(mine.data![0].starts_at)).toBe(30 * 60_000);
    expect(await removeInterviewSlot(clients.b1, id)).toMatchObject({ ok: false });
    expect(await removeInterviewSlot(clients.admin, slotA)).toMatchObject({ ok: false }); // booked
    expect(await removeInterviewSlot(clients.admin, id)).toEqual({ ok: true });
    expect(await removeInterviewSlot(clients.admin, id)).toMatchObject({ ok: false });
  });

  it('cleans up the bookings so the slots can go', async () => {
    await svc.from('bookings').delete().in('slot_id', slotIds);
    await svc.from('applications').delete().in('id', appIds);
  });
});
